import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type {
	CodexProtocolFrame,
	ProviderNativeEvent,
	ProviderNativePayload,
} from "@/agent/codex-conversation";
import type { AgentEndpointRuntime } from "@/server/agent-settings";

export type ClaudeEffort = "low" | "medium" | "high" | "max";
export type ClaudeMode = "edit" | "plan";

export interface ClaudeChatInput {
	projectId: string;
	message: string;
	messageId: string;
	context: string;
	conversationId: string;
	sessionId?: string;
	model?: string;
	effort?: ClaudeEffort;
	mode?: ClaudeMode;
}

export type ClaudeChatEvent =
	| { type: "session"; sessionId: string }
	| { type: "delta"; delta: string }
	| { type: "protocol"; frame: CodexProtocolFrame }
	| { type: "native"; event: ProviderNativeEvent }
	| { type: "done"; sessionId: string; message: string }
	| { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolActivity(name: string): string {
	if (name.includes("read_project")) return "正在读取工程";
	if (name.includes("edit_project")) return "正在修改工程";
	if (name.includes("export")) return "正在导出成片";
	if (name.includes("render")) return "正在检查画面";
	return "正在调用工程工具";
}

function decodeClaudeNormalizedStreamMessage(
	value: unknown,
): ClaudeChatEvent[] {
	if (!isRecord(value) || typeof value.type !== "string") return [];
	if (
		value.type === "system" &&
		value.subtype === "init" &&
		typeof value.session_id === "string"
	) {
		return [{ type: "session", sessionId: value.session_id }];
	}
	if (
		value.type === "system" &&
		value.subtype === "api_retry" &&
		typeof value.attempt === "number" &&
		typeof value.max_retries === "number"
	) {
		return [
			{
				type: "protocol",
				frame: {
					id: "claude-api-retry",
					method: "api_retry",
					threadId:
						typeof value.session_id === "string" ? value.session_id : "claude",
					itemType: "retry",
					status: "streaming",
					title: `Claude 服务繁忙，正在重试 ${value.attempt}/${value.max_retries}`,
					...(typeof value.error_status === "number"
						? { detail: `HTTP ${value.error_status}` }
						: {}),
				},
			},
		];
	}
	if (value.type === "stream_event" && isRecord(value.event)) {
		const event = value.event;
		if (
			event.type === "content_block_delta" &&
			isRecord(event.delta) &&
			event.delta.type === "text_delta" &&
			typeof event.delta.text === "string"
		) {
			return [{ type: "delta", delta: event.delta.text }];
		}
	}
	if (
		value.type === "assistant" &&
		isRecord(value.message) &&
		Array.isArray(value.message.content)
	) {
		return value.message.content.flatMap((content): ClaudeChatEvent[] => {
			if (
				!isRecord(content) ||
				content.type !== "tool_use" ||
				typeof content.name !== "string"
			) {
				return [];
			}
			return [
				{
					type: "protocol",
					frame: {
						id: typeof content.id === "string" ? content.id : randomUUID(),
						method: content.name,
						threadId: "claude",
						itemType: "toolCall",
						status: "started",
						title: toolActivity(content.name),
					},
				},
			];
		});
	}
	if (value.type === "result") {
		const message =
			typeof value.result === "string" && value.result.trim()
				? value.result
				: "Claude Code 未返回内容。";
		if (value.is_error === true || value.subtype !== "success") {
			return [{ type: "error", message }];
		}
		if (typeof value.session_id !== "string") {
			return [{ type: "error", message: "Claude Code 未返回会话 ID。" }];
		}
		return [
			{
				type: "done",
				sessionId: value.session_id,
				message,
			},
		];
	}
	return [];
}

function claudeNativeEventName(value: unknown): string {
	if (!isRecord(value) || typeof value.type !== "string") return "unknown";
	if (value.type === "system" && typeof value.subtype === "string") {
		return `${value.type}/${value.subtype}`;
	}
	if (
		value.type === "stream_event" &&
		isRecord(value.event) &&
		typeof value.event.type === "string"
	) {
		return `${value.type}/${value.event.type}`;
	}
	if (
		value.type === "assistant" &&
		isRecord(value.message) &&
		Array.isArray(value.message.content)
	) {
		const contentType = value.message.content.find(
			(content) => isRecord(content) && typeof content.type === "string",
		);
		if (isRecord(contentType) && typeof contentType.type === "string") {
			return `${value.type}/${contentType.type}`;
		}
	}
	if (value.type === "result" && typeof value.subtype === "string") {
		return `${value.type}/${value.subtype}`;
	}
	return value.type;
}

function claudeNativeEvent({
	payload,
	raw,
	name = claudeNativeEventName(payload),
}: {
	payload: ProviderNativePayload;
	raw: string;
	name?: string;
}): ProviderNativeEvent {
	return {
		id: randomUUID(),
		provider: "claude",
		transport: "stream-json",
		name,
		payload,
		raw,
	};
}

export function decodeClaudeStreamMessage(
	value: unknown,
	raw = JSON.stringify(value) ?? String(value),
): ClaudeChatEvent[] {
	return [
		{
			type: "native",
			event: claudeNativeEvent({
				payload: value as ProviderNativePayload,
				raw,
			}),
		},
		...decodeClaudeNormalizedStreamMessage(value),
	];
}

export function buildClaudeCommand({
	sessionId,
	model = "sonnet",
	effort = "high",
	mode = "edit",
	mcpConfig,
}: {
	sessionId?: string;
	model?: string;
	effort?: ClaudeEffort;
	mode?: ClaudeMode;
	mcpConfig?: string;
}): string[] {
	return [
		"-p",
		"--input-format",
		"stream-json",
		"--output-format",
		"stream-json",
		"--include-partial-messages",
		"--verbose",
		"--model",
		model,
		"--effort",
		effort,
		"--permission-mode",
		mode === "plan" ? "plan" : "acceptEdits",
		"--allowedTools",
		"mcp__opencut__*",
		...(mcpConfig ? ["--mcp-config", mcpConfig, "--strict-mcp-config"] : []),
		...(sessionId ? ["--resume", sessionId] : []),
	];
}

export function encodeClaudeUserMessage(prompt: string): string {
	return JSON.stringify({
		type: "user",
		message: {
			role: "user",
			content: [{ type: "text", text: prompt }],
		},
	});
}

export function buildClaudePrompt(input: ClaudeChatInput): string {
	return [
		"你正在 Moirai Cut 的智能剪辑侧栏中，与用户在同一个可见、可编辑工程里协作。",
		`只操作工程 ${input.projectId}。通过已安装的 opencut MCP 读取或修改工程，不要修改 Moirai Cut 源代码。`,
		"先理解用户意图和所附上下文；需要修改时直接落回当前工程，并简洁说明结果。",
		"",
		"当前工程上下文：",
		input.context || "（未附加选区或素材引用）",
		"",
		"用户需求：",
		input.message,
	].join("\n");
}

export interface ClaudeChatService {
	stream(input: {
		binary: string;
		request: ClaudeChatInput;
		signal?: AbortSignal;
	}): AsyncIterable<ClaudeChatEvent>;
}

interface ClaudeChildProcess {
	stdin: Writable;
	stdout: Readable;
	stderr: Readable;
	exitCode: number | null;
	killed: boolean;
	kill(signal?: NodeJS.Signals | number): boolean;
	once(event: "error", listener: (error: Error) => void): this;
	once(event: "close", listener: (code: number | null) => void): this;
}

type SpawnClaudeProcess = (
	binary: string,
	args: string[],
	options: {
		cwd: string;
		env: NodeJS.ProcessEnv;
		stdio: ["pipe", "pipe", "pipe"];
	},
) => ClaudeChildProcess;

class ClaudeEventQueue implements AsyncIterable<ClaudeChatEvent> {
	private readonly values: ClaudeChatEvent[] = [];
	private readonly waiters: Array<{
		resolve: (value: IteratorResult<ClaudeChatEvent>) => void;
		reject: (error: unknown) => void;
	}> = [];
	private finished = false;
	private failure: unknown = null;

	push(value: ClaudeChatEvent): void {
		if (this.finished || this.failure) return;
		const waiter = this.waiters.shift();
		if (waiter) {
			waiter.resolve({ done: false, value });
			return;
		}
		this.values.push(value);
	}

	finish(): void {
		if (this.finished || this.failure) return;
		this.finished = true;
		if (this.values.length > 0) return;
		for (const waiter of this.waiters.splice(0)) {
			waiter.resolve({ done: true, value: undefined });
		}
	}

	fail(error: unknown): void {
		if (this.finished || this.failure) return;
		this.failure = error;
		this.values.length = 0;
		for (const waiter of this.waiters.splice(0)) waiter.reject(error);
	}

	[Symbol.asyncIterator](): AsyncIterator<ClaudeChatEvent> {
		return {
			next: async () => {
				if (this.failure) throw this.failure;
				const value = this.values.shift();
				if (value) return { done: false, value };
				if (this.finished) return { done: true, value: undefined };
				return new Promise<IteratorResult<ClaudeChatEvent>>(
					(resolve, reject) => {
						this.waiters.push({ resolve, reject });
					},
				);
			},
		};
	}
}

interface ClaudeSessionHostOptions {
	binary: string;
	command: string[];
	cwd: string;
	environment: NodeJS.ProcessEnv;
	spawnProcess: SpawnClaudeProcess;
	idleTimeoutMs: number;
	onClose(): void;
}

class ClaudeSessionHost {
	private child: ClaudeChildProcess | null = null;
	private activeQueue: ClaudeEventQueue | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private stderr = "";
	private closed = false;
	private closeNotified = false;
	private turnGate: Promise<void> = Promise.resolve();

	constructor(
		readonly signature: string,
		private readonly options: ClaudeSessionHostOptions,
	) {}

	get reusable(): boolean {
		return !this.closed && (!this.child || this.child.exitCode === null);
	}

	private notifyClosed(): void {
		if (this.closeNotified) return;
		this.closeNotified = true;
		this.options.onClose();
	}

	private failActive(error: unknown): void {
		this.activeQueue?.fail(error);
	}

	private handleLine(line: string): void {
		if (!line.trim() || !this.activeQueue) return;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			this.activeQueue.push({
				type: "native",
				event: claudeNativeEvent({
					payload: null,
					raw: line,
					name: "invalid-json",
				}),
			});
			return;
		}
		const events = decodeClaudeStreamMessage(value, line);
		for (const event of events) this.activeQueue.push(event);
		if (
			events.some((event) => event.type === "done" || event.type === "error")
		) {
			this.activeQueue.finish();
		}
	}

	private start(): ClaudeChildProcess {
		if (this.closed) throw new Error("Claude Code 长连接已经关闭。");
		if (this.child?.exitCode === null) return this.child;
		const child = this.options.spawnProcess(
			this.options.binary,
			this.options.command,
			{
				cwd: this.options.cwd,
				env: this.options.environment,
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		this.child = child;
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string | Buffer) => {
			this.stderr = `${this.stderr}${chunk.toString()}`.slice(-32_000);
		});
		const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
		lines.on("line", (line) => this.handleLine(line));
		child.once("error", (error) => {
			this.closed = true;
			this.failActive(error);
			this.notifyClosed();
		});
		child.once("close", (code) => {
			this.closed = true;
			if (this.activeQueue) {
				this.failActive(
					new Error(
						this.stderr.trim() ||
							`Claude Code exited with ${code ?? "unknown"}.`,
					),
				);
			}
			this.notifyClosed();
		});
		return child;
	}

	private clearIdleTimer(): void {
		if (!this.idleTimer) return;
		clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}

	private scheduleIdleClose(): void {
		this.clearIdleTimer();
		if (this.options.idleTimeoutMs <= 0 || this.closed) return;
		this.idleTimer = setTimeout(() => this.close(), this.options.idleTimeoutMs);
		this.idleTimer.unref?.();
	}

	private async acquireTurn(): Promise<() => void> {
		const previous = this.turnGate;
		let release = () => {};
		this.turnGate = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		return release;
	}

	async *streamTurn({
		prompt,
		signal,
	}: {
		prompt: string;
		signal?: AbortSignal;
	}): AsyncIterable<ClaudeChatEvent> {
		const release = await this.acquireTurn();
		const queue = new ClaudeEventQueue();
		this.activeQueue = queue;
		this.clearIdleTimer();
		const abort = () => {
			queue.fail(
				new DOMException("Claude Code 当前处理已停止。", "AbortError"),
			);
			this.close();
		};
		signal?.addEventListener("abort", abort, { once: true });
		try {
			if (signal?.aborted) abort();
			const child = this.start();
			await new Promise<void>((resolve, reject) => {
				child.stdin.write(`${encodeClaudeUserMessage(prompt)}\n`, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
			for await (const event of queue) yield event;
		} finally {
			signal?.removeEventListener("abort", abort);
			if (this.activeQueue === queue) this.activeQueue = null;
			release();
			this.scheduleIdleClose();
		}
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.clearIdleTimer();
		this.child?.stdin.end();
		if (this.child?.exitCode === null && !this.child.killed) {
			this.child.kill("SIGTERM");
		}
		this.notifyClosed();
	}
}

export interface ClaudeSessionPool {
	stream(input: {
		key: string;
		signature: string;
		host: Omit<ClaudeSessionHostOptions, "idleTimeoutMs" | "onClose">;
		prompt: string;
		signal?: AbortSignal;
	}): AsyncIterable<ClaudeChatEvent>;
	closeAll(): void;
}

export function createClaudeSessionPool({
	idleTimeoutMs = 15 * 60_000,
}: {
	idleTimeoutMs?: number;
} = {}): ClaudeSessionPool {
	const hosts = new Map<string, ClaudeSessionHost>();
	return {
		async *stream({ key, signature, host: hostOptions, prompt, signal }) {
			let host = hosts.get(key);
			if (!host || !host.reusable || host.signature !== signature) {
				host?.close();
				const created = new ClaudeSessionHost(signature, {
					...hostOptions,
					idleTimeoutMs,
					onClose: () => {
						if (hosts.get(key) === created) hosts.delete(key);
					},
				});
				hosts.set(key, created);
				host = created;
			}
			yield* host.streamTurn({ prompt, ...(signal ? { signal } : {}) });
		},
		closeAll() {
			for (const host of hosts.values()) host.close();
			hosts.clear();
		},
	};
}

const sharedClaudeSessionPool = createClaudeSessionPool();

function claudeSessionSignature({
	binary,
	cwd,
	command,
	environment,
}: {
	binary: string;
	cwd: string;
	command: string[];
	environment: NodeJS.ProcessEnv;
}): string {
	const providerEnvironment = Object.entries(environment)
		.filter(([key]) => /^(?:ANTHROPIC_|CLAUDE_CODE_|NODE_ENV$|PATH$)/.test(key))
		.sort(([left], [right]) => left.localeCompare(right));
	return createHash("sha256")
		.update(JSON.stringify({ binary, cwd, command, providerEnvironment }))
		.digest("hex");
}

export function buildClaudeProcessEnvironment({
	base = process.env,
	endpoint,
}: {
	base?: Record<string, string | undefined>;
	endpoint?: AgentEndpointRuntime;
} = {}): NodeJS.ProcessEnv {
	const requestedNodeEnvironment = base.NODE_ENV;
	const nodeEnvironment =
		requestedNodeEnvironment === "development" ||
		requestedNodeEnvironment === "production" ||
		requestedNodeEnvironment === "test"
			? requestedNodeEnvironment
			: (process.env.NODE_ENV ?? "production");
	const environment: NodeJS.ProcessEnv = {
		...base,
		NODE_ENV: nodeEnvironment,
	};
	if (endpoint?.mode !== "custom") return environment;
	for (const key of [
		"CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
		"CLAUDE_CODE_USE_BEDROCK",
		"CLAUDE_CODE_USE_VERTEX",
		"CLAUDE_CODE_USE_FOUNDRY",
		"ANTHROPIC_AWS_BASE_URL",
		"ANTHROPIC_BEDROCK_BASE_URL",
		"ANTHROPIC_VERTEX_BASE_URL",
		"ANTHROPIC_FOUNDRY_BASE_URL",
		"ANTHROPIC_CUSTOM_HEADERS",
	] as const) {
		delete environment[key];
	}
	environment.ANTHROPIC_BASE_URL = endpoint.baseUrl
		.replace(/\/+$/, "")
		.replace(/\/v1$/, "");
	if (endpoint.auth === "bearer") {
		environment.ANTHROPIC_AUTH_TOKEN = endpoint.credential;
		delete environment.ANTHROPIC_API_KEY;
	} else {
		environment.ANTHROPIC_API_KEY = endpoint.credential;
		delete environment.ANTHROPIC_AUTH_TOKEN;
	}
	return environment;
}

export function createClaudeChatService({
	cwd = process.cwd(),
	mcpConfig,
	endpoint,
	pool = sharedClaudeSessionPool,
	spawnProcess = spawn as SpawnClaudeProcess,
}: {
	cwd?: string;
	mcpConfig?: string;
	endpoint?: AgentEndpointRuntime;
	pool?: ClaudeSessionPool;
	spawnProcess?: SpawnClaudeProcess;
} = {}): ClaudeChatService {
	return {
		async *stream({ binary, request, signal }) {
			const environment = buildClaudeProcessEnvironment({ endpoint });
			const commonCommand = buildClaudeCommand({
				...(request.model ? { model: request.model } : {}),
				...(request.effort ? { effort: request.effort } : {}),
				...(request.mode ? { mode: request.mode } : {}),
				...(mcpConfig ? { mcpConfig } : {}),
			});
			const command = buildClaudeCommand({
				...(request.sessionId ? { sessionId: request.sessionId } : {}),
				...(request.model ? { model: request.model } : {}),
				...(request.effort ? { effort: request.effort } : {}),
				...(request.mode ? { mode: request.mode } : {}),
				...(mcpConfig ? { mcpConfig } : {}),
			});
			yield* pool.stream({
				key: `${request.projectId}:${request.conversationId}`,
				signature: claudeSessionSignature({
					binary,
					cwd,
					command: commonCommand,
					environment,
				}),
				host: {
					binary,
					command,
					cwd,
					environment,
					spawnProcess,
				},
				prompt: buildClaudePrompt(request),
				...(signal ? { signal } : {}),
			});
		},
	};
}
