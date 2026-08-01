import { describe, expect, test } from "bun:test";
import {
	createCodexChatRouteHandlers,
	type CodexChatApiService,
} from "@/app/api/codex/chat/handlers";
import {
	createCodexRunManager,
	type CodexRunService,
} from "@/server/codex-run-manager";

describe("Codex Smart Edit SSE API", () => {
	test("opens SSE immediately and forwards session, delta, and completion events", async () => {
		const calls: unknown[] = [];
		let release = () => {};
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const service: CodexChatApiService = {
			stream: async function* ({ input }) {
				calls.push(input);
				yield { type: "session", sessionId: "thread-1" };
				await barrier;
				yield {
					type: "protocol",
					id: "tool-1",
					method: "item/started",
					threadId: "thread-1",
					turnId: "turn-1",
					itemId: "tool-1",
					itemType: "mcpToolCall",
					status: "started",
					title: "OneCut · read_project",
					detail: '{\n  "projectId": "project-1"\n}',
				};
				yield { type: "delta", delta: "已" };
				yield { type: "delta", delta: "完成" };
				yield {
					type: "done",
					sessionId: "thread-1",
					message: "已完成",
				};
			},
		};
		const { POST } = createCodexChatRouteHandlers({ service });
		const response = await POST(
			new Request("http://localhost/api/codex/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					projectId: "project-1",
					message: "统一字幕样式",
					context: "Codex Path context",
					sessionId: "thread-previous",
					conversationId: "conversation-1",
					model: "gpt-5.6-sol",
					effort: "xhigh",
					mode: "default",
					toolProfile: "verify",
					visualMode: "auto",
					verificationMode: "basic",
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(response.headers.get("x-accel-buffering")).toBe("no");

		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
		const first = await reader?.read();
		expect(new TextDecoder().decode(first?.value)).toContain(": connected");

		release();
		let body = "";
		for (;;) {
			const next = await reader?.read();
			if (!next || next.done) break;
			body += new TextDecoder().decode(next.value);
		}
		expect(body).toContain('event: session\ndata: {"sessionId":"thread-1"}');
		expect(body).toContain(
			'event: protocol\ndata: {"id":"tool-1","method":"item/started","threadId":"thread-1","turnId":"turn-1","itemId":"tool-1","itemType":"mcpToolCall","status":"started","title":"OneCut · read_project","detail":"{\\n  \\"projectId\\": \\"project-1\\"\\n}"}',
		);
		expect(body).toContain('event: delta\ndata: {"delta":"已"}');
		expect(body).toContain('event: delta\ndata: {"delta":"完成"}');
		expect(body).toContain(
			'event: done\ndata: {"sessionId":"thread-1","message":"已完成"}',
		);
		expect(calls).toEqual([
			{
				projectId: "project-1",
				message: "统一字幕样式",
				context: "Codex Path context",
				sessionId: "thread-previous",
				conversationId: "conversation-1",
				model: "gpt-5.6-sol",
				effort: "xhigh",
				mode: "default",
				toolProfile: "verify",
				visualMode: "auto",
				verificationMode: "basic",
			},
		]);
	});

	test("encodes a mid-stream Codex failure as an SSE error event", async () => {
		const service: CodexChatApiService = {
			stream: async function* () {
				yield { type: "session", sessionId: "thread-1" };
				throw new Error("Codex 调用失败");
			},
		};
		const { POST } = createCodexChatRouteHandlers({ service });
		const response = await POST(
			new Request("http://localhost/api/codex/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					projectId: "project-1",
					message: "继续",
					context: "",
				}),
			}),
		);

		const body = await response.text();
		expect(body).toContain('event: error\ndata: {"message":"Codex 调用失败"}');
	});

	test("treats the browser's null session as a new Codex conversation", async () => {
		const calls: unknown[] = [];
		const service: CodexChatApiService = {
			stream: async function* ({ input }) {
				calls.push(input);
				yield {
					type: "done",
					sessionId: "thread-new",
					message: "新会话",
				};
			},
		};
		const { POST } = createCodexChatRouteHandlers({ service });
		const response = await POST(
			new Request("http://localhost/api/codex/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					projectId: "project-1",
					message: "第一条消息",
					context: "",
					sessionId: null,
				}),
			}),
		);

		expect(response.status).toBe(200);
		await response.text();
		expect(calls).toEqual([
			{
				projectId: "project-1",
				message: "第一条消息",
				context: "",
			},
		]);
	});

	test("keeps the native turn running when the browser cancels only its SSE subscription", async () => {
		let release = () => {};
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const service: CodexRunService = {
			stream: async function* () {
				yield { type: "session", sessionId: "thread-background" };
				await barrier;
				yield {
					type: "done",
					sessionId: "thread-background",
					message: "后台完成",
				};
			},
			steer: async () => {},
			interrupt: async () => {},
			compact: async () => {},
		};
		const manager = createCodexRunManager({
			service,
			createId: () => "run-background",
		});
		const { POST } = createCodexChatRouteHandlers({ service, manager });
		const response = await POST(
			new Request("http://localhost/api/codex/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					projectId: "project-1",
					message: "继续后台处理",
					context: "",
				}),
			}),
		);
		const reader = response.body?.getReader();
		await reader?.read();
		await reader?.cancel();
		release();
		await manager.waitForCompletion("run-background");

		expect(manager.get("run-background")).toMatchObject({
			status: "completed",
			sessionId: "thread-background",
		});
	});

	test("keeps a long native turn connected with lightweight SSE heartbeats", async () => {
		let release = () => {};
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const service: CodexChatApiService = {
			stream: async function* () {
				yield { type: "session", sessionId: "thread-heartbeat" };
				await barrier;
				yield {
					type: "done",
					sessionId: "thread-heartbeat",
					message: "完成",
				};
			},
		};
		const { POST } = createCodexChatRouteHandlers({
			service,
			heartbeatIntervalMs: 1,
		});
		const response = await POST(
			new Request("http://localhost/api/codex/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					projectId: "project-1",
					message: "长任务",
					context: "",
				}),
			}),
		);
		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
		let body = "";
		for (
			let attempt = 0;
			attempt < 20 && !body.includes(": heartbeat");
			attempt += 1
		) {
			const chunk = await reader?.read();
			if (!chunk || chunk.done) break;
			body += new TextDecoder().decode(chunk.value);
		}
		expect(body).toContain(": heartbeat");
		release();
		await reader?.cancel();
	});

	test("rejects malformed or incomplete requests before starting Codex", async () => {
		let calls = 0;
		const service: CodexChatApiService = {
			stream: async function* () {
				calls += 1;
				if (calls < 0) yield { type: "delta", delta: "unreachable" };
			},
		};
		const { POST } = createCodexChatRouteHandlers({ service });

		for (const body of [
			"{broken",
			JSON.stringify({ projectId: "project-1" }),
			JSON.stringify({
				projectId: "project-1",
				message: "继续",
				context: "",
				mode: "unsafe",
			}),
		]) {
			const response = await POST(
				new Request("http://localhost/api/codex/chat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				}),
			);
			expect(response.status).toBe(400);
		}
		expect(calls).toBe(0);
	});
});
