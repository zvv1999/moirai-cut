import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { configuredCodexBinary } from "@/server/codex-config";

const DEFAULT_TIMEOUT_MS = 6 * 60 * 1_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

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
}

export interface CodexChatResult {
	sessionId: string;
	message: string;
}

export interface CodexChatProcessInput {
	binary: string;
	args: string[];
	cwd: string;
	stdin: string;
	env: NodeJS.ProcessEnv;
	timeoutMs: number;
}

export type CodexChatProcessRunner = (
	input: CodexChatProcessInput,
) => Promise<{ stdout: string; stderr: string }>;

export interface CodexChatService {
	send(input: CodexChatInput): Promise<CodexChatResult>;
}

export class CodexChatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CodexChatError";
	}
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

export function buildCodexExecArgs({
	runtime,
	sessionId,
}: {
	runtime: CodexRuntimeConfig;
	sessionId?: string;
}): string[] {
	const shared = [
		"--json",
		"--ignore-user-config",
		"--skip-git-repo-check",
		...commonCodexConfigArgs(runtime),
	];
	if (sessionId) {
		return ["exec", "resume", ...shared, sessionId, "-"];
	}
	return [
		"exec",
		"--json",
		"--color",
		"never",
		"--ignore-user-config",
		"--skip-git-repo-check",
		"--sandbox",
		"read-only",
		"-C",
		runtime.repoRoot,
		"--add-dir",
		runtime.projectFilesDir,
		...commonCodexConfigArgs(runtime),
		"-",
	];
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

export function parseCodexJsonl(stdout: string): CodexChatResult {
	let sessionId: string | null = null;
	let message: string | null = null;
	let lastError: string | null = null;

	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		let event: unknown;
		try {
			event = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (!event || typeof event !== "object" || !("type" in event)) continue;
		if (
			event.type === "thread.started" &&
			"thread_id" in event &&
			typeof event.thread_id === "string"
		) {
			sessionId = event.thread_id;
			continue;
		}
		if (event.type === "error" && "message" in event) {
			if (typeof event.message === "string") lastError = event.message;
			continue;
		}
		if (
			event.type !== "item.completed" ||
			!("item" in event) ||
			!event.item ||
			typeof event.item !== "object" ||
			!("type" in event.item)
		) {
			continue;
		}
		if (
			event.item.type === "agent_message" &&
			"text" in event.item &&
			typeof event.item.text === "string"
		) {
			message = event.item.text.trim();
		}
		if (
			event.item.type === "error" &&
			"message" in event.item &&
			typeof event.item.message === "string"
		) {
			lastError = event.item.message;
		}
	}

	if (!sessionId) {
		throw new CodexChatError("Codex 没有返回会话 ID。");
	}
	if (!message) {
		throw new CodexChatError(lastError ?? "Codex 没有返回回复。");
	}
	return { sessionId, message };
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

export const runCodexProcess: CodexChatProcessRunner = ({
	binary,
	args,
	cwd,
	stdin,
	env,
	timeoutMs,
}) =>
	new Promise((resolve, reject) => {
		const child = spawn(binary, args, {
			cwd,
			env,
			shell: false,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let outputBytes = 0;
		let settled = false;

		const finish = ({
			error,
			result,
		}: {
			error?: Error;
			result?: { stdout: string; stderr: string };
		}) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error) {
				reject(error);
				return;
			}
			if (result) resolve(result);
		};
		const append = ({
			chunk,
			target,
		}: {
			chunk: Buffer;
			target: "stdout" | "stderr";
		}) => {
			outputBytes += chunk.byteLength;
			if (outputBytes > MAX_OUTPUT_BYTES) {
				child.kill("SIGTERM");
				finish({ error: new CodexChatError("Codex 输出超过安全上限。") });
				return;
			}
			if (target === "stdout") stdout += chunk.toString("utf8");
			else stderr += chunk.toString("utf8");
		};
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			finish({ error: new CodexChatError("Codex 响应超时，请重试。") });
		}, timeoutMs);

		child.stdout.on("data", (chunk: Buffer) =>
			append({ chunk, target: "stdout" }),
		);
		child.stderr.on("data", (chunk: Buffer) =>
			append({ chunk, target: "stderr" }),
		);
		child.on("error", (error) => finish({ error }));
		child.on("close", (code) => {
			if (code !== 0) {
				finish({
					error: new CodexChatError(
						stderr.trim() || `Codex 进程退出，状态码 ${code ?? "unknown"}。`,
					),
				});
				return;
			}
			finish({ result: { stdout, stderr } });
		});
		child.stdin.end(stdin);
	});

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

export function createCodexChatService({
	runtime = resolveCodexRuntimeConfig(),
	run = runCodexProcess,
}: {
	runtime?: CodexRuntimeConfig;
	run?: CodexChatProcessRunner;
} = {}): CodexChatService {
	const sessions = new Map<string, string>();
	return {
		async send(input) {
			const previousSessionId = sessions.get(input.projectId);
			const result = await run({
				binary: runtime.binary,
				args: buildCodexExecArgs({
					runtime,
					...(previousSessionId ? { sessionId: previousSessionId } : {}),
				}),
				cwd: runtime.repoRoot,
				stdin: buildCodexPrompt(input),
				env: passthroughEnvironment(runtime),
				timeoutMs: DEFAULT_TIMEOUT_MS,
			});
			const parsed = parseCodexJsonl(result.stdout);
			sessions.set(input.projectId, parsed.sessionId);
			return parsed;
		},
	};
}
