import { agentAnalysis } from "../../../../rust/agent-analysis.mjs";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import type {
	ProviderNativeEvent,
	ProviderNativePayload,
} from "@/agent/codex-conversation";
import { configuredCodexBinary } from "@/server/codex-config";
import { ensureOpenCutWorkspaceConfig } from "@/server/codex-workspace-config";
import type { AgentEndpointRuntime } from "@/server/agent-settings";

const REQUEST_TIMEOUT_MS = 30_000;
const MCP_REQUEST_TIMEOUT_MS = 120_000;
const TURN_IDLE_TIMEOUT_MS = 6 * 60 * 1_000;
const TURN_RECONCILE_INTERVAL_MS = 15_000;
const CAPABILITIES_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_STDERR_CHARS = 16_384;
const MAX_PROTOCOL_DETAIL_CHARS = 8_000;
const MAX_PROJECT_SNAPSHOT_CHARS = 120_000;
const THREAD_PERSISTENCE_RETRY_MS = 40;
const THREAD_PERSISTENCE_MAX_ATTEMPTS = 5;
const SHARED_HOST_START_TIMEOUT_MS = 12_000;
const SHARED_HOST_READY_RETRY_MS = 80;
const DEFAULT_SHARED_APP_SERVER_URL = "ws://127.0.0.1:48721";
const REQUIRED_OPENCUT_TOOLS = ["read_project", "edit_project"] as const;
const BLOCKED_MCP_SERVERS = new Set(["localcut"]);
const VERIFY_MCP_SERVERS = new Set([
	"node_repl",
	"computer-use",
	"openaiDeveloperDocs",
]);

export type CodexToolProfile = "edit" | "verify" | "full";
export type CodexVisualMode = "off" | "auto";
export type CodexVerificationMode = "off" | "basic" | "full";
export type CodexCollaborationMode = "default" | "plan";

export interface CodexRuntimeConfig {
	binary: string;
	repoRoot: string;
	appWorkspaceRoot?: string;
	mcpServerPath: string;
	projectFilesDir: string;
	baseUrl: string;
	sharedAppServerUrl: string;
	disabledMcpServers?: string[];
	endpoint?: AgentEndpointRuntime;
}

export type CodexDesktopThreadSync = (threadId: string) => Promise<void> | void;

export interface CodexChatInput {
	projectId: string;
	message: string;
	messageId?: string;
	context: string;
	sessionId?: string;
	conversationId?: string;
	model?: string;
	effort?: string;
	mode?: CodexCollaborationMode;
	toolProfile?: CodexToolProfile;
	visualMode?: CodexVisualMode;
	verificationMode?: CodexVerificationMode;
}

export type CodexProtocolStatus =
	"started" | "streaming" | "completed" | "failed" | "info";

export interface CodexProtocolFrame {
	id: string;
	method: string;
	threadId: string;
	turnId?: string;
	itemId?: string;
	itemType?: string;
	status: CodexProtocolStatus;
	title: string;
	detail?: string;
	append?: boolean;
}

export type CodexChatEvent =
	| { type: "session"; sessionId: string }
	| { type: "turn"; sessionId: string; turnId: string }
	| { type: "delta"; delta: string }
	| ({ type: "protocol" } & CodexProtocolFrame)
	| { type: "native"; event: ProviderNativeEvent }
	| { type: "error"; message: string }
	| { type: "done"; sessionId: string; message: string };

export interface CodexModelCapability {
	id: string;
	label: string;
	description: string | null;
	efforts: string[];
	defaultEffort: string | null;
	inputModalities: string[];
	isDefault: boolean;
}

export interface CodexModeCapability {
	id: CodexCollaborationMode;
	label: string;
	defaultEffort: string | null;
}

export interface CodexSkillCapability {
	name: string;
	description: string | null;
	enabled: boolean;
}

export interface CodexToolProfileCapability {
	id: CodexToolProfile;
	label: string;
	description: string;
}

export interface CodexCapabilities {
	models: CodexModelCapability[];
	modes: CodexModeCapability[];
	skills: CodexSkillCapability[];
	toolProfiles: CodexToolProfileCapability[];
}

export interface CodexThreadMessage {
	id: string;
	role: "user" | "assistant" | "error";
	content: string;
	turnId: string;
	streaming?: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface CodexThreadHistory {
	sessionId: string;
	title: string;
	messages: CodexThreadMessage[];
	createdAt: number;
	updatedAt: number;
}

export interface CodexAppServerSubscription extends AsyncIterable<unknown> {
	close(): void;
}

export interface CodexAppServerConnection {
	request(input: { method: string; params: unknown }): Promise<unknown>;
	subscribe(threadId: string): CodexAppServerSubscription;
}

export type CodexAppServerConnector = (input: {
	runtime: CodexRuntimeConfig;
	toolProfile?: CodexToolProfile;
}) => Promise<CodexAppServerConnection>;

export interface CodexChatService {
	stream(input: {
		input: CodexChatInput;
		signal?: AbortSignal;
	}): AsyncIterable<CodexChatEvent>;
	capabilities(input?: {
		toolProfile?: CodexToolProfile;
	}): Promise<CodexCapabilities>;
	steer(input: {
		sessionId: string;
		turnId: string;
		message: string;
		toolProfile?: CodexToolProfile;
	}): Promise<void>;
	interrupt(input: {
		sessionId: string;
		turnId: string;
		toolProfile?: CodexToolProfile;
	}): Promise<void>;
	compact(input: {
		sessionId: string;
		toolProfile?: CodexToolProfile;
	}): Promise<void>;
	readThread(input: {
		sessionId: string;
		toolProfile?: CodexToolProfile;
	}): Promise<CodexThreadHistory>;
}

export class CodexChatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CodexChatError";
	}
}

export function codexRequestTimeoutMs(method: string): number {
	return method === "mcpServerStatus/list" || method === "mcpServer/tool/call"
		? MCP_REQUEST_TIMEOUT_MS
		: REQUEST_TIMEOUT_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function tomlString(value: string): string {
	return JSON.stringify(value);
}

export function codexGatewayBaseUrl(baseUrl: string): string {
	const normalized = baseUrl.replace(/\/+$/, "");
	return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function mcpServerAllowed({
	serverName,
	toolProfile,
}: {
	serverName: string;
	toolProfile: CodexToolProfile;
}): boolean {
	if (serverName === "opencut") return true;
	if (BLOCKED_MCP_SERVERS.has(serverName)) return false;
	if (toolProfile === "full") return true;
	return toolProfile === "verify" && VERIFY_MCP_SERVERS.has(serverName);
}

function commonCodexConfigArgs({
	runtime,
	toolProfile,
}: {
	runtime: CodexRuntimeConfig;
	toolProfile: CodexToolProfile;
}): string[] {
	const configuredNames = new Set(runtime.disabledMcpServers ?? []);
	configuredNames.add("localcut");
	const disabledMcpArgs = Array.from(configuredNames)
		.filter(
			(serverName) =>
				/^[A-Za-z0-9_-]+$/.test(serverName) &&
				!mcpServerAllowed({ serverName, toolProfile }),
		)
		.flatMap((serverName) => ["-c", `mcp_servers.${serverName}.enabled=false`]);
	const endpointArgs =
		runtime.endpoint?.mode === "custom"
			? [
					"-c",
					'model_provider="moirai_gateway"',
					"-c",
					'model_providers.moirai_gateway.name="Moirai Cut Gateway"',
					"-c",
					`model_providers.moirai_gateway.base_url=${tomlString(codexGatewayBaseUrl(runtime.endpoint.baseUrl))}`,
					"-c",
					'model_providers.moirai_gateway.env_key="MOIRAI_CODEX_GATEWAY_KEY"',
					"-c",
					'model_providers.moirai_gateway.wire_api="responses"',
				]
			: [];
	return [
		"-c",
		'approval_policy="never"',
		"-c",
		'sandbox_mode="read-only"',
		...endpointArgs,
		...disabledMcpArgs,
		"-c",
		"mcp_servers.opencut.enabled=true",
		"-c",
		'mcp_servers.opencut.command="bun"',
		"-c",
		`mcp_servers.opencut.args=${JSON.stringify([runtime.mcpServerPath])}`,
		"-c",
		`mcp_servers.opencut.cwd=${tomlString(runtime.repoRoot)}`,
		"-c",
		`mcp_servers.opencut.env.OPENCUT_BASE_URL=${tomlString(runtime.baseUrl)}`,
		"-c",
		`mcp_servers.opencut.env.OPENCUT_PROJECTS_DIR=${tomlString(runtime.projectFilesDir)}`,
	];
}

function assertLoopbackWebSocketUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new CodexChatError("Codex 共享宿主 URL 无效。");
	}
	const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
	if (url.protocol !== "ws:" || !loopbackHosts.has(url.hostname)) {
		throw new CodexChatError("Codex 共享宿主必须使用本机 loopback WebSocket。");
	}
	return url;
}

export function buildCodexSharedHostArgs({
	runtime,
}: {
	runtime: CodexRuntimeConfig;
}): string[] {
	assertLoopbackWebSocketUrl(runtime.sharedAppServerUrl);
	return [
		"app-server",
		"--listen",
		runtime.sharedAppServerUrl,
		...commonCodexConfigArgs({ runtime, toolProfile: "full" }),
	];
}

export function buildCodexPrompt({
	projectId,
	message,
	context,
	projectSnapshot = "",
	mode = "default",
	toolProfile = "edit",
	verificationMode = "off",
}: CodexChatInput & { projectSnapshot?: string }): string {
	const planning = mode === "plan";
	const toolGuidance =
		toolProfile === "full"
			? "- 本轮可按需使用共享宿主中已配置的其他能力，但工程读写仍只能使用 opencut MCP。"
			: toolProfile === "verify"
				? "- 本轮以 opencut MCP 为主，可使用浏览器、桌面和文档工具做必要验收；不要调用无关能力。"
				: "- 本轮只使用 opencut MCP 完成剪辑，不要调用共享宿主中的其他工具。";
	return [
		"你正在 Moirai Cut 编辑器的“智能剪辑”直接 Codex 会话中。",
		`唯一允许操作的工程 ID：${projectId}`,
		"",
		"本轮系统预绑定：",
		"- Moirai Cut MCP 已由系统验证就绪，服务器名为 opencut，工具入口已直接暴露给当前会话。",
		"- 当前工程摘要已由系统预读；编辑器中的当前选区、播放头和显式引用也已随本消息提供。",
		"- 不要声称没有 Moirai Cut 工具、正在连接或正在查找 Moirai Cut MCP；不要自行连接或启动 MCP。若后续调用失败，只报告具体调用错误。",
		"",
		"工作方式：",
		planning
			? "- 这是规划型会话。读取和分析工程后给出可执行计划，不要调用 edit_project 修改工程。"
			: "- 这是执行型会话。用户提出明确的剪辑要求时，直接执行，不要只给计划。",
		"- 任何工程读取和改动都必须使用兼容名为 opencut 的 Moirai Cut MCP；不要修改 Moirai Cut 源码仓库。",
		toolGuidance,
		"- 这是 Moirai Cut 工程，不是 LocalCut 任务。不要读取、调用或套用 LocalCut、localcut-native-video 技能、MCP、运行时或工作流。",
		"- 当前运行在内置浏览器，使用 read_project 和 edit_project 这组文件工具读取及修改工程。",
		"- 不要调用 status、get_context、open_editor、reveal_context 等依赖 Chrome 9222 的标签页工具；引用上下文已随本消息提供。",
		"- 若上下文包含时间段且任务需要理解画面，调用 inspect_timeline_range；若要先理解某个完整源视频，调用 inspect_media_scenes。",
		"- 你能直接看上述工具返回的联系表图片并做多模态判断。可复用的素材理解结果用 save_media_analysis 写入素材 JSON 目录。",
		verificationMode === "full"
			? "- 系统会在本轮完成后采集合成画面和结构检查，发起只读视觉复核；发现明确问题时最多允许一次针对性修正并重新复核。遵守用户的保留要求和 revision 协议，未检查到的声音、运动和细节必须如实标注。"
			: verificationMode === "basic"
				? "- 系统会在本轮完成后轻量核对工程 revision，不会阻塞回复去等待编辑器或渲染验收画面。"
				: "- 按任务风险使用必要的读取与验证工具；不要为了展示过程执行无关检查。",
		"- 不要套用本地模板或最低素材数量规则。信息足够时自主判断并完成。",
		"- 当前回合可能收到用户追加指令，始终以最新指令为准。完成后用简洁中文说明实际做了什么；若未改动，明确说明原因。",
		"",
		"当前编辑器上下文：",
		context.trim() || "未附加素材或时间轴引用；可通过 read_project 读取工程。",
		"",
		"当前工程摘要（系统通过 opencut.read_project 预读）：",
		projectSnapshot.trim() || "工程摘要读取失败；不要继续执行。",
		"",
		"用户消息：",
		message.trim(),
	].join("\n");
}

function buildOpenCutThreadInstructions(projectId: string): string {
	return [
		"你是 Moirai Cut 编辑器的智能剪辑 Agent。",
		`唯一允许操作的工程 ID：${projectId}`,
		"所有工程读取和修改必须使用兼容名为 opencut 的 Moirai Cut MCP，不要修改 Moirai Cut 源码。",
		"不要使用 LocalCut、localcut-native-video 或 localcut MCP。",
		"继续会话时先读取工程的最新 revision，再基于用户最新指令编辑。",
		"用户从 Codex App 继续对话时，当前工作区的项目级配置会提供 opencut MCP。",
	].join("\n");
}

function visibleThreadName(name: string): string {
	const normalized = name.trim().replace(/\s+/g, " ");
	return (normalized || "Moirai Cut 智能剪辑").slice(0, 80);
}

function passthroughEnvironment(
	runtime: CodexRuntimeConfig,
): NodeJS.ProcessEnv {
	const keys = [
		"PATH",
		"HOME",
		"USER",
		"SHELL",
		"TMPDIR",
		"LANG",
		"LC_ALL",
		"CODEX_HOME",
		"HTTP_PROXY",
		"HTTPS_PROXY",
		"ALL_PROXY",
		"NO_PROXY",
		"http_proxy",
		"https_proxy",
		"all_proxy",
		"no_proxy",
	] as const;
	const env: NodeJS.ProcessEnv = {
		NODE_ENV: process.env.NODE_ENV ?? "production",
		OPENCUT_BASE_URL: runtime.baseUrl,
		OPENCUT_PROJECTS_DIR: runtime.projectFilesDir,
		NO_COLOR: "1",
	};
	for (const key of keys) {
		const value = process.env[key];
		if (value !== undefined) env[key] = value;
	}
	if (runtime.endpoint?.mode === "custom") {
		env.MOIRAI_CODEX_GATEWAY_KEY = runtime.endpoint.credential;
	}
	return env;
}

interface NotificationWaiter {
	resolve(result: IteratorResult<unknown>): void;
	reject(error: Error): void;
}

class AppServerSubscription
	implements CodexAppServerSubscription, AsyncIterator<unknown>
{
	private readonly queued: unknown[] = [];
	private readonly waiters: NotificationWaiter[] = [];
	private closed = false;
	private failure: Error | null = null;

	constructor(private readonly onClose: () => void) {}

	push(notification: unknown): void {
		if (this.closed) return;
		const waiter = this.waiters.shift();
		if (waiter) {
			waiter.resolve({ value: notification, done: false });
			return;
		}
		this.queued.push(notification);
	}

	fail(error: Error): void {
		if (this.closed) return;
		this.failure = error;
		this.closed = true;
		this.onClose();
		for (const waiter of this.waiters.splice(0)) waiter.reject(error);
	}

	next(): Promise<IteratorResult<unknown>> {
		const queued = this.queued.shift();
		if (queued !== undefined) {
			return Promise.resolve({ value: queued, done: false });
		}
		if (this.failure) return Promise.reject(this.failure);
		if (this.closed) return Promise.resolve({ value: undefined, done: true });
		return new Promise((resolve, reject) => {
			this.waiters.push({ resolve, reject });
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.onClose();
		for (const waiter of this.waiters.splice(0)) {
			waiter.resolve({ value: undefined, done: true });
		}
	}

	[Symbol.asyncIterator](): AsyncIterator<unknown> {
		return this;
	}
}

interface PendingRpcRequest {
	resolve(value: unknown): void;
	reject(error: Error): void;
	timer: ReturnType<typeof setTimeout>;
}

interface CodexAppServerChildProcess {
	stdin: Pick<NodeJS.WritableStream, "write">;
	stdout: NodeJS.ReadableStream;
	stderr: NodeJS.ReadableStream;
	on(event: "error", listener: (error: Error) => void): unknown;
	on(event: "close", listener: (code: number | null) => void): unknown;
}

export interface CodexAppServerWebSocket {
	readonly readyState: number;
	send(data: string): void;
	close(): void;
	addEventListener(
		event: "open" | "message" | "error" | "close",
		listener: (event: unknown) => void,
	): void;
	removeEventListener(
		event: "open" | "message" | "error" | "close",
		listener: (event: unknown) => void,
	): void;
}

export class CodexAppServerRpcClient implements CodexAppServerConnection {
	private nextRequestId = 0;
	private readonly pending = new Map<number, PendingRpcRequest>();
	private readonly subscriptions = new Map<
		string,
		Set<AppServerSubscription>
	>();
	private stderr = "";
	isOpen = true;

	constructor(private readonly child: CodexAppServerChildProcess) {
		const lines = createInterface({ input: child.stdout });
		lines.on("line", (line) => this.handleLine(line));
		child.stderr.on("data", (chunk: Buffer) => {
			this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(
				-MAX_STDERR_CHARS,
			);
		});
		child.on("error", (error) => this.fail(error));
		child.on("close", (code) => {
			this.fail(
				new CodexChatError(
					this.stderr.trim() ||
						`Codex app-server 已退出，状态码 ${code ?? "unknown"}。`,
				),
			);
		});
	}

	async initialize(): Promise<void> {
		await this.request({
			method: "initialize",
			params: {
				clientInfo: {
					name: "opencut_smart_edit",
					title: "Moirai Cut 智能剪辑",
					version: "1.0.0",
				},
				capabilities: {
					experimentalApi: true,
					requestAttestation: false,
					optOutNotificationMethods: [
						"turn/diff/updated",
						"item/reasoning/textDelta",
						"command/exec/outputDelta",
						"process/outputDelta",
					],
				},
			},
		});
		this.notify({ method: "initialized" });
	}

	request({
		method,
		params,
	}: {
		method: string;
		params: unknown;
	}): Promise<unknown> {
		if (!this.isOpen) {
			return Promise.reject(new CodexChatError("Codex app-server 未连接。"));
		}
		const id = (this.nextRequestId += 1);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new CodexChatError(`Codex ${method} 请求超时。`));
			}, codexRequestTimeoutMs(method));
			this.pending.set(id, { resolve, reject, timer });
			this.write({ method, id, params });
		});
	}

	subscribe(threadId: string): CodexAppServerSubscription {
		const subscriptions =
			this.subscriptions.get(threadId) ?? new Set<AppServerSubscription>();
		this.subscriptions.set(threadId, subscriptions);
		const subscription = new AppServerSubscription(() => {
			subscriptions.delete(subscription);
			if (subscriptions.size === 0) this.subscriptions.delete(threadId);
		});
		subscriptions.add(subscription);
		return subscription;
	}

	private notify({
		method,
		params,
	}: {
		method: string;
		params?: unknown;
	}): void {
		this.write(params === undefined ? { method } : { method, params });
	}

	private write(message: unknown): void {
		try {
			this.child.stdin.write(`${JSON.stringify(message)}\n`);
		} catch (error) {
			this.fail(
				error instanceof Error
					? error
					: new CodexChatError("无法向 Codex app-server 写入消息。"),
			);
		}
	}

	private handleServerRequest(message: Record<string, unknown>): boolean {
		if (
			(typeof message.id !== "number" && typeof message.id !== "string") ||
			typeof message.method !== "string" ||
			!isRecord(message.params)
		) {
			return false;
		}

		if (message.method === "mcpServer/elicitation/request") {
			const meta = isRecord(message.params._meta) ? message.params._meta : null;
			const persist = Array.isArray(meta?.persist) ? meta.persist : [];
			const isOpenCutToolApproval =
				message.params.serverName === "opencut" &&
				meta?.codex_approval_kind === "mcp_tool_call";
			const threadId =
				typeof message.params.threadId === "string"
					? message.params.threadId
					: null;
			if (threadId) {
				for (const subscription of this.subscriptions.get(threadId) ?? []) {
					subscription.push(message);
				}
			}
			this.write({
				id: message.id,
				result: isOpenCutToolApproval
					? {
							action: "accept",
							content: null,
							_meta: persist.includes("session")
								? { persist: "session" }
								: null,
						}
					: {
							action: "decline",
							content: null,
							_meta: null,
						},
			});
			return true;
		}

		this.write({
			id: message.id,
			error: {
				code: -32601,
				message: `Moirai Cut 不支持 Codex app-server 请求：${message.method}`,
			},
		});
		return true;
	}

	private handleLine(line: string): void {
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			return;
		}
		if (!isRecord(message)) return;
		if ("method" in message && this.handleServerRequest(message)) return;
		if (typeof message.id === "number" && !("method" in message)) {
			const pending = this.pending.get(message.id);
			if (!pending) return;
			this.pending.delete(message.id);
			clearTimeout(pending.timer);
			if (isRecord(message.error)) {
				pending.reject(
					new CodexChatError(
						typeof message.error.message === "string"
							? message.error.message
							: "Codex app-server 请求失败。",
					),
				);
				return;
			}
			pending.resolve(message.result);
			return;
		}
		if (typeof message.method !== "string" || !isRecord(message.params)) {
			return;
		}
		const threadId =
			typeof message.params.threadId === "string"
				? message.params.threadId
				: null;
		if (!threadId) return;
		for (const subscription of this.subscriptions.get(threadId) ?? []) {
			subscription.push(message);
		}
	}

	private fail(error: Error): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
		for (const subscriptions of this.subscriptions.values()) {
			for (const subscription of subscriptions) subscription.fail(error);
		}
		this.subscriptions.clear();
	}
}

function errorFromWebSocketEvent(
	event: unknown,
	fallback: string,
): CodexChatError {
	if (isRecord(event) && event.error instanceof Error) {
		return new CodexChatError(event.error.message);
	}
	if (isRecord(event) && typeof event.reason === "string" && event.reason) {
		return new CodexChatError(event.reason);
	}
	return new CodexChatError(fallback);
}

function websocketChildProcess(
	socket: CodexAppServerWebSocket,
): CodexAppServerChildProcess {
	const events = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const queued: string[] = [];
	let opened = socket.readyState === 1;
	let closed = false;

	const send = (value: string): boolean => {
		const message = value.endsWith("\n") ? value.slice(0, -1) : value;
		if (!message) return true;
		if (opened) {
			socket.send(message);
			return true;
		}
		queued.push(message);
		return true;
	};
	const onOpen = () => {
		opened = true;
		for (const message of queued.splice(0)) socket.send(message);
	};
	const onMessage = (event: unknown) => {
		if (!isRecord(event)) return;
		const data = event.data;
		if (typeof data === "string") {
			stdout.write(`${data}\n`);
			return;
		}
		if (data instanceof ArrayBuffer) {
			stdout.write(`${Buffer.from(data).toString("utf8")}\n`);
		}
	};
	const onError = (event: unknown) => {
		events.emit(
			"error",
			errorFromWebSocketEvent(event, "Codex 共享宿主 WebSocket 连接失败。"),
		);
	};
	const onClose = (event: unknown) => {
		if (closed) return;
		closed = true;
		events.emit(
			"close",
			isRecord(event) && typeof event.code === "number" ? event.code : null,
		);
	};

	socket.addEventListener("open", onOpen);
	socket.addEventListener("message", onMessage);
	socket.addEventListener("error", onError);
	socket.addEventListener("close", onClose);

	return {
		stdin: { write: send },
		stdout,
		stderr,
		on(event, listener) {
			events.on(event, listener);
			return events;
		},
	};
}

export class CodexAppServerWebSocketClient extends CodexAppServerRpcClient {
	constructor(socket: CodexAppServerWebSocket) {
		super(websocketChildProcess(socket));
	}
}

const sharedConnectionPromises = new Map<
	string,
	Promise<CodexAppServerWebSocketClient>
>();
const sharedHostStartPromises = new Map<string, Promise<void>>();

function sharedHostHealthUrl(sharedAppServerUrl: string): string {
	const url = assertLoopbackWebSocketUrl(sharedAppServerUrl);
	url.protocol = "http:";
	url.pathname = "/readyz";
	url.search = "";
	url.hash = "";
	return url.toString();
}

async function sharedHostReady(sharedAppServerUrl: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 800);
	try {
		const response = await fetch(sharedHostHealthUrl(sharedAppServerUrl), {
			cache: "no-store",
			signal: controller.signal,
		});
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

async function startSharedAppServerHost(
	runtime: CodexRuntimeConfig,
): Promise<void> {
	if (await sharedHostReady(runtime.sharedAppServerUrl)) return;
	const child = spawn(runtime.binary, buildCodexSharedHostArgs({ runtime }), {
		windowsHide: true,
		cwd: runtime.repoRoot,
		env: passthroughEnvironment(runtime),
		shell: false,
		stdio: ["ignore", "ignore", "pipe"],
	});
	let stderr = "";
	let processError: Error | null = null;
	let exitCode: number | null | undefined;
	child.stderr.on("data", (chunk: Buffer) => {
		stderr = `${stderr}${chunk.toString("utf8")}`.slice(-MAX_STDERR_CHARS);
	});
	child.once("error", (error) => {
		processError = error;
	});
	child.once("exit", (code) => {
		exitCode = code;
	});

	const deadline = Date.now() + SHARED_HOST_START_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (await sharedHostReady(runtime.sharedAppServerUrl)) return;
		if (processError) throw processError;
		if (exitCode !== undefined) {
			throw new CodexChatError(
				stderr.trim() ||
					`Codex 共享宿主已退出，状态码 ${exitCode ?? "unknown"}。`,
			);
		}
		await wait(SHARED_HOST_READY_RETRY_MS);
	}
	throw new CodexChatError(
		stderr.trim() || "Codex 共享宿主启动超时，请检查本机端口 48721。",
	);
}

async function ensureSharedAppServerHost(
	runtime: CodexRuntimeConfig,
): Promise<void> {
	const key = runtime.sharedAppServerUrl;
	let pending = sharedHostStartPromises.get(key);
	if (!pending) {
		pending = startSharedAppServerHost(runtime);
		sharedHostStartPromises.set(key, pending);
	}
	try {
		await pending;
	} finally {
		if (sharedHostStartPromises.get(key) === pending) {
			sharedHostStartPromises.delete(key);
		}
	}
}

async function createAppServerConnection({
	runtime,
}: {
	runtime: CodexRuntimeConfig;
}): Promise<CodexAppServerWebSocketClient> {
	await ensureSharedAppServerHost(runtime);
	const WebSocketConstructor = globalThis.WebSocket;
	if (!WebSocketConstructor) {
		throw new CodexChatError(
			"当前服务端运行时不支持 WebSocket，请使用项目要求的 Node 20+ 或 Bun。",
		);
	}
	const socket = new WebSocketConstructor(
		runtime.sharedAppServerUrl,
	) as unknown as CodexAppServerWebSocket;
	const connection = new CodexAppServerWebSocketClient(socket);
	try {
		await connection.initialize();
		return connection;
	} catch (error) {
		socket.close();
		throw error;
	}
}

const connectSharedAppServer: CodexAppServerConnector = async ({
	runtime,
	toolProfile: _toolProfile = "edit",
}) => {
	const key = runtime.sharedAppServerUrl;
	let pending = sharedConnectionPromises.get(key);
	if (!pending) {
		pending = createAppServerConnection({ runtime }).catch((error) => {
			sharedConnectionPromises.delete(key);
			throw error;
		});
		sharedConnectionPromises.set(key, pending);
	}
	const connection = await pending;
	if (connection.isOpen) return connection;
	sharedConnectionPromises.delete(key);
	return connectSharedAppServer({ runtime, toolProfile: _toolProfile });
};

function configuredMcpServerNames(): string[] {
	const codexHome =
		process.env.CODEX_HOME?.trim() ||
		(process.env.HOME ? path.join(process.env.HOME, ".codex") : "");
	if (!codexHome) return [];
	try {
		const config = readFileSync(path.join(codexHome, "config.toml"), "utf8");
		return Array.from(
			config.matchAll(/^\s*\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*(?:#.*)?$/gm),
			(match) => match[1],
		);
	} catch {
		return [];
	}
}

function repoRootFromCurrentWorkingDirectory(): string {
	const candidates = [
		process.env.OPENCUT_REPO_ROOT?.trim(),
		process.cwd(),
		path.resolve(process.cwd(), "../.."),
	].filter((candidate): candidate is string => Boolean(candidate));
	const root = candidates.find((candidate) =>
		existsSync(path.join(candidate, "apps/mcp/src/server.mjs")),
	);
	if (!root) {
		throw new CodexChatError("无法定位 Moirai Cut MCP 服务。");
	}
	return root;
}

export function resolveCodexRuntimeConfig(): CodexRuntimeConfig {
	const repoRoot = repoRootFromCurrentWorkingDirectory();
	return {
		binary: configuredCodexBinary(),
		repoRoot,
		appWorkspaceRoot:
			process.env.OPENCUT_CODEX_WORKSPACE_ROOT?.trim() ||
			path.dirname(repoRoot),
		mcpServerPath:
			process.env.OPENCUT_MCP_SERVER?.trim() ||
			path.join(repoRoot, "apps/mcp/src/server.mjs"),
		projectFilesDir:
			process.env.OPENCUT_PROJECTS_DIR?.trim() ||
			path.resolve(repoRoot, "../opencut-projects"),
		baseUrl:
			process.env.OPENCUT_BASE_URL?.trim() ||
			process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
			"http://127.0.0.1:3000",
		sharedAppServerUrl:
			process.env.OPENCUT_CODEX_APP_SERVER_URL?.trim() ||
			DEFAULT_SHARED_APP_SERVER_URL,
		disabledMcpServers: configuredMcpServerNames(),
	};
}

export function codexDesktopRefreshUrls(threadId: string): string[] {
	return [`codex://threads/${encodeURIComponent(threadId)}`];
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

async function openCodexDesktopUrl(url: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("/usr/bin/open", ["-g", url], { stdio: "ignore" });
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`Codex desktop sync exited with code ${code}.`));
		});
	});
}

export async function syncCodexThreadToDesktop({
	threadId,
	runtime = resolveCodexRuntimeConfig(),
}: {
	threadId: string;
	runtime?: CodexRuntimeConfig;
}): Promise<void> {
	if (
		process.platform !== "darwin" ||
		process.env.OPENCUT_CODEX_DESKTOP_SYNC?.trim() === "0"
	) {
		return;
	}
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			threadId,
		)
	) {
		throw new CodexChatError("Codex 返回了无效的桌面任务 ID。");
	}
	await ensureOpenCutWorkspaceConfig({
		appWorkspaceRoot: appWorkspaceRoot(runtime),
		repoRoot: runtime.repoRoot,
		mcpServerPath: runtime.mcpServerPath,
		projectFilesDir: runtime.projectFilesDir,
		baseUrl: runtime.baseUrl,
	});
	const [threadUrl] = codexDesktopRefreshUrls(threadId);
	await openCodexDesktopUrl(threadUrl);
}

function appWorkspaceRoot(runtime: CodexRuntimeConfig): string {
	return runtime.appWorkspaceRoot?.trim() || runtime.repoRoot;
}

function runtimeWorkspaceRoots(runtime: CodexRuntimeConfig): string[] {
	return Array.from(
		new Set([
			appWorkspaceRoot(runtime),
			runtime.repoRoot,
			runtime.projectFilesDir,
		]),
	);
}

function threadIdFromResponse(response: unknown): string {
	if (
		!isRecord(response) ||
		!isRecord(response.thread) ||
		typeof response.thread.id !== "string"
	) {
		throw new CodexChatError("Codex 没有返回会话 ID。");
	}
	return response.thread.id;
}

function threadSourceFromResponse(
	response: unknown,
): string | null | undefined {
	if (!isRecord(response) || !isRecord(response.thread)) return undefined;
	if (!("threadSource" in response.thread)) return undefined;
	const value = response.thread.threadSource;
	return typeof value === "string" || value === null ? value : undefined;
}

function turnIdFromResponse(response: unknown): string {
	if (
		!isRecord(response) ||
		!isRecord(response.turn) ||
		typeof response.turn.id !== "string"
	) {
		throw new CodexChatError("Codex 没有返回本轮 ID。");
	}
	return response.turn.id;
}

function cleanStoredUserText(text: string): string {
	const marker = "\n用户消息：\n";
	const markerIndex = text.lastIndexOf(marker);
	const visibleText = (
		markerIndex >= 0 ? text.slice(markerIndex + marker.length) : text
	).trim();
	const delegatedInput = visibleText.match(
		/^<codex_delegation>\s*[\s\S]*?<input>([\s\S]*?)<\/input>\s*<\/codex_delegation>$/,
	);
	return (delegatedInput?.[1] ?? visibleText).trim();
}

function userTextFromItem(item: Record<string, unknown>): string {
	if (!Array.isArray(item.content)) return "";
	return cleanStoredUserText(
		item.content
			.filter(isRecord)
			.map((part) =>
				part.type === "text" && typeof part.text === "string" ? part.text : "",
			)
			.filter(Boolean)
			.join("\n"),
	);
}

function timestampMilliseconds({
	value,
	fallback,
	offset = 0,
}: {
	value: unknown;
	fallback: number;
	offset?: number;
}): number {
	const seconds =
		typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return Math.max(0, Math.round(seconds * 1_000) + offset);
}

function threadHistoryFromResponse(response: unknown): CodexThreadHistory {
	if (!isRecord(response) || !isRecord(response.thread)) {
		throw new CodexChatError("Codex 没有返回可读取的会话。");
	}
	const thread = response.thread;
	if (
		typeof thread.id !== "string" ||
		typeof thread.createdAt !== "number" ||
		typeof thread.updatedAt !== "number" ||
		!Array.isArray(thread.turns)
	) {
		throw new CodexChatError("Codex 会话历史格式无效。");
	}
	const messages: CodexThreadMessage[] = [];
	for (const rawTurn of thread.turns) {
		if (
			!isRecord(rawTurn) ||
			typeof rawTurn.id !== "string" ||
			!Array.isArray(rawTurn.items)
		) {
			continue;
		}
		const turnId = rawTurn.id;
		const automaticReview = rawTurn.items
			.filter(isRecord)
			.some(
				(item) =>
					item.type === "userMessage" &&
					typeof item.clientId === "string" &&
					item.clientId.startsWith("moirai-review:"),
			);
		const startedAt =
			typeof rawTurn.startedAt === "number"
				? rawTurn.startedAt
				: thread.createdAt;
		const completedAt =
			typeof rawTurn.completedAt === "number"
				? rawTurn.completedAt
				: Math.max(thread.updatedAt, startedAt);
		let offset = 0;
		for (const item of rawTurn.items.filter(isRecord)) {
			if (item.type !== "userMessage" || typeof item.id !== "string") continue;
			if (
				typeof item.clientId === "string" &&
				/^moirai-(review|repair):/.test(item.clientId)
			)
				continue;
			const content = userTextFromItem(item);
			if (!content) continue;
			messages.push({
				id:
					typeof item.clientId === "string" && item.clientId
						? item.clientId
						: item.id,
				role: "user",
				content,
				turnId,
				createdAt: timestampMilliseconds({
					value: startedAt,
					fallback: thread.createdAt,
					offset,
				}),
				updatedAt: timestampMilliseconds({
					value: completedAt,
					fallback: thread.updatedAt,
					offset,
				}),
			});
			offset += 1;
		}
		const agentItems = rawTurn.items.filter(
			(item): item is Record<string, unknown> =>
				isRecord(item) &&
				item.type === "agentMessage" &&
				typeof item.id === "string" &&
				typeof item.text === "string" &&
				item.text.trim().length > 0,
		);
		const finalAgent =
			agentItems.filter((item) => item.phase === "final_answer").at(-1) ??
			agentItems.filter((item) => item.phase !== "commentary").at(-1) ??
			agentItems.at(-1);
		if (finalAgent && typeof finalAgent.id === "string") {
			messages.push({
				id: finalAgent.id,
				role: "assistant",
				content: automaticReview
					? reviewHistoryText(String(finalAgent.text))
					: String(finalAgent.text).trim(),
				turnId,
				streaming:
					rawTurn.status !== "completed" &&
					rawTurn.status !== "failed" &&
					rawTurn.status !== "interrupted",
				createdAt: timestampMilliseconds({
					value: startedAt,
					fallback: thread.createdAt,
					offset,
				}),
				updatedAt: timestampMilliseconds({
					value: completedAt,
					fallback: thread.updatedAt,
					offset,
				}),
			});
			offset += 1;
		}
		if (
			rawTurn.status === "failed" &&
			isRecord(rawTurn.error) &&
			typeof rawTurn.error.message === "string" &&
			rawTurn.error.message.trim()
		) {
			messages.push({
				id: `${turnId}:error`,
				role: "error",
				content: rawTurn.error.message.trim(),
				turnId,
				createdAt: timestampMilliseconds({
					value: completedAt,
					fallback: thread.updatedAt,
					offset,
				}),
				updatedAt: timestampMilliseconds({
					value: completedAt,
					fallback: thread.updatedAt,
					offset,
				}),
			});
		}
	}
	const firstUserMessage = messages.find((message) => message.role === "user");
	const title =
		typeof thread.name === "string" && thread.name.trim()
			? thread.name.trim()
			: firstUserMessage?.content.slice(0, 80) || "Moirai Cut 智能剪辑";
	return {
		sessionId: thread.id,
		title,
		messages,
		createdAt: timestampMilliseconds({
			value: thread.createdAt,
			fallback: 0,
		}),
		updatedAt: timestampMilliseconds({
			value: thread.updatedAt,
			fallback: thread.createdAt,
		}),
	};
}

function finalMessageFromTurn(turn: Record<string, unknown>): string | null {
	if (!Array.isArray(turn.items)) return null;
	const messages = turn.items.filter(
		(item): item is Record<string, unknown> =>
			isRecord(item) &&
			item.type === "agentMessage" &&
			typeof item.text === "string",
	);
	const text = messages.at(-1)?.text;
	return typeof text === "string" && text.trim() ? text.trim() : null;
}

function reviewHistoryText(text: string): string {
	try {
		const report: unknown = JSON.parse(text);
		if (isRecord(report) && typeof report.summary === "string")
			return `自动画面检查记录：${report.summary}`;
	} catch {
		/* An incomplete structured response is not a successful review. */
	}
	return "自动画面检查未返回完整结论。";
}

function notificationTurnId(
	notification: Record<string, unknown>,
): string | null {
	if (!isRecord(notification.params)) return null;
	if (typeof notification.params.turnId === "string") {
		return notification.params.turnId;
	}
	if (
		isRecord(notification.params.turn) &&
		typeof notification.params.turn.id === "string"
	) {
		return notification.params.turn.id;
	}
	return null;
}

function completionFromNotification(
	notification: Record<string, unknown>,
): Record<string, unknown> | null {
	if (
		notification.method !== "turn/completed" ||
		!isRecord(notification.params) ||
		!isRecord(notification.params.turn)
	) {
		return null;
	}
	return notification.params.turn;
}

function threadReadContainsTurn(response: unknown, turnId: string): boolean {
	return (
		isRecord(response) &&
		isRecord(response.thread) &&
		Array.isArray(response.thread.turns) &&
		response.thread.turns.some((turn) => isRecord(turn) && turn.id === turnId)
	);
}

async function waitForThreadPersistence({
	connection,
	threadId,
	turnId,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
	turnId: string;
}): Promise<void> {
	for (
		let attempt = 0;
		attempt < THREAD_PERSISTENCE_MAX_ATTEMPTS;
		attempt += 1
	) {
		const response = await connection.request({
			method: "thread/read",
			params: { threadId, includeTurns: true },
		});
		if (threadReadContainsTurn(response, turnId)) return;
		if (attempt + 1 < THREAD_PERSISTENCE_MAX_ATTEMPTS) {
			await wait(THREAD_PERSISTENCE_RETRY_MS);
		}
	}
}

async function refreshPersistedThreadInDesktop({
	connection,
	threadId,
	turnId,
	syncThreadToDesktop,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
	turnId: string;
	syncThreadToDesktop?: CodexDesktopThreadSync;
}): Promise<void> {
	if (!syncThreadToDesktop) return;
	try {
		await waitForThreadPersistence({
			connection,
			threadId,
			turnId,
		});
	} catch {
		// A failed persistence probe must not block the desktop refresh.
	}
	try {
		await syncThreadToDesktop(threadId);
	} catch {
		// Desktop refresh is best-effort; App Server remains authoritative.
	}
}

function truncated(value: string): string {
	if (value.length <= MAX_PROTOCOL_DETAIL_CHARS) return value;
	return `${value.slice(0, MAX_PROTOCOL_DETAIL_CHARS)}\n…已截断`;
}

function compactJson(value: unknown): string {
	try {
		return truncated(JSON.stringify(value, null, 2));
	} catch {
		return "无法序列化协议数据";
	}
}

function protocolStatus(value: unknown): CodexProtocolStatus {
	if (value === "completed") return "completed";
	if (value === "failed" || value === "declined") return "failed";
	if (value === "inProgress") return "started";
	return "info";
}

function stringField({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}): string | null {
	return typeof record[key] === "string" ? record[key] : null;
}

function itemLifecycleFrame({
	notification,
	params,
	item,
}: {
	notification: Record<string, unknown>;
	params: Record<string, unknown>;
	item: Record<string, unknown>;
}): CodexProtocolFrame | null {
	const method = stringField({ record: notification, key: "method" });
	const threadId = stringField({ record: params, key: "threadId" });
	const turnId = stringField({ record: params, key: "turnId" });
	const itemId = stringField({ record: item, key: "id" });
	const itemType = stringField({ record: item, key: "type" });
	if (!method || !threadId || !turnId || !itemId || !itemType) return null;
	const lifecycleStatus =
		method === "item/started"
			? "started"
			: protocolStatus(item.status ?? "completed");
	const base = {
		id: itemId,
		method,
		threadId,
		turnId,
		itemId,
		itemType,
		status: lifecycleStatus,
	} satisfies Omit<CodexProtocolFrame, "title">;

	if (itemType === "mcpToolCall") {
		const server = stringField({ record: item, key: "server" }) ?? "MCP";
		const tool = stringField({ record: item, key: "tool" }) ?? "tool";
		const detailParts = [`参数\n${compactJson(item.arguments ?? {})}`];
		if (item.result !== null && item.result !== undefined) {
			detailParts.push(`结果\n${compactJson(item.result)}`);
		}
		if (isRecord(item.error) && typeof item.error.message === "string") {
			detailParts.push(`错误\n${item.error.message}`);
		}
		return {
			...base,
			title: `${server === "opencut" ? "Moirai Cut" : server} · ${tool}`,
			detail: truncated(detailParts.join("\n\n")),
		};
	}

	if (itemType === "commandExecution") {
		const command = stringField({ record: item, key: "command" }) ?? "";
		const cwd = stringField({ record: item, key: "cwd" });
		const output = stringField({ record: item, key: "aggregatedOutput" });
		const exitCode =
			typeof item.exitCode === "number" ? `退出码 ${item.exitCode}` : null;
		return {
			...base,
			title: "运行命令",
			detail: truncated(
				[
					command ? `$ ${command}` : null,
					cwd ? `目录 ${cwd}` : null,
					output,
					exitCode,
				]
					.filter((part): part is string => Boolean(part))
					.join("\n"),
			),
		};
	}

	if (itemType === "fileChange") {
		return {
			...base,
			title: "应用文件修改",
			detail: compactJson(item.changes ?? []),
		};
	}

	if (itemType === "reasoning") {
		const summary = Array.isArray(item.summary)
			? item.summary.filter((part): part is string => typeof part === "string")
			: [];
		return {
			...base,
			title: "分析",
			...(summary.length > 0 ? { detail: truncated(summary.join("\n")) } : {}),
		};
	}

	if (itemType === "plan") {
		return {
			...base,
			title: "执行计划",
			...(typeof item.text === "string"
				? { detail: truncated(item.text) }
				: {}),
		};
	}

	if (itemType === "dynamicToolCall") {
		const namespace = stringField({ record: item, key: "namespace" });
		const tool = stringField({ record: item, key: "tool" }) ?? "tool";
		return {
			...base,
			title: `${namespace ? `${namespace} · ` : ""}${tool}`,
			detail: compactJson({
				arguments: item.arguments ?? {},
				contentItems: item.contentItems ?? null,
			}),
		};
	}

	return {
		...base,
		title: itemType,
		detail: compactJson(item),
	};
}

function protocolFrameFromNotification(
	notification: Record<string, unknown>,
): CodexProtocolFrame | null {
	const method = stringField({ record: notification, key: "method" });
	if (!method || !isRecord(notification.params)) return null;
	const params = notification.params;
	const threadId = stringField({ record: params, key: "threadId" });
	const turnId =
		stringField({ record: params, key: "turnId" }) ??
		(isRecord(params.turn)
			? stringField({ record: params.turn, key: "id" })
			: null);
	if (!threadId) return null;

	if (
		(method === "item/started" || method === "item/completed") &&
		isRecord(params.item)
	) {
		return itemLifecycleFrame({ notification, params, item: params.item });
	}

	if (
		method === "item/reasoning/summaryTextDelta" &&
		turnId &&
		typeof params.itemId === "string" &&
		typeof params.delta === "string"
	) {
		return {
			id: params.itemId,
			method,
			threadId,
			turnId,
			itemId: params.itemId,
			itemType: "reasoning",
			status: "streaming",
			title: "分析",
			detail: params.delta,
			append: true,
		};
	}

	if (method === "turn/plan/updated" && turnId && Array.isArray(params.plan)) {
		const explanation =
			typeof params.explanation === "string" ? params.explanation : null;
		const plan = params.plan
			.filter(isRecord)
			.map((step) => {
				const marker =
					step.status === "completed"
						? "✓"
						: step.status === "inProgress"
							? "→"
							: "○";
				return `${marker} ${typeof step.step === "string" ? step.step : ""}`;
			})
			.join("\n");
		return {
			id: `${turnId}:plan`,
			method,
			threadId,
			turnId,
			itemType: "plan",
			status: "streaming",
			title: "更新执行计划",
			detail: truncated([explanation, plan].filter(Boolean).join("\n")),
		};
	}

	if (
		method === "item/mcpToolCall/progress" &&
		turnId &&
		typeof params.itemId === "string" &&
		typeof params.message === "string"
	) {
		return {
			id: params.itemId,
			method,
			threadId,
			turnId,
			itemId: params.itemId,
			itemType: "mcpToolCall",
			status: "streaming",
			title: "MCP 工具处理中",
			detail: truncated(params.message),
		};
	}

	if (
		method === "item/commandExecution/outputDelta" &&
		turnId &&
		typeof params.itemId === "string" &&
		typeof params.delta === "string"
	) {
		return {
			id: params.itemId,
			method,
			threadId,
			turnId,
			itemId: params.itemId,
			itemType: "commandExecution",
			status: "streaming",
			title: "运行命令",
			detail: params.delta,
			append: true,
		};
	}

	if (
		method === "item/fileChange/outputDelta" &&
		turnId &&
		typeof params.itemId === "string" &&
		typeof params.delta === "string"
	) {
		return {
			id: params.itemId,
			method,
			threadId,
			turnId,
			itemId: params.itemId,
			itemType: "fileChange",
			status: "streaming",
			title: "应用文件修改",
			detail: params.delta,
			append: true,
		};
	}

	if (method === "turn/started" && turnId) {
		return {
			id: `turn:${turnId}`,
			method,
			threadId,
			turnId,
			status: "started",
			title: "开始处理",
		};
	}

	if (method === "turn/completed" && turnId && isRecord(params.turn)) {
		const status = protocolStatus(params.turn.status);
		const duration =
			typeof params.turn.durationMs === "number"
				? `耗时 ${params.turn.durationMs}ms`
				: undefined;
		return {
			id: `turn:${turnId}`,
			method,
			threadId,
			turnId,
			status,
			title: status === "completed" ? "处理完成" : "处理失败",
			...(duration ? { detail: duration } : {}),
		};
	}

	if (
		method === "mcpServer/elicitation/request" &&
		turnId &&
		(typeof notification.id === "number" || typeof notification.id === "string")
	) {
		const serverName =
			stringField({ record: params, key: "serverName" }) ?? "MCP";
		const meta = isRecord(params._meta) ? params._meta : null;
		const accepted =
			serverName === "opencut" && meta?.codex_approval_kind === "mcp_tool_call";
		return {
			id: `request:${notification.id}`,
			method,
			threadId,
			turnId,
			itemType: "approval",
			status: accepted ? "completed" : "failed",
			title: accepted ? "Moirai Cut 调用已授权" : `${serverName} 请求已拒绝`,
			...(typeof params.message === "string"
				? { detail: truncated(params.message) }
				: {}),
		};
	}

	if (method === "serverRequest/resolved" && turnId) {
		return {
			id: `request:${String(params.requestId ?? "resolved")}`,
			method,
			threadId,
			turnId,
			itemType: "approval",
			status: "completed",
			title: "权限请求已处理",
		};
	}

	if (
		(method === "warning" || method === "error") &&
		typeof params.message === "string"
	) {
		return {
			id: `${turnId ?? threadId}:${method}`,
			method,
			threadId,
			...(turnId ? { turnId } : {}),
			status: method === "error" ? "failed" : "info",
			title: method === "error" ? "Codex 错误" : "Codex 提醒",
			detail: truncated(params.message),
		};
	}

	return null;
}

function terminalTurnFromThreadRead(
	response: unknown,
	turnId: string,
): Record<string, unknown> | null {
	if (
		!isRecord(response) ||
		!isRecord(response.thread) ||
		!Array.isArray(response.thread.turns)
	) {
		return null;
	}
	const turn = response.thread.turns.find(
		(candidate) => isRecord(candidate) && candidate.id === turnId,
	);
	return isRecord(turn) &&
		(turn.status === "completed" ||
			turn.status === "failed" ||
			turn.status === "interrupted")
		? turn
		: null;
}

async function nextWithTurnReconciliation({
	iterator,
	connection,
	threadId,
	turnId,
	reconcileIntervalMs,
}: {
	iterator: AsyncIterator<unknown>;
	connection: CodexAppServerConnection;
	threadId: string;
	turnId: string;
	reconcileIntervalMs: number;
}): Promise<{
	done: boolean;
	value?: unknown;
	providerNative: boolean;
}> {
	const pendingNotification = iterator.next();
	const deadline = Date.now() + TURN_IDLE_TIMEOUT_MS;
	for (;;) {
		let timer: ReturnType<typeof setTimeout> | null = null;
		const remainingMs = Math.max(1, deadline - Date.now());
		const result = await Promise.race([
			pendingNotification.then((value) => ({
				kind: "notification" as const,
				value,
			})),
			new Promise<{ kind: "reconcile" }>((resolve) => {
				timer = setTimeout(
					() => resolve({ kind: "reconcile" }),
					Math.min(reconcileIntervalMs, remainingMs),
				);
			}),
		]);
		if (timer) clearTimeout(timer);
		if (result.kind === "notification") {
			return {
				done: result.value.done === true,
				value: result.value.value,
				providerNative: true,
			};
		}

		try {
			const response = await connection.request({
				method: "thread/read",
				params: { threadId, includeTurns: true },
			});
			const turn = terminalTurnFromThreadRead(response, turnId);
			if (turn) {
				return {
					done: false,
					providerNative: false,
					value: {
						method: "turn/completed",
						params: { threadId, turn },
					},
				};
			}
		} catch {
			// Native event delivery remains primary; retry reconciliation until idle.
		}
		if (Date.now() >= deadline) {
			throw new CodexChatError(
				"Codex 长时间没有返回新进度，可重新连接此任务。",
			);
		}
	}
}

interface OpenCutSessionBinding {
	tools: string[];
	completeToolInventory: boolean;
	projectSnapshot: string;
	projectName: string | null;
	revision: number | null;
}

function projectSnapshotFromToolResponse(response: unknown): string {
	if (!isRecord(response)) {
		throw new CodexChatError(
			"当前工程上下文读取失败：Moirai Cut 返回格式无效。",
		);
	}
	const content = Array.isArray(response.content) ? response.content : [];
	const text = content
		.filter(isRecord)
		.map((item) => (typeof item.text === "string" ? item.text : ""))
		.filter(Boolean)
		.join("\n");
	const fallback =
		response.structuredContent === undefined
			? ""
			: JSON.stringify(response.structuredContent);
	const snapshot = text || fallback;
	if (response.isError === true) {
		throw new CodexChatError(
			`当前工程上下文读取失败：${snapshot || "Moirai Cut MCP 调用失败。"}`,
		);
	}
	if (!snapshot) {
		throw new CodexChatError(
			"当前工程上下文读取失败：Moirai Cut 未返回工程摘要。",
		);
	}
	if (snapshot.length <= MAX_PROJECT_SNAPSHOT_CHARS) return snapshot;
	return `${snapshot.slice(0, MAX_PROJECT_SNAPSHOT_CHARS)}\n…工程摘要已截断`;
}

function projectNameFromSnapshot(snapshot: string): string | null {
	try {
		const project: unknown = JSON.parse(snapshot);
		if (!isRecord(project)) return null;
		const projectName =
			typeof project.projectName === "string"
				? project.projectName
				: typeof project.name === "string"
					? project.name
					: null;
		return projectName?.trim() || null;
	} catch {
		return null;
	}
}

function revisionFromProjectSnapshot(snapshot: string): number | null {
	try {
		const value: unknown = JSON.parse(snapshot);
		return isRecord(value) && typeof value.revision === "number"
			? value.revision
			: null;
	} catch {
		return null;
	}
}

interface NativeVisualInput {
	type: "image";
	url: string;
}

interface VisualInspection {
	tool: "inspect_timeline_range" | "inspect_media_scenes";
	arguments: Record<string, unknown>;
}

function agentContextPacket(context: string): Record<string, unknown> | null {
	const startMarker = "<opencut-agent-context-json>";
	const endMarker = "</opencut-agent-context-json>";
	const start = context.indexOf(startMarker);
	const end = context.indexOf(endMarker);
	if (start < 0 || end <= start) return null;
	try {
		const value: unknown = JSON.parse(
			context.slice(start + startMarker.length, end).trim(),
		);
		return isRecord(value) ? value : null;
	} catch {
		return null;
	}
}

function numericField({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}): number | null {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function visualInspectionFromContext({
	context,
	projectId,
	tools,
}: {
	context: string;
	projectId: string;
	tools: string[];
}): VisualInspection | null {
	const packet = agentContextPacket(context);
	if (!packet) return null;
	const project = isRecord(packet.project) ? packet.project : null;
	const sceneId =
		project && typeof project.sceneId === "string"
			? project.sceneId
			: undefined;
	const references = Array.isArray(packet.references)
		? packet.references.filter(isRecord)
		: [];
	const range = references.find(
		(reference) =>
			reference.kind === "range" &&
			numericField({ record: reference, key: "startSeconds" }) !== null &&
			numericField({ record: reference, key: "endSeconds" }) !== null,
	);
	if (range && tools.includes("inspect_timeline_range")) {
		return {
			tool: "inspect_timeline_range",
			arguments: {
				projectId,
				...(sceneId ? { sceneId } : {}),
				startSeconds: numericField({
					record: range,
					key: "startSeconds",
				}),
				endSeconds: numericField({
					record: range,
					key: "endSeconds",
				}),
			},
		};
	}
	const timelineElements = Array.isArray(packet.timelineElements)
		? packet.timelineElements.filter(isRecord)
		: [];
	const starts = timelineElements
		.map((element) => numericField({ record: element, key: "startSeconds" }))
		.filter((value): value is number => value !== null);
	const ends = timelineElements
		.map((element) => numericField({ record: element, key: "endSeconds" }))
		.filter((value): value is number => value !== null);
	if (
		starts.length > 0 &&
		ends.length > 0 &&
		tools.includes("inspect_timeline_range")
	) {
		return {
			tool: "inspect_timeline_range",
			arguments: {
				projectId,
				...(sceneId ? { sceneId } : {}),
				startSeconds: Math.min(...starts),
				endSeconds: Math.max(...ends),
			},
		};
	}
	const media = Array.isArray(packet.media)
		? packet.media.filter(isRecord)
		: [];
	const firstVisualMedia = media.find(
		(asset) =>
			typeof asset.mediaId === "string" &&
			(asset.mediaType === "video" || asset.mediaType === "image"),
	);
	if (firstVisualMedia && tools.includes("inspect_media_scenes")) {
		return {
			tool: "inspect_media_scenes",
			arguments: {
				projectId,
				assetId: firstVisualMedia.mediaId,
			},
		};
	}
	return null;
}

function nativeImagesFromMcpResponse(response: unknown): NativeVisualInput[] {
	if (!isRecord(response) || !Array.isArray(response.content)) return [];
	return response.content
		.filter(isRecord)
		.flatMap((item): NativeVisualInput[] => {
			if (
				item.type !== "image" ||
				typeof item.data !== "string" ||
				typeof item.mimeType !== "string" ||
				!item.mimeType.startsWith("image/")
			) {
				return [];
			}
			return [
				{
					type: "image",
					url: `data:${item.mimeType};base64,${item.data}`,
				},
			];
		});
}

function textFromMcpResponse(response: unknown): string {
	if (!isRecord(response) || !Array.isArray(response.content)) return "";
	return response.content
		.filter(isRecord)
		.map((item) => (typeof item.text === "string" ? item.text : ""))
		.filter(Boolean)
		.join("\n");
}

async function visualInputsForTurn({
	connection,
	threadId,
	projectId,
	context,
	tools,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
	projectId: string;
	context: string;
	tools: string[];
}): Promise<{
	inputs: NativeVisualInput[];
	inspection: VisualInspection | null;
	detail: string;
}> {
	const inspection = visualInspectionFromContext({
		context,
		projectId,
		tools,
	});
	if (!inspection) return { inputs: [], inspection: null, detail: "" };
	const response = await connection.request({
		method: "mcpServer/tool/call",
		params: {
			threadId,
			server: "opencut",
			tool: inspection.tool,
			arguments: inspection.arguments,
		},
	});
	if (isRecord(response) && response.isError === true) {
		return {
			inputs: [],
			inspection,
			detail: textFromMcpResponse(response) || "选区画面识别失败。",
		};
	}
	return {
		inputs: nativeImagesFromMcpResponse(response),
		inspection,
		detail: textFromMcpResponse(response),
	};
}

async function verificationFrames({
	connection,
	threadId,
	projectId,
	beforeRevision,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
	projectId: string;
	beforeRevision: number | null;
}): Promise<CodexProtocolFrame[]> {
	const response = await connection.request({
		method: "mcpServer/tool/call",
		params: {
			threadId,
			server: "opencut",
			tool: "read_project",
			arguments: { projectId, detail: "summary" },
		},
	});
	const snapshot = projectSnapshotFromToolResponse(response);
	const revision = revisionFromProjectSnapshot(snapshot);
	if (
		beforeRevision === null ||
		revision === null ||
		revision <= beforeRevision
	) {
		return [
			{
				id: `verification:${threadId}`,
				method: "opencut/verification",
				threadId,
				itemType: "verification",
				status: "info",
				title: "结果复核完成",
				detail: "本轮工程版本未发生变化。",
			},
		];
	}
	const frames: CodexProtocolFrame[] = [
		{
			id: `verification:${threadId}:revision`,
			method: "opencut/verification",
			threadId,
			itemType: "verification",
			status: "completed",
			title: "工程修改已确认",
			detail: `revision ${beforeRevision} → ${revision}`,
		},
	];

	return frames;
}

const REVIEW_OUTPUT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		revision: { type: "integer" },
		verdict: { type: "string", enum: ["pass", "repair", "unresolved"] },
		summary: { type: "string" },
		findings: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					atSeconds: { type: "number" },
					description: { type: "string" },
				},
				required: ["atSeconds", "description"],
			},
		},
	},
	required: ["revision", "verdict", "summary", "findings"],
};

async function collectReviewEvidence({
	connection,
	threadId,
	projectId,
	tools,
	signal,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
	projectId: string;
	tools: string[];
	signal?: AbortSignal;
}) {
	for (const required of [
		"read_project",
		"lint_cut",
		"wait_for_sync",
		"render_frames",
	]) {
		if (!tools.includes(required))
			throw new CodexChatError(`复核缺少 ${required} 工具。`);
	}
	const call = async (tool: string, args: Record<string, unknown>) => {
		signal?.throwIfAborted();
		const response = await connection.request({
			method: "mcpServer/tool/call",
			params: {
				threadId,
				server: "opencut",
				tool,
				arguments: { projectId, ...args },
			},
		});
		if (isRecord(response) && response.isError === true)
			throw new CodexChatError(textFromMcpResponse(response));
		return response;
	};
	const snapshot = projectSnapshotFromToolResponse(
		await call("read_project", { detail: "full" }),
	);
	const revision = revisionFromProjectSnapshot(snapshot);
	if (revision === null) throw new CodexChatError("无法确认复核版本。");
	const plan = await agentAnalysis<{
		atSeconds: number[];
		omittedMoments: number;
	}>({ command: "review_plan", document: JSON.parse(snapshot) }, { signal });
	const lint = textFromMcpResponse(await call("lint_cut", {}));
	const lintResult: unknown = JSON.parse(lint);
	const lintErrors =
		isRecord(lintResult) && isRecord(lintResult.counts)
			? lintResult.counts.error
			: null;
	const sync = JSON.parse(
		textFromMcpResponse(
			await call("wait_for_sync", { revision, timeoutSeconds: 30 }),
		),
	);
	if (sync.synced !== true)
		throw new CodexChatError("编辑器尚未同步到复核版本。");
	const rendered = await call("render_frames", {
		atSeconds: plan.atSeconds,
		tile: true,
		maxDim: 640,
	});
	const metadata = JSON.parse(textFromMcpResponse(rendered));
	const images = nativeImagesFromMcpResponse(rendered);
	if (
		metadata.revision !== revision ||
		metadata.projectId !== projectId ||
		metadata.sceneId !== JSON.parse(snapshot).sceneId ||
		metadata.stable !== true ||
		images.length === 0 ||
		!Array.isArray(metadata.frames) ||
		metadata.frames.some((frame: Record<string, unknown>) => frame.error)
	) {
		throw new CodexChatError("画面证据缺失、过期或不完整。");
	}
	return {
		revision,
		images,
		lintErrors,
		detail: JSON.stringify({
			revision,
			frames: metadata.frames,
			omittedMoments: plan.omittedMoments,
			lint: lintResult,
			project: JSON.parse(snapshot),
		}),
	};
}

async function listOpenCutTools({
	connection,
	threadId,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
}): Promise<string[]> {
	const statusResponse = await connection.request({
		method: "mcpServerStatus/list",
		params: {
			threadId,
			detail: "toolsAndAuthOnly",
			limit: 100,
		},
	});
	const servers =
		isRecord(statusResponse) && Array.isArray(statusResponse.data)
			? statusResponse.data.filter(isRecord)
			: [];
	const openCut = servers.find((server) => server.name === "opencut");
	if (!openCut || !isRecord(openCut.tools)) {
		throw new CodexChatError(
			"Moirai Cut MCP 未就绪：当前 Codex 会话没有可用的 opencut 工具入口。",
		);
	}
	const tools = Object.keys(openCut.tools);
	const missingTools = REQUIRED_OPENCUT_TOOLS.filter(
		(tool) => !tools.includes(tool),
	);
	if (missingTools.length > 0) {
		throw new CodexChatError(
			`Moirai Cut MCP 未就绪：缺少 ${missingTools.join("、")} 工具。`,
		);
	}
	return tools;
}

async function bindOpenCutSession({
	connection,
	threadId,
	projectId,
	knownTools,
	requireCompleteToolInventory = false,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
	projectId: string;
	knownTools?: string[];
	requireCompleteToolInventory?: boolean;
}): Promise<OpenCutSessionBinding> {
	let projectSnapshot: string;
	try {
		const projectResponse = await connection.request({
			method: "mcpServer/tool/call",
			params: {
				threadId,
				server: "opencut",
				tool: "read_project",
				arguments: { projectId, detail: "summary" },
			},
		});
		projectSnapshot = projectSnapshotFromToolResponse(projectResponse);
	} catch (projectError) {
		await listOpenCutTools({ connection, threadId });
		throw projectError;
	}

	const completeToolInventory = Boolean(
		knownTools || requireCompleteToolInventory,
	);
	const tools =
		knownTools ??
		(requireCompleteToolInventory
			? await listOpenCutTools({ connection, threadId })
			: [...REQUIRED_OPENCUT_TOOLS]);
	return {
		tools,
		completeToolInventory,
		projectSnapshot,
		projectName: projectNameFromSnapshot(projectSnapshot),
		revision: revisionFromProjectSnapshot(projectSnapshot),
	};
}

const TOOL_PROFILES: CodexToolProfileCapability[] = [
	{
		id: "edit",
		label: "专注剪辑",
		description: "本轮只使用 Moirai Cut 工程工具，适合日常剪辑。",
	},
	{
		id: "verify",
		label: "剪辑与验收",
		description: "本轮可使用浏览器与桌面能力验收，仍禁用 LocalCut。",
	},
	{
		id: "full",
		label: "完整能力",
		description: "本轮可使用已配置的 Codex 工具，始终禁用 LocalCut。",
	},
];

function capabilitiesFromResponses({
	modelsResponse,
	modesResponse,
	skillsResponse,
}: {
	modelsResponse: unknown;
	modesResponse: unknown;
	skillsResponse: unknown;
}): CodexCapabilities {
	const modelRows =
		isRecord(modelsResponse) && Array.isArray(modelsResponse.data)
			? modelsResponse.data.filter(isRecord)
			: [];
	const models = modelRows.flatMap((model): CodexModelCapability[] => {
		const id =
			typeof model.id === "string"
				? model.id
				: typeof model.model === "string"
					? model.model
					: null;
		if (!id) return [];
		const supported = Array.isArray(model.supportedReasoningEfforts)
			? model.supportedReasoningEfforts.filter(isRecord)
			: [];
		return [
			{
				id,
				label: typeof model.displayName === "string" ? model.displayName : id,
				description:
					typeof model.description === "string" ? model.description : null,
				efforts: supported
					.map((entry) =>
						typeof entry.reasoningEffort === "string"
							? entry.reasoningEffort
							: null,
					)
					.filter((value): value is string => value !== null),
				defaultEffort:
					typeof model.defaultReasoningEffort === "string"
						? model.defaultReasoningEffort
						: null,
				inputModalities: Array.isArray(model.inputModalities)
					? model.inputModalities.filter(
							(value): value is string => typeof value === "string",
						)
					: ["text", "image"],
				isDefault: model.isDefault === true,
			},
		];
	});
	const modeRows =
		isRecord(modesResponse) && Array.isArray(modesResponse.data)
			? modesResponse.data.filter(isRecord)
			: [];
	const modes = modeRows.flatMap((mode): CodexModeCapability[] => {
		if (mode.mode !== "default" && mode.mode !== "plan") return [];
		return [
			{
				id: mode.mode,
				label: typeof mode.name === "string" ? mode.name : mode.mode,
				defaultEffort:
					typeof mode.reasoning_effort === "string"
						? mode.reasoning_effort
						: null,
			},
		];
	});
	const skillGroups =
		isRecord(skillsResponse) && Array.isArray(skillsResponse.data)
			? skillsResponse.data.filter(isRecord)
			: [];
	const skills = skillGroups
		.flatMap((group) =>
			Array.isArray(group.skills) ? group.skills.filter(isRecord) : [],
		)
		.flatMap((skill): CodexSkillCapability[] => {
			if (typeof skill.name !== "string") return [];
			return [
				{
					name: skill.name,
					description:
						typeof skill.description === "string" ? skill.description : null,
					enabled: skill.enabled !== false,
				},
			];
		});
	return {
		models,
		modes,
		skills,
		toolProfiles: TOOL_PROFILES,
	};
}

export function createCodexChatService({
	runtime = resolveCodexRuntimeConfig(),
	connect = connectSharedAppServer,
	syncThreadToDesktop,
	turnReconcileIntervalMs = TURN_RECONCILE_INTERVAL_MS,
	capabilitiesCacheTtlMs = CAPABILITIES_CACHE_TTL_MS,
}: {
	runtime?: CodexRuntimeConfig;
	connect?: CodexAppServerConnector;
	syncThreadToDesktop?: CodexDesktopThreadSync;
	turnReconcileIntervalMs?: number;
	capabilitiesCacheTtlMs?: number;
} = {}): CodexChatService {
	const sessions = new Map<string, string>();
	const validatedTools = new Map<string, string[]>();
	const visibleThreadNames = new Map<string, string>();
	const capabilitiesCache = new Map<
		CodexToolProfile,
		{ expiresAt: number; value: CodexCapabilities }
	>();
	const capabilitiesInFlight = new Map<
		CodexToolProfile,
		Promise<CodexCapabilities>
	>();
	const sessionCacheKey = (input: CodexChatInput) => {
		const conversationId = input.conversationId?.trim();
		return conversationId
			? JSON.stringify([input.projectId, conversationId])
			: input.projectId;
	};
	return {
		async capabilities({ toolProfile = "edit" } = {}) {
			const cached = capabilitiesCache.get(toolProfile);
			if (cached && cached.expiresAt > Date.now()) return cached.value;
			const pending = capabilitiesInFlight.get(toolProfile);
			if (pending) return pending;
			const discovery = (async () => {
				const connection = await connect({ runtime, toolProfile });
				const [modelsResponse, modesResponse, skillsResponse] =
					await Promise.all([
						connection.request({
							method: "model/list",
							params: { limit: 50, includeHidden: false },
						}),
						connection.request({
							method: "collaborationMode/list",
							params: {},
						}),
						connection.request({
							method: "skills/list",
							params: {
								cwds: [runtime.repoRoot],
								forceReload: false,
							},
						}),
					]);
				const value = capabilitiesFromResponses({
					modelsResponse,
					modesResponse,
					skillsResponse,
				});
				capabilitiesCache.set(toolProfile, {
					expiresAt: Date.now() + capabilitiesCacheTtlMs,
					value,
				});
				return value;
			})();
			capabilitiesInFlight.set(toolProfile, discovery);
			try {
				return await discovery;
			} finally {
				if (capabilitiesInFlight.get(toolProfile) === discovery) {
					capabilitiesInFlight.delete(toolProfile);
				}
			}
		},
		async steer({ sessionId, turnId, message, toolProfile = "edit" }) {
			const connection = await connect({ runtime, toolProfile });
			await connection.request({
				method: "turn/steer",
				params: {
					threadId: sessionId,
					expectedTurnId: turnId,
					input: [{ type: "text", text: message }],
				},
			});
		},
		async interrupt({ sessionId, turnId, toolProfile = "edit" }) {
			const connection = await connect({ runtime, toolProfile });
			await connection.request({
				method: "turn/interrupt",
				params: { threadId: sessionId, turnId },
			});
		},
		async compact({ sessionId, toolProfile = "edit" }) {
			const connection = await connect({ runtime, toolProfile });
			await connection.request({
				method: "thread/compact/start",
				params: { threadId: sessionId },
			});
		},
		async readThread({ sessionId, toolProfile = "edit" }) {
			const connection = await connect({ runtime, toolProfile });
			return threadHistoryFromResponse(
				await connection.request({
					method: "thread/read",
					params: { threadId: sessionId, includeTurns: true },
				}),
			);
		},
		async *stream({ input, signal }) {
			const toolProfile = input.toolProfile ?? "edit";
			const connection = await connect({ runtime, toolProfile });
			const cacheKey = sessionCacheKey(input);
			const requestedSessionId =
				input.sessionId?.trim() || sessions.get(cacheKey);
			const developerInstructions = buildOpenCutThreadInstructions(
				input.projectId,
			);
			const cwd = appWorkspaceRoot(runtime);
			const workspaceRoots = runtimeWorkspaceRoots(runtime);
			let threadResponse = await connection.request({
				method: requestedSessionId ? "thread/resume" : "thread/start",
				params: requestedSessionId
					? {
							threadId: requestedSessionId,
							cwd,
							runtimeWorkspaceRoots: workspaceRoots,
							developerInstructions,
							approvalPolicy: "never",
							sandbox: "read-only",
							excludeTurns: true,
							...(input.model ? { model: input.model } : {}),
						}
					: {
							cwd,
							runtimeWorkspaceRoots: workspaceRoots,
							developerInstructions,
							approvalPolicy: "never",
							sandbox: "read-only",
							serviceName: "opencut_smart_edit",
							threadSource: "user",
							...(input.model ? { model: input.model } : {}),
						},
			});
			let migratedLegacyThread = false;
			if (
				requestedSessionId &&
				threadSourceFromResponse(threadResponse) === null
			) {
				threadResponse = await connection.request({
					method: "thread/fork",
					params: {
						threadId: requestedSessionId,
						cwd,
						runtimeWorkspaceRoots: workspaceRoots,
						developerInstructions,
						approvalPolicy: "never",
						sandbox: "read-only",
						excludeTurns: true,
						threadSource: "user",
						...(input.model ? { model: input.model } : {}),
					},
				});
				migratedLegacyThread = true;
			}
			const sessionId = threadIdFromResponse(threadResponse);
			sessions.set(cacheKey, sessionId);
			const subscription = connection.subscribe(sessionId);
			const iterator = subscription[Symbol.asyncIterator]();
			let turnId: string | null = null;
			const interrupt = () => {
				if (!turnId) return;
				void connection
					.request({
						method: "turn/interrupt",
						params: { threadId: sessionId, turnId },
					})
					.catch(() => {});
			};
			signal?.addEventListener("abort", interrupt, { once: true });

			try {
				yield { type: "session", sessionId };
				yield {
					type: "protocol",
					id: `thread:${sessionId}`,
					method: migratedLegacyThread
						? "thread/fork"
						: requestedSessionId
							? "thread/resume"
							: "thread/start",
					threadId: sessionId,
					status: "completed",
					title: migratedLegacyThread
						? "Codex 会话已迁移并恢复"
						: requestedSessionId
							? "Codex 会话已恢复"
							: "Codex 会话已连接",
				};
				const binding = await bindOpenCutSession({
					connection,
					threadId: sessionId,
					projectId: input.projectId,
					knownTools: validatedTools.get(`${toolProfile}:${sessionId}`),
					requireCompleteToolInventory:
						input.visualMode === "auto" || input.verificationMode === "full",
				});
				if (binding.completeToolInventory) {
					validatedTools.set(`${toolProfile}:${sessionId}`, binding.tools);
				}
				const nextThreadName = visibleThreadName(
					binding.projectName || `Moirai Cut · ${input.projectId}`,
				);
				if (visibleThreadNames.get(sessionId) !== nextThreadName) {
					visibleThreadNames.set(sessionId, nextThreadName);
					void connection
						.request({
							method: "thread/name/set",
							params: {
								threadId: sessionId,
								name: nextThreadName,
							},
						})
						.catch(() => {
							if (visibleThreadNames.get(sessionId) === nextThreadName) {
								visibleThreadNames.delete(sessionId);
							}
						});
				}
				yield {
					type: "protocol",
					id: `mcp:${sessionId}:opencut`,
					method: "mcpServer/tool/call",
					threadId: sessionId,
					itemType: "mcpToolCall",
					status: "completed",
					title: "Moirai Cut MCP 已就绪",
					detail: binding.tools.join(" · "),
				};
				yield {
					type: "protocol",
					id: `context:${sessionId}:${input.projectId}`,
					method: "mcpServer/tool/call",
					threadId: sessionId,
					itemType: "mcpToolCall",
					status: "completed",
					title: "当前工程上下文已载入",
					detail: [
						input.projectId,
						binding.revision === null ? null : `revision ${binding.revision}`,
					]
						.filter((part): part is string => Boolean(part))
						.join(" · "),
				};
				let visual: Awaited<ReturnType<typeof visualInputsForTurn>> = {
					inputs: [],
					inspection: null,
					detail: "",
				};
				if (input.visualMode === "auto") {
					try {
						visual = await visualInputsForTurn({
							connection,
							threadId: sessionId,
							projectId: input.projectId,
							context: input.context,
							tools: binding.tools,
						});
					} catch (error) {
						yield {
							type: "protocol",
							id: `visual:${sessionId}:failed`,
							method: "opencut/visual-context",
							threadId: sessionId,
							itemType: "mcpToolCall",
							status: "failed",
							title: "选区画面识别失败，继续使用结构化上下文",
							detail:
								error instanceof Error
									? error.message
									: "画面识别工具返回异常。",
						};
					}
				}
				if (visual.inspection) {
					yield {
						type: "protocol",
						id: `visual:${sessionId}`,
						method: "opencut/visual-context",
						threadId: sessionId,
						itemType: "mcpToolCall",
						status: visual.inputs.length > 0 ? "completed" : "failed",
						title:
							visual.inputs.length > 0
								? "选区画面已作为多模态上下文载入"
								: "选区画面识别失败",
						detail: truncated(
							[
								`${visual.inspection.tool} · ${visual.inputs.length} 张联系表`,
								visual.detail,
							]
								.filter(Boolean)
								.join("\n"),
						),
					};
				}
				const turnResponse = await connection.request({
					method: "turn/start",
					params: {
						threadId: sessionId,
						...(input.messageId
							? { clientUserMessageId: input.messageId }
							: {}),
						...(input.model ? { model: input.model } : {}),
						...(input.effort ? { effort: input.effort } : {}),
						...(input.mode
							? {
									collaborationMode: {
										mode: input.mode,
										settings: {
											model: input.model ?? null,
											reasoning_effort: input.effort ?? null,
											developer_instructions: null,
										},
									},
								}
							: {}),
						additionalContext: {
							"opencut.smart_edit": {
								kind: "application",
								value: buildCodexPrompt({
									...input,
									projectSnapshot: binding.projectSnapshot,
								}),
							},
						},
						input: [
							{
								type: "text",
								text: input.message.trim(),
							},
							...visual.inputs,
						],
					},
				});
				turnId = turnIdFromResponse(turnResponse);
				yield { type: "turn", sessionId, turnId };
				yield {
					type: "protocol",
					id: `turn:${turnId}`,
					method: "turn/start",
					threadId: sessionId,
					turnId,
					status: "started",
					title: "开始处理",
				};
				void refreshPersistedThreadInDesktop({
					connection,
					threadId: sessionId,
					turnId,
					syncThreadToDesktop,
				});
				let streamedMessage = "";
				let nativeEventSequence = 0;
				let phase: "edit" | "review" | "repair" = "edit";
				let repairs = 0;
				let editMessage = "";
				let evidence: Awaited<ReturnType<typeof collectReviewEvidence>> | null =
					null;

				for (;;) {
					if (signal?.aborted) {
						throw new CodexChatError("Codex 会话已取消。");
					}
					const next = await nextWithTurnReconciliation({
						iterator,
						connection,
						threadId: sessionId,
						turnId,
						reconcileIntervalMs: turnReconcileIntervalMs,
					});
					if (next.done) {
						throw new CodexChatError("Codex 事件流提前结束。");
					}
					if (!isRecord(next.value)) continue;
					const notification = next.value;
					if (next.providerNative) {
						nativeEventSequence += 1;
						const event: ProviderNativeEvent = {
							id: `${turnId}:native:${nativeEventSequence}`,
							provider: "codex",
							transport: "app-server-json-rpc",
							name:
								typeof notification.method === "string"
									? notification.method
									: "notification",
							payload: notification as ProviderNativePayload,
							raw: JSON.stringify(notification),
						};
						yield { type: "native", event };
					}
					if (notificationTurnId(notification) !== turnId) continue;

					if (
						notification.method === "item/agentMessage/delta" &&
						isRecord(notification.params) &&
						typeof notification.params.delta === "string"
					) {
						streamedMessage += notification.params.delta;
						if (phase === "review") continue;
						yield {
							type: "delta",
							delta: notification.params.delta,
						};
						continue;
					}

					const protocolFrame = protocolFrameFromNotification(notification);
					if (protocolFrame) {
						yield {
							type: "protocol",
							...protocolFrame,
						};
					}

					const completedTurn = completionFromNotification(notification);
					if (!completedTurn) continue;
					void refreshPersistedThreadInDesktop({
						connection,
						threadId: sessionId,
						turnId,
						syncThreadToDesktop,
					});
					if (completedTurn.status === "failed") {
						const message =
							isRecord(completedTurn.error) &&
							typeof completedTurn.error.message === "string"
								? completedTurn.error.message
								: "Codex 本轮处理失败。";
						if (phase !== "edit" && !signal?.aborted) {
							yield {
								type: "protocol",
								id: `verification:${sessionId}:failed`,
								method: "opencut/verification",
								threadId: sessionId,
								turnId,
								itemType: "verification",
								status: "failed",
								title: "自动复核未完成",
								detail: message,
							};
							yield {
								type: "done",
								sessionId,
								message: `${editMessage}\n\n自动复核未完成：${message}`,
							};
							return;
						}
						throw new CodexChatError(message);
					}
					if (completedTurn.status !== "completed") {
						throw new CodexChatError("Codex 本轮处理已中断。");
					}
					let message =
						finalMessageFromTurn(completedTurn) ||
						streamedMessage.trim() ||
						"Codex 已完成处理。";
					if (input.verificationMode === "full" && input.mode !== "plan") {
						try {
							signal?.throwIfAborted();
							let nextInput: Array<
								{ type: "text"; text: string } | NativeVisualInput
							> | null = null;
							let reviewing = true;
							if (phase === "review" && evidence) {
								const current = await connection.request({
									method: "mcpServer/tool/call",
									params: {
										threadId: sessionId,
										server: "opencut",
										tool: "read_project",
										arguments: {
											projectId: input.projectId,
											detail: "summary",
										},
									},
								});
								const revision = revisionFromProjectSnapshot(
									projectSnapshotFromToolResponse(current),
								);
								const decision = await agentAnalysis<{
									action: "pass" | "repair" | "unresolved";
									summary: string;
									findings?: unknown;
								}>(
									{
										command: "review_decision",
										report: message,
										revision,
										evidenceRevision: evidence.revision,
										stable: true,
										lintErrors: evidence.lintErrors,
										repairs,
									},
									{ signal },
								);
								yield {
									type: "protocol",
									id: `verification:${sessionId}:${turnId}`,
									method: "opencut/verification",
									threadId: sessionId,
									turnId,
									itemType: "verification",
									status:
										decision.action === "pass"
											? "completed"
											: decision.action === "repair"
												? "info"
												: "failed",
									title:
										decision.action === "pass"
											? "代表帧复核通过"
											: decision.action === "repair"
												? "发现问题，进行一次修正"
												: "复核仍有未解决问题",
									detail: decision.summary,
								};
								if (decision.action === "repair") {
									repairs += 1;
									phase = "repair";
									reviewing = false;
									nextInput = [
										{
											type: "text",
											text: [
												"这是同一任务唯一一次自动修正。会话中用户追加的最新要求优先。仅修正下面有证据的问题，保留用户已确定的切点、镜头顺序和文案，不扩展任务。",
												`唯一工程 ${input.projectId}，检查版本 ${evidence.revision}。先读取最新 revision；如果已经变化，停止修正并报告冲突。`,
												"所有修改只通过 opencut.edit_project 的 baseRevision 和幂等键提交。修改后会由系统重新取帧复核，不要自行循环。",
												`原始要求：${input.message}`,
												`问题：${JSON.stringify(decision.findings)}`,
											].join("\n"),
										},
									];
								} else {
									message = `${editMessage}\n\n${decision.action === "pass" ? "代表帧与结构复核通过" : "复核未通过"}：${decision.summary}`;
								}
							} else {
								editMessage =
									phase === "repair" ? `${editMessage}\n${message}` : message;
								evidence = await collectReviewEvidence({
									connection,
									threadId: sessionId,
									projectId: input.projectId,
									tools: binding.tools,
									signal,
								});
								phase = "review";
								nextInput = [
									{
										type: "text",
										text: [
											"这是同一剪辑任务的只读质量复核。会话中用户追加的最新要求优先。检查附带的最终合成画面、文字可读性、商品遮挡、构图和结构检查结果。",
											"本轮禁止修改工程或调用任何写工具；需要修正只在 findings 里说明，系统最多安排一次修正。",
											"不要把截图当作连续播放或试听。说明声音、动态流畅性和未采样部分的证据边界。不要凭审美偏好推翻用户指定内容。",
											`唯一工程 ${input.projectId}，revision 必须为 ${evidence.revision}。已修正 ${repairs} 次。`,
											"返回严格 JSON：revision、verdict(pass/repair/unresolved)、summary(中文)、findings([{atSeconds,description}])。只有没有待解决问题且结构错误为零才可 pass；无法判断写 unresolved。",
											`原始要求：${input.message}`,
											`用户上下文：${input.context}`,
											`检查证据：${evidence.detail}`,
										].join("\n"),
									},
									...evidence.images,
								];
							}
							if (nextInput) {
								signal?.throwIfAborted();
								const nextTurn = await connection.request({
									method: "turn/start",
									params: {
										threadId: sessionId,
										...(input.model ? { model: input.model } : {}),
										...(input.effort ? { effort: input.effort } : {}),
										...(reviewing
											? { outputSchema: REVIEW_OUTPUT_SCHEMA }
											: {}),
										clientUserMessageId: `moirai-${reviewing ? "review" : "repair"}:${turnId}`,
										additionalContext: {
											"opencut.verification": {
												kind: "application",
												value: nextInput
													.filter((part) => part.type === "text")
													.map((part) => part.text)
													.join("\n"),
											},
										},
										input: [
											{
												type: "text",
												text: reviewing
													? "检查刚才修改后的画面与时间线，说明仍需处理的问题。"
													: "根据检查结果修正已定位的问题，保留我的其他修改。",
											},
											...nextInput.filter((part) => part.type === "image"),
										],
									},
								});
								turnId = turnIdFromResponse(nextTurn);
								streamedMessage = "";
								yield { type: "turn", sessionId, turnId };
								yield {
									type: "protocol",
									id: `verification:${sessionId}:${turnId}:start`,
									method: "opencut/verification",
									threadId: sessionId,
									turnId,
									itemType: "verification",
									status: "started",
									title: reviewing ? "检查合成画面与结构" : "修正已定位的问题",
								};
								continue;
							}
						} catch (error) {
							signal?.throwIfAborted();
							const detail =
								error instanceof Error ? error.message : "验证工具返回异常。";
							yield {
								type: "protocol",
								id: `verification:${sessionId}:failed`,
								method: "opencut/verification",
								threadId: sessionId,
								turnId,
								itemType: "verification",
								status: "failed",
								title: "自动复核未完成",
								detail,
							};
							message = `${editMessage || message}\n\n自动复核未完成：${detail}`;
						}
					} else if (input.verificationMode === "basic") {
						try {
							for (const frame of await verificationFrames({
								connection,
								threadId: sessionId,
								projectId: input.projectId,
								beforeRevision: binding.revision,
							})) {
								yield { type: "protocol", ...frame };
							}
						} catch (error) {
							const detail =
								error instanceof Error ? error.message : "验证工具返回异常。";
							yield {
								type: "protocol",
								id: `verification:${sessionId}:failed`,
								method: "opencut/verification",
								threadId: sessionId,
								turnId,
								itemType: "verification",
								status: "failed",
								title: "自动复核未完成",
								detail,
							};
							message += `\n\n自动复核未完成：${detail}`;
						}
					}
					yield { type: "done", sessionId, message };
					return;
				}
			} finally {
				signal?.removeEventListener("abort", interrupt);
				subscription.close();
			}
		},
	};
}
