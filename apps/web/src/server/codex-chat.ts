import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { configuredCodexBinary } from "@/server/codex-config";

const REQUEST_TIMEOUT_MS = 30_000;
const TURN_TIMEOUT_MS = 6 * 60 * 1_000;
const MAX_STDERR_CHARS = 16_384;
const MAX_PROTOCOL_DETAIL_CHARS = 8_000;
const MAX_PROJECT_SNAPSHOT_CHARS = 120_000;
const REQUIRED_OPENCUT_TOOLS = ["read_project", "edit_project"] as const;

export interface CodexRuntimeConfig {
	binary: string;
	repoRoot: string;
	mcpServerPath: string;
	projectFilesDir: string;
	baseUrl: string;
	disabledMcpServers?: string[];
}

export interface CodexChatInput {
	projectId: string;
	message: string;
	context: string;
	sessionId?: string;
}

export type CodexProtocolStatus =
	| "started"
	| "streaming"
	| "completed"
	| "failed"
	| "info";

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
	| { type: "delta"; delta: string }
	| ({ type: "protocol" } & CodexProtocolFrame)
	| { type: "done"; sessionId: string; message: string };

export interface CodexAppServerSubscription extends AsyncIterable<unknown> {
	close(): void;
}

export interface CodexAppServerConnection {
	request(input: { method: string; params: unknown }): Promise<unknown>;
	subscribe(threadId: string): CodexAppServerSubscription;
}

export type CodexAppServerConnector = (
	runtime: CodexRuntimeConfig,
) => Promise<CodexAppServerConnection>;

export interface CodexChatService {
	stream(input: {
		input: CodexChatInput;
		signal?: AbortSignal;
	}): AsyncIterable<CodexChatEvent>;
}

export class CodexChatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CodexChatError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function tomlString(value: string): string {
	return JSON.stringify(value);
}

function commonCodexConfigArgs(runtime: CodexRuntimeConfig): string[] {
	const disabledMcpArgs = Array.from(new Set(runtime.disabledMcpServers ?? []))
		.filter(
			(serverName) =>
				serverName !== "opencut" && /^[A-Za-z0-9_-]+$/.test(serverName),
		)
		.flatMap((serverName) => ["-c", `mcp_servers.${serverName}.enabled=false`]);
	return [
		"-c",
		'approval_policy="never"',
		"-c",
		'sandbox_mode="read-only"',
		"-c",
		"mcp_servers={}",
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

export function buildCodexAppServerArgs(runtime: CodexRuntimeConfig): string[] {
	return ["app-server", "--stdio", ...commonCodexConfigArgs(runtime)];
}

export function buildCodexPrompt({
	projectId,
	message,
	context,
	projectSnapshot = "",
}: CodexChatInput & { projectSnapshot?: string }): string {
	return [
		"你正在 OpenCut 编辑器的“智能剪辑”直接 Codex 会话中。",
		`唯一允许操作的工程 ID：${projectId}`,
		"",
		"本轮系统预绑定：",
		"- OpenCut MCP 已由系统验证就绪，服务器名为 opencut，工具入口已直接暴露给当前会话。",
		"- 当前工程摘要已由系统预读；编辑器中的当前选区、播放头和显式引用也已随本消息提供。",
		"- 不要声称没有 OpenCut 工具、正在连接或正在查找 OpenCut MCP；不要自行连接或启动 MCP。若后续调用失败，只报告具体调用错误。",
		"",
		"工作方式：",
		"- 这是执行型会话。用户提出明确的剪辑要求时，直接执行，不要只给计划。",
		"- 任何工程读取和改动都必须使用 opencut MCP；不要修改 OpenCut 源码仓库。",
		"- 这是 OpenCut 工程，不是 LocalCut 任务。不要读取、调用或套用 LocalCut、localcut-native-video 技能、MCP、运行时或工作流。",
		"- 当前运行在内置浏览器，使用 read_project 和 edit_project 这组文件工具读取及修改工程。",
		"- 不要调用 status、get_context、open_editor、reveal_context 等依赖 Chrome 9222 的标签页工具；引用上下文已随本消息提供。",
		"- 若上下文包含时间段且任务需要理解画面，调用 inspect_timeline_range；若要先理解某个完整源视频，调用 inspect_media_scenes。",
		"- 你能直接看上述工具返回的联系表图片并做多模态判断。可复用的素材理解结果用 save_media_analysis 写入素材 JSON 目录。",
		"- 不要运行 lint_cut、render_frames、导出质检、字幕数量校验或其他额外检查，除非用户明确要求。",
		"- 不要套用本地模板或最低素材数量规则。信息足够时自主判断并完成。",
		"- 只处理下面这条用户消息。完成后用简洁中文说明实际做了什么；若未改动，明确说明原因。",
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

export class CodexAppServerRpcClient implements CodexAppServerConnection {
	private nextRequestId = 0;
	private readonly pending = new Map<number, PendingRpcRequest>();
	private readonly subscriptions = new Map<
		string,
		Set<AppServerSubscription>
	>();
	private stderr = "";
	isOpen = true;

	constructor(private readonly child: ChildProcessWithoutNullStreams) {
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
					title: "OpenCut 智能剪辑",
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
			}, REQUEST_TIMEOUT_MS);
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
				message: `OpenCut 不支持 Codex app-server 请求：${message.method}`,
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

let sharedConnectionPromise: Promise<CodexAppServerRpcClient> | null = null;

async function createAppServerConnection(
	runtime: CodexRuntimeConfig,
): Promise<CodexAppServerRpcClient> {
	const child = spawn(runtime.binary, buildCodexAppServerArgs(runtime), {
		cwd: runtime.repoRoot,
		env: passthroughEnvironment(runtime),
		shell: false,
		stdio: ["pipe", "pipe", "pipe"],
	});
	const connection = new CodexAppServerRpcClient(child);
	await connection.initialize();
	return connection;
}

const connectSharedAppServer: CodexAppServerConnector = async (runtime) => {
	if (!sharedConnectionPromise) {
		sharedConnectionPromise = createAppServerConnection(runtime).catch(
			(error) => {
				sharedConnectionPromise = null;
				throw error;
			},
		);
	}
	const connection = await sharedConnectionPromise;
	if (connection.isOpen) return connection;
	sharedConnectionPromise = null;
	return connectSharedAppServer(runtime);
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
		throw new CodexChatError("无法定位 OpenCut MCP 服务。");
	}
	return root;
}

export function resolveCodexRuntimeConfig(): CodexRuntimeConfig {
	const repoRoot = repoRootFromCurrentWorkingDirectory();
	return {
		binary: configuredCodexBinary(),
		repoRoot,
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
		disabledMcpServers: configuredMcpServerNames(),
	};
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
			title: `${server === "opencut" ? "OpenCut" : server} · ${tool}`,
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
			title: accepted ? "OpenCut 调用已授权" : `${serverName} 请求已拒绝`,
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

async function nextWithDeadline({
	iterator,
	deadline,
}: {
	iterator: AsyncIterator<unknown>;
	deadline: number;
}): Promise<IteratorResult<unknown>> {
	const remaining = deadline - Date.now();
	if (remaining <= 0) {
		throw new CodexChatError("Codex 响应超时，请重试。");
	}
	let timer: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			iterator.next(),
			new Promise<IteratorResult<unknown>>((_, reject) => {
				timer = setTimeout(
					() => reject(new CodexChatError("Codex 响应超时，请重试。")),
					remaining,
				);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

interface OpenCutSessionBinding {
	tools: string[];
	projectSnapshot: string;
	revision: number | null;
}

function projectSnapshotFromToolResponse(response: unknown): string {
	if (!isRecord(response)) {
		throw new CodexChatError("当前工程上下文读取失败：OpenCut 返回格式无效。");
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
			`当前工程上下文读取失败：${snapshot || "OpenCut MCP 调用失败。"}`,
		);
	}
	if (!snapshot) {
		throw new CodexChatError(
			"当前工程上下文读取失败：OpenCut 未返回工程摘要。",
		);
	}
	if (snapshot.length <= MAX_PROJECT_SNAPSHOT_CHARS) return snapshot;
	return `${snapshot.slice(0, MAX_PROJECT_SNAPSHOT_CHARS)}\n…工程摘要已截断`;
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

async function bindOpenCutSession({
	connection,
	threadId,
	projectId,
}: {
	connection: CodexAppServerConnection;
	threadId: string;
	projectId: string;
}): Promise<OpenCutSessionBinding> {
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
			"OpenCut MCP 未就绪：当前 Codex 会话没有可用的 opencut 工具入口。",
		);
	}
	const tools = Object.keys(openCut.tools);
	const missingTools = REQUIRED_OPENCUT_TOOLS.filter(
		(tool) => !tools.includes(tool),
	);
	if (missingTools.length > 0) {
		throw new CodexChatError(
			`OpenCut MCP 未就绪：缺少 ${missingTools.join("、")} 工具。`,
		);
	}

	const projectResponse = await connection.request({
		method: "mcpServer/tool/call",
		params: {
			threadId,
			server: "opencut",
			tool: "read_project",
			arguments: { projectId, detail: "summary" },
		},
	});
	const projectSnapshot = projectSnapshotFromToolResponse(projectResponse);
	return {
		tools,
		projectSnapshot,
		revision: revisionFromProjectSnapshot(projectSnapshot),
	};
}

export function createCodexChatService({
	runtime = resolveCodexRuntimeConfig(),
	connect = connectSharedAppServer,
}: {
	runtime?: CodexRuntimeConfig;
	connect?: CodexAppServerConnector;
} = {}): CodexChatService {
	const sessions = new Map<string, string>();
	return {
		async *stream({ input, signal }) {
			const connection = await connect(runtime);
			const requestedSessionId =
				input.sessionId?.trim() || sessions.get(input.projectId);
			const threadResponse = await connection.request({
				method: requestedSessionId ? "thread/resume" : "thread/start",
				params: requestedSessionId
					? {
							threadId: requestedSessionId,
							cwd: runtime.repoRoot,
							runtimeWorkspaceRoots: [
								runtime.repoRoot,
								runtime.projectFilesDir,
							],
							approvalPolicy: "never",
							sandbox: "read-only",
							excludeTurns: true,
						}
					: {
							cwd: runtime.repoRoot,
							runtimeWorkspaceRoots: [
								runtime.repoRoot,
								runtime.projectFilesDir,
							],
							approvalPolicy: "never",
							sandbox: "read-only",
						},
			});
			const sessionId = threadIdFromResponse(threadResponse);
			sessions.set(input.projectId, sessionId);
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
					method: requestedSessionId ? "thread/resume" : "thread/start",
					threadId: sessionId,
					status: "completed",
					title: requestedSessionId ? "Codex 会话已恢复" : "Codex 会话已连接",
				};
				const binding = await bindOpenCutSession({
					connection,
					threadId: sessionId,
					projectId: input.projectId,
				});
				yield {
					type: "protocol",
					id: `mcp:${sessionId}:opencut`,
					method: "mcpServerStatus/list",
					threadId: sessionId,
					itemType: "mcpToolCall",
					status: "completed",
					title: "OpenCut MCP 已就绪",
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
				const turnResponse = await connection.request({
					method: "turn/start",
					params: {
						threadId: sessionId,
						input: [
							{
								type: "text",
								text: buildCodexPrompt({
									...input,
									projectSnapshot: binding.projectSnapshot,
								}),
								text_elements: [],
							},
						],
					},
				});
				turnId = turnIdFromResponse(turnResponse);
				yield {
					type: "protocol",
					id: `turn:${turnId}`,
					method: "turn/start",
					threadId: sessionId,
					turnId,
					status: "started",
					title: "开始处理",
				};
				const deadline = Date.now() + TURN_TIMEOUT_MS;
				let streamedMessage = "";

				for (;;) {
					if (signal?.aborted) {
						throw new CodexChatError("Codex 会话已取消。");
					}
					const next = await nextWithDeadline({ iterator, deadline });
					if (next.done) {
						throw new CodexChatError("Codex 事件流提前结束。");
					}
					if (!isRecord(next.value)) continue;
					if (notificationTurnId(next.value) !== turnId) continue;
					const notification = next.value;

					if (
						notification.method === "item/agentMessage/delta" &&
						isRecord(notification.params) &&
						typeof notification.params.delta === "string"
					) {
						streamedMessage += notification.params.delta;
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
					if (completedTurn.status === "failed") {
						const message =
							isRecord(completedTurn.error) &&
							typeof completedTurn.error.message === "string"
								? completedTurn.error.message
								: "Codex 本轮处理失败。";
						throw new CodexChatError(message);
					}
					if (completedTurn.status !== "completed") {
						throw new CodexChatError("Codex 本轮处理已中断。");
					}
					const message =
						finalMessageFromTurn(completedTurn) ||
						streamedMessage.trim() ||
						"Codex 已完成处理。";
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
