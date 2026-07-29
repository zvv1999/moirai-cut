import { describe, expect, test } from "bun:test";
import {
	buildCodexAppServerArgs,
	buildCodexPrompt,
	createCodexChatService,
	type CodexAppServerConnection,
	type CodexAppServerSubscription,
	type CodexRuntimeConfig,
} from "@/server/codex-chat";

const runtime: CodexRuntimeConfig = {
	binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
	repoRoot: "/workspace/opencut-classic",
	mcpServerPath: "/workspace/opencut-classic/apps/mcp/src/server.mjs",
	projectFilesDir: "/workspace/opencut-projects",
	baseUrl: "http://127.0.0.1:3000",
};

function subscriptionOf({
	notifications,
	onClose = () => {},
}: {
	notifications: unknown[];
	onClose?: () => void;
}): CodexAppServerSubscription {
	return {
		async *[Symbol.asyncIterator]() {
			for (const notification of notifications) yield notification;
		},
		close: onClose,
	};
}

describe("Codex direct Smart Edit streaming chat", () => {
	test("starts Codex app-server so agent message deltas are available", () => {
		const args = buildCodexAppServerArgs(runtime);

		expect(args.slice(0, 2)).toEqual(["app-server", "--stdio"]);
		expect(args).toContain('approval_policy="never"');
		expect(args).toContain('sandbox_mode="read-only"');
		expect(args).toContain('mcp_servers.opencut.command="node"');
		expect(args).toContain(
			'mcp_servers.opencut.args=["/workspace/opencut-classic/apps/mcp/src/server.mjs"]',
		);
		expect(args).not.toContain("exec");
		expect(args).not.toContain("--json");
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

	test("streams each Codex token delta before the authoritative completed message", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		let closed = false;
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/start") {
					return { thread: { id: "thread-project-1" } };
				}
				if (method === "turn/start") {
					return { turn: { id: "turn-1" } };
				}
				throw new Error(`unexpected method ${method}`);
			},
			subscribe: (threadId) => {
				expect(threadId).toBe("thread-project-1");
				return subscriptionOf({
					notifications: [
						{
							method: "item/agentMessage/delta",
							params: {
								threadId,
								turnId: "turn-1",
								itemId: "message-1",
								delta: "已",
							},
						},
						{
							method: "item/agentMessage/delta",
							params: {
								threadId,
								turnId: "turn-1",
								itemId: "message-1",
								delta: "完成",
							},
						},
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-1",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "message-1",
											text: "已完成",
										},
									],
								},
							},
						},
					],
					onClose: () => {
						closed = true;
					},
				});
			},
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const events = [];
		for await (const event of service.stream({
			input: {
				projectId: "project-1",
				message: "统一字幕样式",
				context: "引用 A",
			},
		})) {
			events.push(event);
		}

		expect(events).toEqual([
			{ type: "session", sessionId: "thread-project-1" },
			{ type: "delta", delta: "已" },
			{ type: "delta", delta: "完成" },
			{
				type: "done",
				sessionId: "thread-project-1",
				message: "已完成",
			},
		]);
		expect(calls.map((call) => call.method)).toEqual([
			"thread/start",
			"turn/start",
		]);
		expect(JSON.stringify(calls[1]?.params)).toContain("统一字幕样式");
		expect(JSON.stringify(calls[1]?.params)).toContain("引用 A");
		expect(closed).toBe(true);
	});

	test("resumes the exact browser-held Codex session instead of relying on server memory", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const connection: CodexAppServerConnection = {
			request: async ({ method, params }) => {
				calls.push({ method, params });
				if (method === "thread/resume") {
					return { thread: { id: "thread-existing" } };
				}
				return { turn: { id: "turn-2" } };
			},
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-2",
									status: "completed",
									error: null,
									items: [
										{
											type: "agentMessage",
											id: "message-2",
											text: "继续完成",
										},
									],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const events = [];
		for await (const event of service.stream({
			input: {
				projectId: "project-1",
				message: "继续",
				context: "",
				sessionId: "thread-existing",
			},
		})) {
			events.push(event);
		}

		expect(calls[0]).toEqual({
			method: "thread/resume",
			params: expect.objectContaining({ threadId: "thread-existing" }),
		});
		expect(events.at(-1)).toEqual({
			type: "done",
			sessionId: "thread-existing",
			message: "继续完成",
		});
	});

	test("surfaces a failed Codex turn without replacing it with local validation", async () => {
		const connection: CodexAppServerConnection = {
			request: async ({ method }) =>
				method === "thread/start"
					? { thread: { id: "thread-1" } }
					: { turn: { id: "turn-1" } },
			subscribe: (threadId) =>
				subscriptionOf({
					notifications: [
						{
							method: "turn/completed",
							params: {
								threadId,
								turn: {
									id: "turn-1",
									status: "failed",
									error: { message: "Codex 上游不可用" },
									items: [],
								},
							},
						},
					],
				}),
		};
		const service = createCodexChatService({
			runtime,
			connect: async () => connection,
		});

		const consume = async () => {
			for await (const _event of service.stream({
				input: {
					projectId: "project-1",
					message: "继续",
					context: "",
				},
			})) {
				// Consume the stream so the failed completion is observed.
			}
		};

		expect(consume()).rejects.toThrow("Codex 上游不可用");
	});
});
