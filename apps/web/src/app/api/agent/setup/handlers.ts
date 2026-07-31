import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
	discoverAgentProviders,
	installOpenCutMcp,
	type AgentProviderId,
	type OpenCutMcpInstallResult,
	type OpenCutMcpRuntime,
} from "@/server/agent-deployment";
import {
	runAgentDoctor,
	type AgentDoctorSnapshot,
} from "@/server/agent-doctor";

export interface AgentSetupApiService {
	inspect(): Promise<AgentDoctorSnapshot>;
	installMcp(provider: AgentProviderId): Promise<OpenCutMcpInstallResult>;
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
	if (!root) throw new Error("无法定位 OpenCut MCP 服务。");
	return root;
}

async function resolveMcpRuntime(): Promise<OpenCutMcpRuntime> {
	const repoRoot = repoRootFromCurrentWorkingDirectory();
	const bunCandidate =
		process.env.BUN_BIN?.trim() ||
		("bun" in process.versions ? process.execPath : "bun");
	return {
		command: bunCandidate,
		serverPath:
			process.env.OPENCUT_MCP_SERVER?.trim() ||
			path.join(repoRoot, "apps/mcp/src/server.mjs"),
		baseUrl:
			process.env.OPENCUT_BASE_URL?.trim() ||
			process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
			"http://127.0.0.1:3000",
		projectFilesDir:
			process.env.OPENCUT_PROJECTS_DIR?.trim() ||
			path.resolve(repoRoot, "../opencut-projects"),
	};
}

function createAgentSetupService(): AgentSetupApiService {
	return {
		async inspect() {
			const runtime = await resolveMcpRuntime();
			return runAgentDoctor({ runtime });
		},
		async installMcp(provider) {
			const [runtime, discovery] = await Promise.all([
				resolveMcpRuntime(),
				discoverAgentProviders(),
			]);
			const connection = discovery.providers.find(
				(candidate) =>
					candidate.provider === provider && candidate.status === "ready",
			);
			if (!connection) {
				throw new Error(
					`${provider === "codex" ? "Codex" : "Claude"} 未登录，无法安装 MCP。`,
				);
			}
			return installOpenCutMcp({
				provider,
				binary: connection.binary,
				runtime,
			});
		},
	};
}

function isLoopbackHostname(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1"
	);
}

function isAllowedMutationRequest(request: Request): boolean {
	const target = new URL(request.url);
	if (!isLoopbackHostname(target.hostname)) return false;
	const origin = request.headers.get("origin");
	if (!origin) return true;
	try {
		const source = new URL(origin);
		return (
			isLoopbackHostname(source.hostname) &&
			source.protocol === target.protocol &&
			source.port === target.port
		);
	} catch {
		return false;
	}
}

function parseInstallRequest(
	value: unknown,
): { action: "install-mcp"; provider: AgentProviderId } | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		record.action !== "install-mcp" ||
		(record.provider !== "codex" && record.provider !== "claude")
	) {
		return null;
	}
	if (
		Object.keys(record).some((key) => key !== "action" && key !== "provider")
	) {
		return null;
	}
	return {
		action: "install-mcp",
		provider: record.provider,
	};
}

export function createAgentSetupRouteHandlers({
	service = createAgentSetupService(),
}: {
	service?: AgentSetupApiService;
} = {}) {
	return {
		async GET(_request?: Request) {
			try {
				const snapshot = await service.inspect();
				return NextResponse.json(snapshot, {
					headers: { "cache-control": "no-store, max-age=0" },
				});
			} catch (error) {
				return NextResponse.json(
					{
						error:
							error instanceof Error
								? error.message
								: "无法完成 Agent 环境检查。",
					},
					{ status: 500 },
				);
			}
		},
		async POST(request: Request) {
			if (!isAllowedMutationRequest(request)) {
				return NextResponse.json(
					{ error: "Agent 配置只能从本机 OpenCut 发起。" },
					{ status: 403 },
				);
			}
			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return NextResponse.json(
					{ error: "请求内容不是有效 JSON。" },
					{ status: 400 },
				);
			}
			const input = parseInstallRequest(body);
			if (!input) {
				return NextResponse.json(
					{ error: "只支持为 Codex 或 Claude 安装 OpenCut MCP。" },
					{ status: 400 },
				);
			}
			try {
				const result = await service.installMcp(input.provider);
				return NextResponse.json(result);
			} catch (error) {
				return NextResponse.json(
					{
						error:
							error instanceof Error ? error.message : "OpenCut MCP 安装失败。",
					},
					{ status: 500 },
				);
			}
		},
	};
}

export const { GET, POST } = createAgentSetupRouteHandlers();
