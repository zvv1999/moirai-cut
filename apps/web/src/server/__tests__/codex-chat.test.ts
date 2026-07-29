import { describe, expect, test } from "bun:test";
import {
	buildCodexExecArgs,
	buildCodexPrompt,
	createCodexChatService,
	parseCodexJsonl,
	runCodexProcess,
	type CodexChatProcessRunner,
	type CodexRuntimeConfig,
} from "@/server/codex-chat";

const runtime: CodexRuntimeConfig = {
	binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
	repoRoot: "/workspace/opencut-classic",
	mcpServerPath: "/workspace/opencut-classic/apps/mcp/src/server.mjs",
	projectFilesDir: "/workspace/opencut-projects",
	baseUrl: "http://127.0.0.1:3000",
};

describe("Codex direct Smart Edit chat", () => {
	test("starts a desktop Codex exec with only the OpenCut MCP and no interactive approval", () => {
		const args = buildCodexExecArgs({ runtime });

		expect(args.slice(0, 2)).toEqual(["exec", "--json"]);
		expect(args).toContain("--ignore-user-config");
		expect(args).toContain("--sandbox");
		expect(args).toContain("read-only");
		expect(args).toContain('approval_policy="never"');
		expect(args).toContain('mcp_servers.opencut.command="node"');
		expect(args).toContain(
			'mcp_servers.opencut.args=["/workspace/opencut-classic/apps/mcp/src/server.mjs"]',
		);
		expect(args.at(-1)).toBe("-");
	});

	test("resumes the same Codex session instead of invoking the local plan compiler", () => {
		const args = buildCodexExecArgs({
			runtime,
			sessionId: "019faeb6-a98b-7b53-be37-a7621c715f3d",
		});

		expect(args.slice(0, 3)).toEqual(["exec", "resume", "--json"]);
		expect(args).toContain("019faeb6-a98b-7b53-be37-a7621c715f3d");
		expect(args.at(-1)).toBe("-");
	});

	test("prompts Codex to execute through OpenCut without automatic lint or quality checks", () => {
		const prompt = buildCodexPrompt({
			projectId: "project-1",
			message: "统一字幕样式",
			context: "opencut://project/project-1/scene/main/track/text",
		});

		expect(prompt).toContain("project-1");
		expect(prompt).toContain("统一字幕样式");
		expect(prompt).toContain(
			"opencut://project/project-1/scene/main/track/text",
		);
		expect(prompt).toContain("直接执行");
		expect(prompt).toContain("不要运行 lint_cut、render_frames");
		expect(prompt).toContain("使用 read_project 和 edit_project");
		expect(prompt).toContain(
			"不要调用 status、get_context、open_editor、reveal_context",
		);
		expect(prompt).not.toContain("优先使用 get_context");
		expect(prompt).not.toContain("至少需要两个字幕素材");
	});

	test("extracts the persisted thread and final assistant message from Codex JSONL", () => {
		const result = parseCodexJsonl(
			[
				'{"type":"thread.started","thread_id":"thread-1"}',
				'{"type":"item.completed","item":{"type":"error","message":"non-fatal warning"}}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"已完成字幕统一。"}}',
				'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}',
			].join("\n"),
		);

		expect(result).toEqual({
			sessionId: "thread-1",
			message: "已完成字幕统一。",
		});
	});

	test("keeps one Codex conversation per project and sends context over stdin", async () => {
		const calls: Parameters<CodexChatProcessRunner>[0][] = [];
		const run: CodexChatProcessRunner = async (input) => {
			calls.push(input);
			const turn = calls.length;
			return {
				stdout: [
					'{"type":"thread.started","thread_id":"thread-project-1"}',
					`{"type":"item.completed","item":{"type":"agent_message","text":"回复 ${turn}"}}`,
				].join("\n"),
				stderr: "",
			};
		};
		const service = createCodexChatService({ runtime, run });

		const first = await service.send({
			projectId: "project-1",
			message: "统一字幕样式",
			context: "引用 A",
		});
		const second = await service.send({
			projectId: "project-1",
			message: "字号再大一点",
			context: "引用 B",
		});

		expect(first).toEqual({
			sessionId: "thread-project-1",
			message: "回复 1",
		});
		expect(second.message).toBe("回复 2");
		expect(calls[0]?.stdin).toContain("统一字幕样式");
		expect(calls[0]?.stdin).toContain("引用 A");
		expect(calls[1]?.args.slice(0, 3)).toEqual(["exec", "resume", "--json"]);
		expect(calls[1]?.args).toContain("thread-project-1");
	});

	test("writes the prompt to stdin and returns process output", async () => {
		const result = await runCodexProcess({
			binary: "/bin/sh",
			args: ["-c", "cat"],
			cwd: process.cwd(),
			stdin: "直接交给 Codex",
			env: { PATH: process.env.PATH },
			timeoutMs: 1_000,
		});

		expect(result).toEqual({
			stdout: "直接交给 Codex",
			stderr: "",
		});
	});

	test("surfaces the Codex process error instead of falling back to local validation", async () => {
		expect(
			runCodexProcess({
				binary: "/bin/sh",
				args: ["-c", "echo 'Codex 调用失败' >&2; exit 7"],
				cwd: process.cwd(),
				stdin: "",
				env: { PATH: process.env.PATH },
				timeoutMs: 1_000,
			}),
		).rejects.toThrow("Codex 调用失败");
	});

	test("terminates a stalled Codex process with a retryable timeout", async () => {
		expect(
			runCodexProcess({
				binary: "/bin/sh",
				args: ["-c", "sleep 1"],
				cwd: process.cwd(),
				stdin: "",
				env: { PATH: process.env.PATH },
				timeoutMs: 10,
			}),
		).rejects.toThrow("Codex 响应超时，请重试。");
	});
});
