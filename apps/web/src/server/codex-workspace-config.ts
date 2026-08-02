import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

const MANAGED_BLOCK_START = "# BEGIN OPENCUT MANAGED MCP";
const MANAGED_BLOCK_END = "# END OPENCUT MANAGED MCP";
const OPENCUT_SERVER_HEADER = /^\s*\[mcp_servers\.opencut\]\s*(?:#.*)?$/m;

export interface OpenCutWorkspaceRuntime {
	appWorkspaceRoot: string;
	repoRoot: string;
	mcpServerPath: string;
	projectFilesDir: string;
	baseUrl: string;
}

export interface OpenCutWorkspaceConfigResult {
	changed: boolean;
	configPath: string;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function managedOpenCutConfig(runtime: OpenCutWorkspaceRuntime): string {
	return [
		MANAGED_BLOCK_START,
		"[mcp_servers.opencut]",
		'command = "bun"',
		`args = [${JSON.stringify(runtime.mcpServerPath)}]`,
		`cwd = ${JSON.stringify(runtime.repoRoot)}`,
		"startup_timeout_sec = 30.0",
		"",
		"[mcp_servers.opencut.env]",
		`OPENCUT_BASE_URL = ${JSON.stringify(runtime.baseUrl)}`,
		`OPENCUT_PROJECTS_DIR = ${JSON.stringify(runtime.projectFilesDir)}`,
		MANAGED_BLOCK_END,
	].join("\n");
}

export async function ensureOpenCutWorkspaceConfig(
	runtime: OpenCutWorkspaceRuntime,
): Promise<OpenCutWorkspaceConfigResult> {
	const codexDirectory = path.join(runtime.appWorkspaceRoot, ".codex");
	const configPath = path.join(codexDirectory, "config.toml");
	await mkdir(codexDirectory, { recursive: true });

	let current = "";
	try {
		current = await readFile(configPath, "utf8");
	} catch (error) {
		if (!isNodeError(error) || error.code !== "ENOENT") throw error;
	}
	if (OPENCUT_SERVER_HEADER.test(current)) {
		return { changed: false, configPath };
	}

	const existing = current.trimEnd();
	const next = existing
		? `${existing}\n\n${managedOpenCutConfig(runtime)}\n`
		: `${managedOpenCutConfig(runtime)}\n`;
	const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, next, "utf8");
		await rename(temporaryPath, configPath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
	return { changed: true, configPath };
}
