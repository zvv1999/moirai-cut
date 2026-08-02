import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	ensureOpenCutWorkspaceConfig,
	type OpenCutWorkspaceRuntime,
} from "@/server/codex-workspace-config";

async function temporaryRuntime(): Promise<OpenCutWorkspaceRuntime> {
	const workspaceRoot = await mkdtemp(
		path.join(tmpdir(), "opencut-workspace-config-"),
	);
	const repoRoot = path.join(workspaceRoot, "opencut-classic");
	await mkdir(repoRoot, { recursive: true });
	return {
		appWorkspaceRoot: workspaceRoot,
		repoRoot,
		mcpServerPath: path.join(repoRoot, "apps/mcp/src/server.mjs"),
		projectFilesDir: path.join(workspaceRoot, "opencut-projects"),
		baseUrl: "http://127.0.0.1:3000",
	};
}

describe("OpenCut Codex workspace config", () => {
	test("creates a project-scoped OpenCut MCP entry for Codex App continuation", async () => {
		const runtime = await temporaryRuntime();

		const result = await ensureOpenCutWorkspaceConfig(runtime);
		const config = await readFile(result.configPath, "utf8");

		expect(result.changed).toBe(true);
		expect(result.configPath).toBe(
			path.join(runtime.appWorkspaceRoot, ".codex/config.toml"),
		);
		expect(config).toContain("[mcp_servers.opencut]");
		expect(config).toContain(`cwd = ${JSON.stringify(runtime.repoRoot)}`);
		expect(config).toContain(
			`args = [${JSON.stringify(runtime.mcpServerPath)}]`,
		);
		expect(config).toContain(
			`OPENCUT_PROJECTS_DIR = ${JSON.stringify(runtime.projectFilesDir)}`,
		);
		expect(config).toContain(
			`OPENCUT_BASE_URL = ${JSON.stringify(runtime.baseUrl)}`,
		);
	});

	test("preserves existing workspace config and remains idempotent", async () => {
		const runtime = await temporaryRuntime();
		const codexDirectory = path.join(runtime.appWorkspaceRoot, ".codex");
		const configPath = path.join(codexDirectory, "config.toml");
		await mkdir(codexDirectory, { recursive: true });
		await writeFile(
			configPath,
			'[features]\nmulti_agent = true\n\n[mcp_servers.github]\ncommand = "github-mcp"\n',
			"utf8",
		);

		const first = await ensureOpenCutWorkspaceConfig(runtime);
		const firstConfig = await readFile(configPath, "utf8");
		const second = await ensureOpenCutWorkspaceConfig(runtime);
		const secondConfig = await readFile(configPath, "utf8");

		expect(first.changed).toBe(true);
		expect(second.changed).toBe(false);
		expect(secondConfig).toBe(firstConfig);
		expect(secondConfig).toStartWith("[features]\nmulti_agent = true");
		expect(secondConfig.match(/\[mcp_servers\.opencut\]/g)).toHaveLength(1);
	});

	test("does not overwrite an existing user-managed OpenCut MCP entry", async () => {
		const runtime = await temporaryRuntime();
		const codexDirectory = path.join(runtime.appWorkspaceRoot, ".codex");
		const configPath = path.join(codexDirectory, "config.toml");
		const existing =
			'[mcp_servers.opencut]\ncommand = "custom-opencut"\nargs = ["serve"]\n';
		await mkdir(codexDirectory, { recursive: true });
		await writeFile(configPath, existing, "utf8");

		const result = await ensureOpenCutWorkspaceConfig(runtime);

		expect(result.changed).toBe(false);
		expect(await readFile(configPath, "utf8")).toBe(existing);
	});
});
