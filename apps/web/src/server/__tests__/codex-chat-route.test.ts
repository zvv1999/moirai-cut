import { describe, expect, test } from "bun:test";
import {
	createCodexChatRouteHandlers,
	type CodexChatApiService,
} from "@/app/api/codex/chat/route";

describe("Codex Smart Edit SSE API", () => {
	test("opens SSE immediately and forwards session, delta, and completion events", async () => {
		const calls: unknown[] = [];
		let release: (() => void) | null = null;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const service: CodexChatApiService = {
			stream: async function* (input) {
				calls.push(input);
				yield { type: "session", sessionId: "thread-1" };
				await barrier;
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

		release?.();
		let body = "";
		for (;;) {
			const next = await reader?.read();
			if (!next || next.done) break;
			body += new TextDecoder().decode(next.value);
		}
		expect(body).toContain(
			'event: session\ndata: {"sessionId":"thread-1"}',
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
		expect(body).toContain(
			'event: error\ndata: {"message":"Codex 调用失败"}',
		);
	});

	test("rejects malformed or incomplete requests before starting Codex", async () => {
		let calls = 0;
		const service: CodexChatApiService = {
			stream: async function* () {
				calls += 1;
			},
		};
		const { POST } = createCodexChatRouteHandlers({ service });

		for (const body of ["{broken", JSON.stringify({ projectId: "project-1" })]) {
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
