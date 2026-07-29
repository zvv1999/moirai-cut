import { execFile } from "node:child_process";
import path from "node:path";

export type CodexConnectionStatus =
	| "ready"
	| "login-required"
	| "unavailable"
	| "invalid";

export interface CodexConnection {
	provider: "path";
	path: string;
	status: CodexConnectionStatus;
	executable: boolean;
	authenticated: boolean;
	version: string | null;
	message: string;
}

export type CodexCommandRunner = (
	options: {
		binary: string;
		args: string[];
	},
) => Promise<{ stdout: string; stderr: string }>;

export const DESKTOP_CODEX_BIN =
	"/Applications/ChatGPT.app/Contents/Resources/codex";

const runCodexCommand: CodexCommandRunner = ({ binary, args }) =>
	new Promise((resolve, reject) => {
		execFile(
			binary,
			args,
			{
				encoding: "utf8",
				maxBuffer: 64 * 1024,
				timeout: 5_000,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}
				resolve({ stdout, stderr });
			},
		);
	});

export function configuredCodexBinary(): string {
	return process.env.CODEX_BIN?.trim() || DESKTOP_CODEX_BIN;
}

export async function inspectCodexBinary({
	binary,
	run = runCodexCommand,
}: {
	binary: string;
	run?: CodexCommandRunner;
}): Promise<CodexConnection> {
	const resolvedBinary = binary.trim();
	if (
		!path.isAbsolute(resolvedBinary) ||
		path.basename(resolvedBinary) !== "codex"
	) {
		return {
			provider: "path",
			path: resolvedBinary,
			status: "invalid",
			executable: false,
			authenticated: false,
			version: null,
			message: "Codex Path 必须是名为 codex 的绝对路径。",
		};
	}

	let version: string;
	try {
		const result = await run({
			binary: resolvedBinary,
			args: ["--version"],
		});
		version = result.stdout.trim();
		if (!version) {
			throw new Error("Codex CLI did not return a version");
		}
	} catch {
		return {
			provider: "path",
			path: resolvedBinary,
			status: "unavailable",
			executable: false,
			authenticated: false,
			version: null,
			message: "无法执行 Codex CLI，请检查 Path。",
		};
	}

	try {
		const login = await run({
			binary: resolvedBinary,
			args: ["login", "status"],
		});
		const loginOutput = `${login.stdout}\n${login.stderr}`;
		if (!/logged in/i.test(loginOutput)) {
			throw new Error("Codex CLI is not logged in");
		}
	} catch {
		return {
			provider: "path",
			path: resolvedBinary,
			status: "login-required",
			executable: true,
			authenticated: false,
			version,
			message: "Codex CLI 可用，但尚未登录。请先运行 codex login。",
		};
	}

	return {
		provider: "path",
		path: resolvedBinary,
		status: "ready",
		executable: true,
		authenticated: true,
		version,
		message: "Codex CLI 已连接，可使用当前 ChatGPT 登录。",
	};
}
