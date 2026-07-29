import { describe, expect, test } from "bun:test";
import {
	createCodexChatRouteHandlers,
	type CodexChatApiService,
} from "@/app/api/codex/chat/route";

describe("Codex Smart Edit chat API", () => {
	test("forwards one direct conversation turn to Codex", async () => {
		const calls: unknown[] = [];
		const service: CodexChatApiService = {
			send: async (input) => {
				calls.push(input);
				return { sessionId: "thread-1", message: "已完成。" };
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
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			data: { sessionId: "thread-1", message: "已完成。" },
		});
		expect(calls).toEqual([
			{
				projectId: "project-1",
				message: "统一字幕样式",
				context: "Codex Path context",
			},
		]);
	});

	test("rejects malformed or incomplete requests before starting Codex", async () => {
		let calls = 0;
		const service: CodexChatApiService = {
			send: async () => {
				calls += 1;
				return { sessionId: "thread-1", message: "unexpected" };
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
