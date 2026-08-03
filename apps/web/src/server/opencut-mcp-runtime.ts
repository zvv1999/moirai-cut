import { existsSync } from "node:fs";
import path from "node:path";
import type { OpenCutMcpRuntime } from "@/server/agent-deployment";

function repoRootFromCurrentWorkingDirectory(): string {
	const candidates = [
		process.env.OPENCUT_REPO_ROOT?.trim(),
		process.cwd(),
		path.resolve(process.cwd(), "../.."),
	].filter((candidate): candidate is string => Boolean(candidate));
	const root = candidates.find((candidate) =>
		existsSync(path.join(candidate, "apps/mcp/src/server.mjs")),
	);
	if (!root) throw new Error("无法定位 Moirai Cut MCP 服务。");
	return root;
}

export async function resolveOpenCutMcpRuntime(): Promise<OpenCutMcpRuntime> {
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

export function claudeMcpConfig(runtime: OpenCutMcpRuntime): string {
	return JSON.stringify({
		mcpServers: {
			opencut: {
				command: runtime.command,
				args: [runtime.serverPath],
				env: {
					OPENCUT_BASE_URL: runtime.baseUrl,
					OPENCUT_PROJECTS_DIR: runtime.projectFilesDir,
				},
			},
		},
	});
}
