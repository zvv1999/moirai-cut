import { describe, expect, test } from "bun:test";
import {
	discoverAgentProviders,
	installOpenCutMcp,
	type AgentCommandRunner,
	type AgentRuntimeCandidate,
} from "@/server/agent-deployment";

const candidates: AgentRuntimeCandidate[] = [
	{
		provider: "codex",
		binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
		source: "desktop",
	},
	{
		provider: "codex",
		binary: "/Users/test/bin/codex",
		source: "path",
	},
	{
		provider: "claude",
		binary: "/Users/test/bin/claude",
		source: "path",
	},
];

describe("Agent provider discovery", () => {
	test("prefers an authenticated desktop Codex over a broken PATH shim", async () => {
		const run: AgentCommandRunner = async ({ binary, args }) => {
			if (binary === "/Users/test/bin/codex") {
				throw new Error("missing optional native dependency");
			}
			if (args[0] === "--version") {
				return {
					stdout: binary.endsWith("/claude")
						? "2.1.91 (Claude Code)"
						: "codex-cli 0.146.0",
					stderr: "",
				};
			}
			if (binary.endsWith("/claude")) {
				return {
					stdout: JSON.stringify({
						loggedIn: true,
						authMethod: "oauth_token",
					}),
					stderr: "",
				};
			}
			return { stdout: "Logged in using ChatGPT", stderr: "" };
		};

		const discovery = await discoverAgentProviders({ candidates, run });

		expect(discovery.recommendedProvider).toBe("codex");
		expect(discovery.providers).toEqual([
			expect.objectContaining({
				provider: "codex",
				status: "ready",
				source: "desktop",
				binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
				authenticated: true,
			}),
			expect.objectContaining({
				provider: "claude",
				status: "ready",
				source: "path",
				authenticated: true,
			}),
		]);
	});

	test("keeps an installed but signed-out runtime actionable", async () => {
		const run: AgentCommandRunner = async ({ args }) => {
			if (args[0] === "--version") {
				return { stdout: "codex-cli 0.146.0", stderr: "" };
			}
			throw new Error("not logged in");
		};

		const discovery = await discoverAgentProviders({
			candidates: [candidates[0]],
			run,
		});

		expect(discovery.recommendedProvider).toBeNull();
		expect(discovery.providers[0]).toEqual(
			expect.objectContaining({
				status: "login-required",
				executable: true,
				authenticated: false,
			}),
		);
	});

	test("honors a ready configured Claude provider as the active recommendation", async () => {
		const run: AgentCommandRunner = async ({ args }) => {
			if (args[0] === "--version") {
				return { stdout: "2.1.91 (Claude Code)", stderr: "" };
			}
			return {
				stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token" }),
				stderr: "",
			};
		};

		const discovery = await discoverAgentProviders({
			candidates: [candidates[2]],
			preferredProvider: "claude",
			run,
		});

		expect(discovery.recommendedProvider).toBe("claude");
		expect(discovery.activeProvider).toBe("claude");
	});
});

describe("OpenCut MCP installer", () => {
	test("installs Codex MCP once and verifies the resulting registration", async () => {
		const calls: string[][] = [];
		let installed = false;
		const run: AgentCommandRunner = async ({ args }) => {
			calls.push(args);
			if (args.slice(0, 3).join(" ") === "mcp get opencut") {
				if (!installed) throw new Error("not found");
				return { stdout: "opencut enabled", stderr: "" };
			}
			installed = true;
			return { stdout: "", stderr: "" };
		};

		const first = await installOpenCutMcp({
			provider: "codex",
			binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
			runtime: {
				command: "/opt/homebrew/bin/bun",
				serverPath: "/workspace/apps/mcp/src/server.mjs",
				baseUrl: "http://127.0.0.1:3000",
				projectFilesDir: "/Users/test/OpenCutProjects",
			},
			run,
		});
		const second = await installOpenCutMcp({
			provider: "codex",
			binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
			runtime: {
				command: "/opt/homebrew/bin/bun",
				serverPath: "/workspace/apps/mcp/src/server.mjs",
				baseUrl: "http://127.0.0.1:3000",
				projectFilesDir: "/Users/test/OpenCutProjects",
			},
			run,
		});

		expect(first).toEqual(
			expect.objectContaining({
				changed: true,
				verified: true,
				provider: "codex",
			}),
		);
		expect(second).toEqual(
			expect.objectContaining({
				changed: false,
				verified: true,
			}),
		);
		expect(calls).toContainEqual([
			"mcp",
			"add",
			"--env",
			"OPENCUT_BASE_URL=http://127.0.0.1:3000",
			"--env",
			"OPENCUT_PROJECTS_DIR=/Users/test/OpenCutProjects",
			"opencut",
			"--",
			"/opt/homebrew/bin/bun",
			"/workspace/apps/mcp/src/server.mjs",
		]);
	});

	test("uses Claude user scope so every project can reuse the same MCP", async () => {
		const calls: string[][] = [];
		let installed = false;
		const run: AgentCommandRunner = async ({ args }) => {
			calls.push(args);
			if (args.slice(0, 3).join(" ") === "mcp get opencut") {
				if (!installed) throw new Error("not found");
				return { stdout: "connected", stderr: "" };
			}
			installed = true;
			return { stdout: "", stderr: "" };
		};

		await installOpenCutMcp({
			provider: "claude",
			binary: "/Users/test/bin/claude",
			runtime: {
				command: "bun",
				serverPath: "/workspace/apps/mcp/src/server.mjs",
				baseUrl: "http://127.0.0.1:3000",
				projectFilesDir: "/Users/test/OpenCutProjects",
			},
			run,
		});

		expect(calls).toContainEqual([
			"mcp",
			"add",
			"--scope",
			"user",
			"opencut",
			"--env",
			"OPENCUT_BASE_URL=http://127.0.0.1:3000",
			"--env",
			"OPENCUT_PROJECTS_DIR=/Users/test/OpenCutProjects",
			"--",
			"bun",
			"/workspace/apps/mcp/src/server.mjs",
		]);
	});
});
