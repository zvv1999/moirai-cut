import {
	spawn,
	type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { configuredCodexBinary } from "@/server/codex-config";

const REQUEST_TIMEOUT_MS = 30_000;
const TURN_TIMEOUT_MS = 6 * 60 * 1_000;
const MAX_STDERR_CHARS = 16_384;

export interface CodexRuntimeConfig {
	binary: string;
	repoRoot: string;
	mcpServerPath: string;
	projectFilesDir: string;
	baseUrl: string;
}

export interface CodexChatInput {
	projectId: string;
	message: string;
	context: string;
	sessionId?: string;
}

export type CodexChatEvent =
	| { type: "session"; sessionId: string }
	| { type: "delta"; delta: string }
	| {
			type: "activity";
			itemId: string;
			label: string;
			status: "started" | "completed";
		}
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
	return [
		"-c",
		'approval_policy="never"',
		"-c",
		'sandbox_mode="read-only"',
		"-c",
		"mcp_servers={}",
		"-c",
		'mcp_servers.opencut.command="node"',
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

export function buildCodexAppServerArgs(
	runtime: CodexRuntimeConfig,
): string[] {
	return ["app-server", "--stdio", ...commonCodexConfigArgs(runtime)];
}

export function buildCodexPrompt({
	projectId,
	message,
	context,
}: CodexChatInput): string {
	return [
		"你正在 OpenCut 编辑器的“智能剪辑”直接 Codex 会话中。",
		`唯一允许操作的工程 ID：${projectId}`,
		"",
		"工作方式：",
		"- 这是执行型会话。用户提出明确的剪辑要求时，直接执行，不要只给计划。",
		"- 任何工程读取和改动都必须使用 opencut MCP；不要修改 OpenCut 源码仓库。",
		"- 当前运行在内置浏览器，使用 read_project 和 edit_project 这组文件工具读取及修改工程。",
		"- 不要调用 status、get_context、open_editor、reveal_context 等依赖 Chrome 9222 的标签页工具；引用上下文已随本消息提供。",
		"- 不要运行 lint_cut、render_frames、导出质检、字幕数量校验或其他额外检查，除非用户明确要求。",
		"- 不要套用本地模板或最低素材数量规则。信息足够时自主判断并完成。",
		"- 只处理下面这条用户消息。完成后用简洁中文说明实际做了什么；若未改动，明确说明原因。",
		"",
		"当前编辑器上下文：",
		context.trim() || "未附加素材或时间轴引用；可通过 read_project 读取工程。",
		"",
		"用户消息：",
		message.trim(),
	].join("\n");
}

function passthroughEnvironment(runtime: CodexRuntimeConfig): NodeJS.ProcessEnv {
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

class CodexAppServerRpcClient implements CodexAppServerConnection {
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
						"item/reasoning/summaryTextDelta",
						"item/reasoning/summaryPartAdded",
						"item/reasoning/textDelta",
						"item/commandExecution/outputDelta",
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

	private handleLine(line: string): void {
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			return;
		}
		if (!isRecord(message)) return;
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
		sharedConnectionPromise = createAppServerConnection(runtime).catch((error) => {
			sharedConnectionPromise = null;
			throw error;
		});
	}
	const connection = await sharedConnectionPromise;
	if (connection.isOpen) return connection;
	sharedConnectionPromise = null;
	return connectSharedAppServer(runtime);
};

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

function notificationTurnId(notification: Record<string, unknown>): string | null {
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
				const turnResponse = await connection.request({
					method: "turn/start",
					params: {
						threadId: sessionId,
						input: [
							{
								type: "text",
								text: buildCodexPrompt(input),
								text_elements: [],
							},
						],
					},
				});
				turnId = turnIdFromResponse(turnResponse);
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

					if (
						(notification.method === "item/started" ||
							notification.method === "item/completed") &&
						isRecord(notification.params) &&
						isRecord(notification.params.item) &&
						notification.params.item.type === "mcpToolCall" &&
						typeof notification.params.item.id === "string" &&
						typeof notification.params.item.tool === "string"
					) {
						yield {
							type: "activity",
							itemId: notification.params.item.id,
							label: `OpenCut · ${notification.params.item.tool}`,
							status:
								notification.method === "item/started"
									? "started"
									: "completed",
						};
						continue;
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
