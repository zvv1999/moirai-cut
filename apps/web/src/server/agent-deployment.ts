import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export type AgentProviderId = "codex" | "claude";
export type AgentConnectionStatus =
	"ready" | "login-required" | "unavailable" | "invalid";
export type AgentRuntimeSource = "environment" | "desktop" | "path";

export interface AgentRuntimeCandidate {
	provider: AgentProviderId;
	binary: string;
	source: AgentRuntimeSource;
}

export interface AgentProviderConnection {
	provider: AgentProviderId;
	label: string;
	source: AgentRuntimeSource;
	binary: string;
	status: AgentConnectionStatus;
	executable: boolean;
	authenticated: boolean;
	version: string | null;
	message: string;
	capabilities: {
		browserChat: boolean;
		mcp: boolean;
		sharedConversation: boolean;
	};
}

export interface AgentDiscovery {
	providers: AgentProviderConnection[];
	recommendedProvider: AgentProviderId | null;
}

export type AgentCommandRunner = (options: {
	binary: string;
	args: string[];
	timeoutMs?: number;
}) => Promise<{ stdout: string; stderr: string }>;

export interface OpenCutMcpRuntime {
	command: string;
	serverPath: string;
	baseUrl: string;
	projectFilesDir: string;
}

export interface OpenCutMcpInstallResult {
	provider: AgentProviderId;
	changed: boolean;
	verified: boolean;
	message: string;
}

const runAgentCommand: AgentCommandRunner = ({
	binary,
	args,
	timeoutMs = 8_000,
}) =>
	new Promise((resolve, reject) => {
		execFile(
			binary,
			args,
			{
				encoding: "utf8",
				maxBuffer: 128 * 1024,
				timeout: timeoutMs,
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

function providerLabel(provider: AgentProviderId): string {
	return provider === "codex" ? "Codex" : "Claude";
}

function expectedBinaryName(provider: AgentProviderId): string[] {
	return process.platform === "win32"
		? [provider, `${provider}.exe`, `${provider}.cmd`]
		: [provider];
}

function unavailableConnection(
	provider: AgentProviderId,
	candidate?: AgentRuntimeCandidate,
): AgentProviderConnection {
	const label = providerLabel(provider);
	return {
		provider,
		label,
		source: candidate?.source ?? "path",
		binary: candidate?.binary ?? "",
		status: "unavailable",
		executable: false,
		authenticated: false,
		version: null,
		message: `未检测到 ${label}，可安装后重新检测。`,
		capabilities: {
			browserChat: provider === "codex",
			mcp: true,
			sharedConversation: provider === "codex",
		},
	};
}

async function inspectCandidate({
	candidate,
	run,
}: {
	candidate: AgentRuntimeCandidate;
	run: AgentCommandRunner;
}): Promise<AgentProviderConnection> {
	const { binary, provider, source } = candidate;
	const label = providerLabel(provider);
	const base = {
		provider,
		label,
		source,
		binary,
		capabilities: {
			browserChat: provider === "codex",
			mcp: true,
			sharedConversation: provider === "codex",
		},
	} as const;

	if (
		!path.isAbsolute(binary) ||
		!expectedBinaryName(provider).includes(path.basename(binary))
	) {
		return {
			...base,
			status: "invalid",
			executable: false,
			authenticated: false,
			version: null,
			message: `${label} 可执行文件路径无效。`,
		};
	}

	let version: string;
	try {
		const result = await run({ binary, args: ["--version"] });
		version = `${result.stdout}\n${result.stderr}`.trim();
		if (!version) throw new Error("empty version");
	} catch {
		return {
			...base,
			status: "unavailable",
			executable: false,
			authenticated: false,
			version: null,
			message: `${label} 已找到但无法启动，请检查安装。`,
		};
	}

	try {
		const result =
			provider === "codex"
				? await run({ binary, args: ["login", "status"] })
				: await run({ binary, args: ["auth", "status"] });
		const output = `${result.stdout}\n${result.stderr}`.trim();
		const authenticated =
			provider === "codex"
				? /logged in/i.test(output)
				: /"loggedIn"\s*:\s*true/i.test(output) ||
					/\blogged in\b/i.test(output);
		if (!authenticated) throw new Error("not authenticated");
	} catch {
		return {
			...base,
			status: "login-required",
			executable: true,
			authenticated: false,
			version,
			message: `${label} 已安装，登录后即可复用现有账号。`,
		};
	}

	return {
		...base,
		status: "ready",
		executable: true,
		authenticated: true,
		version,
		message:
			provider === "codex"
				? "已复用本机 Codex 登录，可直接在 OpenCut 中使用。"
				: "已复用本机 Claude 登录，可安装 MCP 后在 Claude 中控制工程。",
	};
}

async function executableOnPath(
	name: string,
	pathValue = process.env.PATH ?? "",
): Promise<string | null> {
	const extensions =
		process.platform === "win32"
			? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
			: [""];
	for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
		for (const extension of extensions) {
			const candidate = path.join(
				directory,
				`${name}${extension.toLowerCase()}`,
			);
			try {
				await access(
					candidate,
					process.platform === "win32" ? constants.F_OK : constants.X_OK,
				);
				return path.resolve(candidate);
			} catch {
				// Keep looking through PATH.
			}
		}
	}
	return null;
}

function deduplicateCandidates(
	candidates: AgentRuntimeCandidate[],
): AgentRuntimeCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = `${candidate.provider}:${candidate.binary}`;
		if (!candidate.binary || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export async function defaultAgentRuntimeCandidates(): Promise<
	AgentRuntimeCandidate[]
> {
	const candidates: AgentRuntimeCandidate[] = [];
	const configured = [
		{ provider: "codex" as const, binary: process.env.CODEX_BIN?.trim() },
		{ provider: "claude" as const, binary: process.env.CLAUDE_BIN?.trim() },
	];
	for (const candidate of configured) {
		if (candidate.binary) {
			candidates.push({
				provider: candidate.provider,
				binary: candidate.binary,
				source: "environment",
			});
		}
	}
	if (process.platform === "darwin") {
		candidates.push(
			{
				provider: "codex",
				binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
				source: "desktop",
			},
			{
				provider: "codex",
				binary: "/Applications/Codex.app/Contents/Resources/codex",
				source: "desktop",
			},
		);
	}
	const [codexOnPath, claudeOnPath] = await Promise.all([
		executableOnPath("codex"),
		executableOnPath("claude"),
	]);
	if (codexOnPath) {
		candidates.push({
			provider: "codex",
			binary: codexOnPath,
			source: "path",
		});
	}
	if (claudeOnPath) {
		candidates.push({
			provider: "claude",
			binary: claudeOnPath,
			source: "path",
		});
	}
	return deduplicateCandidates(candidates);
}

const statusRank: Record<AgentConnectionStatus, number> = {
	ready: 4,
	"login-required": 3,
	unavailable: 2,
	invalid: 1,
};
const sourceRank: Record<AgentRuntimeSource, number> = {
	environment: 3,
	desktop: 2,
	path: 1,
};

function preferredConnection(
	connections: AgentProviderConnection[],
	provider: AgentProviderId,
): AgentProviderConnection {
	return (
		connections
			.filter((connection) => connection.provider === provider)
			.sort(
				(left, right) =>
					statusRank[right.status] - statusRank[left.status] ||
					sourceRank[right.source] - sourceRank[left.source],
			)[0] ?? unavailableConnection(provider)
	);
}

export async function discoverAgentProviders({
	candidates,
	run = runAgentCommand,
}: {
	candidates?: AgentRuntimeCandidate[];
	run?: AgentCommandRunner;
} = {}): Promise<AgentDiscovery> {
	const resolvedCandidates =
		candidates ?? (await defaultAgentRuntimeCandidates());
	const inspected = await Promise.all(
		resolvedCandidates.map((candidate) => inspectCandidate({ candidate, run })),
	);
	const providers = (["codex", "claude"] as const).map((provider) =>
		preferredConnection(inspected, provider),
	);
	return {
		providers,
		recommendedProvider:
			providers.find((connection) => connection.status === "ready")?.provider ??
			null,
	};
}

export async function inspectOpenCutMcpRegistration({
	provider: _provider,
	binary,
	run = runAgentCommand,
}: {
	provider: AgentProviderId;
	binary: string;
	run?: AgentCommandRunner;
}): Promise<boolean> {
	try {
		const result = await run({
			binary,
			args: ["mcp", "get", "opencut"],
			timeoutMs: 12_000,
		});
		return /opencut|connected|enabled/i.test(
			`${result.stdout}\n${result.stderr}`,
		);
	} catch {
		return false;
	}
}

export async function installOpenCutMcp({
	provider,
	binary,
	runtime,
	run = runAgentCommand,
}: {
	provider: AgentProviderId;
	binary: string;
	runtime: OpenCutMcpRuntime;
	run?: AgentCommandRunner;
}): Promise<OpenCutMcpInstallResult> {
	if (await inspectOpenCutMcpRegistration({ provider, binary, run })) {
		return {
			provider,
			changed: false,
			verified: true,
			message: `${providerLabel(provider)} 已安装 OpenCut MCP。`,
		};
	}

	const environmentArguments = [
		"--env",
		`OPENCUT_BASE_URL=${runtime.baseUrl}`,
		"--env",
		`OPENCUT_PROJECTS_DIR=${runtime.projectFilesDir}`,
	];
	const args =
		provider === "codex"
			? [
					"mcp",
					"add",
					...environmentArguments,
					"opencut",
					"--",
					runtime.command,
					runtime.serverPath,
				]
			: [
					"mcp",
					"add",
					"--scope",
					"user",
					...environmentArguments,
					"opencut",
					"--",
					runtime.command,
					runtime.serverPath,
				];
	await run({ binary, args, timeoutMs: 15_000 });
	const verified = await inspectOpenCutMcpRegistration({
		provider,
		binary,
		run,
	});
	if (!verified) {
		throw new Error(
			`${providerLabel(provider)} 已写入配置，但 OpenCut MCP 验证失败。`,
		);
	}
	return {
		provider,
		changed: true,
		verified: true,
		message: `${providerLabel(provider)} 已安装并验证 OpenCut MCP。`,
	};
}
