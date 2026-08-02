import { execFile } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import {
	discoverAgentProviders,
	inspectOpenCutMcpRegistration,
	type AgentCommandRunner,
	type AgentDiscovery,
	type AgentProviderConnection,
	type OpenCutMcpRuntime,
} from "@/server/agent-deployment";

export type AgentDoctorStatus = "pass" | "warning" | "fail";

export interface AgentDoctorCheck {
	id: "web" | "projects" | "runtime" | "media" | "provider" | "mcp";
	label: string;
	status: AgentDoctorStatus;
	detail: string;
	action?: string;
}

export interface AgentDoctorSnapshot {
	checkedAt: string;
	score: number;
	ready: boolean;
	blocking: string[];
	recommendedProvider: AgentDiscovery["recommendedProvider"];
	providers: Array<AgentProviderConnection & { mcpInstalled: boolean }>;
	checks: AgentDoctorCheck[];
}

const CHECK_WEIGHTS: Record<AgentDoctorCheck["id"], number> = {
	web: 10,
	projects: 15,
	runtime: 15,
	media: 15,
	provider: 25,
	mcp: 20,
};

const BLOCKING_CHECKS = new Set<AgentDoctorCheck["id"]>([
	"web",
	"projects",
	"runtime",
	"provider",
]);

export function scoreAgentReadiness(checks: AgentDoctorCheck[]): {
	score: number;
	ready: boolean;
	blocking: string[];
} {
	let score = 0;
	const blocking: string[] = [];
	for (const check of checks) {
		const weight = CHECK_WEIGHTS[check.id];
		if (check.status === "pass") score += weight;
		if (check.status === "warning") score += Math.round(weight * 0.4);
		if (check.status === "fail" && BLOCKING_CHECKS.has(check.id)) {
			blocking.push(check.id);
		}
	}
	return {
		score,
		ready: blocking.length === 0 && score >= 80,
		blocking,
	};
}

const runCommand: AgentCommandRunner = ({ binary, args, timeoutMs = 6_000 }) =>
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

async function commandVersion(
	binary: string,
	run: AgentCommandRunner,
	args = ["--version"],
): Promise<string | null> {
	try {
		const result = await run({ binary, args });
		return `${result.stdout}\n${result.stderr}`.trim().split("\n")[0] ?? null;
	} catch {
		return null;
	}
}

function mediaCommand(name: "ffmpeg" | "ffprobe"): string {
	const configured =
		name === "ffmpeg"
			? process.env.FFMPEG_BIN?.trim()
			: process.env.FFPROBE_BIN?.trim();
	if (configured) return configured;
	return (
		[
			`/opt/homebrew/bin/${name}`,
			`/usr/local/bin/${name}`,
			`/usr/bin/${name}`,
		].find((candidate) => existsSync(candidate)) ?? name
	);
}

async function writableDirectory(directory: string): Promise<boolean> {
	try {
		await mkdir(directory, { recursive: true });
		await access(directory, constants.R_OK | constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

export async function runAgentDoctor({
	runtime,
	discovery,
	run = runCommand,
}: {
	runtime: OpenCutMcpRuntime;
	discovery?: AgentDiscovery;
	run?: AgentCommandRunner;
}): Promise<AgentDoctorSnapshot> {
	const resolvedDiscovery =
		discovery ?? (await discoverAgentProviders({ run }));
	const readyProviders = resolvedDiscovery.providers.filter(
		(provider) => provider.status === "ready",
	);
	const [
		projectsWritable,
		bunVersion,
		ffmpegVersion,
		ffprobeVersion,
		mcpStates,
	] = await Promise.all([
		writableDirectory(runtime.projectFilesDir),
		commandVersion(runtime.command, run),
		commandVersion(mediaCommand("ffmpeg"), run, ["-version"]),
		commandVersion(mediaCommand("ffprobe"), run, ["-version"]),
		Promise.all(
			readyProviders.map(async (provider) => ({
				provider: provider.provider,
				installed: await inspectOpenCutMcpRegistration({
					provider: provider.provider,
					binary: provider.binary,
					run,
				}),
			})),
		),
	]);
	try {
		await access(runtime.serverPath, constants.R_OK);
	} catch {
		// A missing MCP server is reflected by the runtime check below.
	}
	const mcpByProvider = new Map(
		mcpStates.map((state) => [state.provider, state.installed]),
	);
	const providers = resolvedDiscovery.providers.map((provider) => ({
		...provider,
		mcpInstalled: mcpByProvider.get(provider.provider) ?? false,
	}));
	const anyMcp = providers.some((provider) => provider.mcpInstalled);
	const checks: AgentDoctorCheck[] = [
		{
			id: "web",
			label: "Moirai Cut 服务",
			status: "pass",
			detail: "浏览器编辑器与本地 API 正常",
		},
		{
			id: "projects",
			label: "工程目录",
			status: projectsWritable ? "pass" : "fail",
			detail: projectsWritable
				? `可读写 · ${runtime.projectFilesDir}`
				: `无法写入 · ${runtime.projectFilesDir}`,
			action: projectsWritable ? undefined : "检查目录权限",
		},
		{
			id: "runtime",
			label: "Agent 运行时",
			status: bunVersion ? "pass" : "fail",
			detail: bunVersion ?? "未找到 Bun 运行时",
			action: bunVersion ? undefined : "安装 Bun",
		},
		{
			id: "media",
			label: "媒体工具",
			status: ffmpegVersion && ffprobeVersion ? "pass" : "warning",
			detail:
				ffmpegVersion && ffprobeVersion
					? `${ffmpegVersion} · ffprobe 可用`
					: "FFmpeg/FFprobe 不完整，场景识别和代理生成会受限",
			action: ffmpegVersion && ffprobeVersion ? undefined : "安装 FFmpeg",
		},
		{
			id: "provider",
			label: "本地 Agent",
			status: readyProviders.length > 0 ? "pass" : "fail",
			detail:
				readyProviders.length > 0
					? readyProviders.map((provider) => provider.label).join("、")
					: "未检测到已登录的 Codex 或 Claude",
			action: readyProviders.length > 0 ? undefined : "安装或登录 Agent",
		},
		{
			id: "mcp",
			label: "App 工程工具",
			status: anyMcp ? "pass" : "warning",
			detail: anyMcp
				? `${providers
						.filter((provider) => provider.mcpInstalled)
						.map((provider) => provider.label)
						.join("、")} 已安装 Moirai Cut MCP`
				: "浏览器可用；在 App 控制工程前需安装 MCP",
			action: anyMcp ? undefined : "安装 Moirai Cut MCP",
		},
	];
	return {
		checkedAt: new Date().toISOString(),
		...scoreAgentReadiness(checks),
		recommendedProvider: resolvedDiscovery.recommendedProvider,
		providers,
		checks,
	};
}
