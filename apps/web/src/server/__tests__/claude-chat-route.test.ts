import { describe, expect, test } from "bun:test";
import { createClaudeChatRouteHandlers } from "@/app/api/claude/chat/handlers";
import type { ClaudeChatService } from "@/server/claude-chat";

const requestBody = {
	projectId: "project-1",
	message: "test",
	messageId: "message-1",
	context: "context",
	conversationId: "conversation-1",
};

describe("Claude browser chat API", () => {
	test("forwards the complete Claude stream-json event alongside normalized SSE", async () => {
		const payload = {
			type: "assistant",
			message: {
				content: [
					{
						type: "tool_use",
						id: "tool-1",
						name: "mcp__opencut__read_project",
						input: { projectId: "project-1", detail: "full" },
					},
				],
			},
		};
		const service: ClaudeChatService = {
			async *stream() {
				yield {
					type: "native",
					event: {
						id: "native-1",
						provider: "claude",
						transport: "stream-json",
						name: "assistant/tool_use",
						payload,
						raw: JSON.stringify(payload),
					},
				};
				yield {
					type: "done",
					sessionId: "claude-session",
					message: "完成",
				};
			},
		};
		const { POST } = createClaudeChatRouteHandlers({
			service,
			resolveBinary: async () => "/mock/claude",
		});

		const response = await POST(
			new Request("http://127.0.0.1:3000/api/claude/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(requestBody),
			}),
		);
		const body = await response.text();

		expect(body).toContain("event: native");
		expect(body).toContain('"name":"assistant/tool_use"');
		expect(body).toContain('"detail":"full"');
		expect(body).toContain('event: done\ndata: {"sessionId":"claude-session"');
	});

	test("cancels the Claude subprocess stream when the browser stops reading", async () => {
		let aborted = false;
		const service: ClaudeChatService = {
			async *stream({ signal }) {
				yield { type: "session", sessionId: "claude-session" };
				await new Promise<void>((resolve) => {
					signal?.addEventListener(
						"abort",
						() => {
							aborted = true;
							resolve();
						},
						{ once: true },
					);
				});
			},
		};
		const { POST } = createClaudeChatRouteHandlers({
			service,
			resolveBinary: async () => "/mock/claude",
		});
		const response = await POST(
			new Request("http://127.0.0.1:3000/api/claude/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(requestBody),
			}),
		);
		const reader = response.body?.getReader();

		expect(response.status).toBe(200);
		expect((await reader?.read())?.done).toBe(false);
		await reader?.cancel();
		await Bun.sleep(0);
		expect(aborted).toBe(true);
	});
});
