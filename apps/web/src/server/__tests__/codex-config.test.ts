import { describe, expect, test } from "bun:test";
import {
	inspectCodexBinary,
	resolveCodexBinary,
	type CodexCommandRunner,
} from "@/server/codex-config";

describe("Codex CLI configuration", () => {
	test("auto-discovers a desktop or PATH runtime without requiring a manual path", () => {
		const existing = new Set([
			"/Applications/ChatGPT.app/Contents/Resources/codex",
			"/usr/local/bin/codex",
		]);
		const desktop = resolveCodexBinary({
			env: { PATH: "/usr/local/bin" },
			platform: "darwin",
			exists: (candidate) => existing.has(candidate),
		});
		const pathOnly = resolveCodexBinary({
			env: { PATH: "/usr/local/bin" },
			platform: "linux",
			exists: (candidate) => existing.has(candidate),
		});

		expect(desktop).toBe(
			"/Applications/ChatGPT.app/Contents/Resources/codex",
		);
		expect(pathOnly).toBe("/usr/local/bin/codex");
	});

	test("rejects relative or non-Codex paths before running a process", async () => {
		let calls = 0;
		const run: CodexCommandRunner = async () => {
			calls += 1;
			return { stdout: "", stderr: "" };
		};

		const relative = await inspectCodexBinary({
			binary: "codex",
			run,
		});
		const wrongName = await inspectCodexBinary({
			binary: "/usr/local/bin/not-codex",
			run,
		});

		expect(relative).toEqual(
			expect.objectContaining({
				status: "invalid",
				executable: false,
			}),
		);
		expect(wrongName.status).toBe("invalid");
		expect(calls).toBe(0);
	});

	test("reports a ready connection only after version and login checks pass", async () => {
		const calls: string[][] = [];
		const run: CodexCommandRunner = async ({ args }) => {
			calls.push(args);
			return args[0] === "--version"
				? { stdout: "codex-cli 0.146.0", stderr: "" }
				: { stdout: "Logged in using ChatGPT", stderr: "" };
		};

		const result = await inspectCodexBinary({
			binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
			run,
		});

		expect(result).toEqual({
			provider: "path",
			path: "/Applications/ChatGPT.app/Contents/Resources/codex",
			status: "ready",
			executable: true,
			authenticated: true,
			version: "codex-cli 0.146.0",
			message: "Codex CLI 已连接，可使用当前 ChatGPT 登录。",
		});
		expect(calls).toEqual([["--version"], ["login", "status"]]);
	});

	test("keeps a valid binary visible when Codex still needs login", async () => {
		const run: CodexCommandRunner = async ({ args }) => {
			if (args[0] === "--version") {
				return { stdout: "codex-cli 0.146.0", stderr: "" };
			}
			throw new Error("Not logged in");
		};

		const result = await inspectCodexBinary({
			binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
			run,
		});

		expect(result).toEqual(
			expect.objectContaining({
				status: "login-required",
				executable: true,
				authenticated: false,
				version: "codex-cli 0.146.0",
			}),
		);
	});
});
