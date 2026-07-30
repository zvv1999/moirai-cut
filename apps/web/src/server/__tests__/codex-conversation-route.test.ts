import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	GET,
	POST,
	readSharedProjectConversation,
} from "@/app/api/codex/history/[projectId]/route";
import { createCodexConversationStore } from "@/server/codex-conversation";

const originalProjectsRoot = process.env.OPENCUT_PROJECTS_DIR;
const temporaryRoots: string[] = [];

afterEach(async () => {
	if (originalProjectsRoot === undefined) {
		delete process.env.OPENCUT_PROJECTS_DIR;
	} else {
		process.env.OPENCUT_PROJECTS_DIR = originalProjectsRoot;
	}
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

async function routeFixture() {
	const root = await mkdtemp(path.join(tmpdir(), "opencut-codex-route-"));
	temporaryRoots.push(root);
	const projectId = "project-route-chat";
	await mkdir(path.join(root, projectId), { recursive: true });
	process.env.OPENCUT_PROJECTS_DIR = root;
	return { projectId, root };
}

describe("Codex project conversation API", () => {
	test("hydrates the selected project conversation from its App Server thread", async () => {
		const { projectId, root } = await routeFixture();
		const store = createCodexConversationStore({ rootDirectory: root });
		await store.merge({
			projectId,
			conversationId: "conversation-shared",
			sessionId: "thread-shared",
			messages: [],
		});
		const calls: string[] = [];

		const conversation = await readSharedProjectConversation({
			projectId,
			conversationId: "conversation-shared",
			store,
			codex: {
				readThread: async ({ sessionId }) => {
					calls.push(sessionId);
					return {
						sessionId,
						title: "App 中继续的会话",
						createdAt: 100,
						updatedAt: 200,
						messages: [
							{
								id: "user-app",
								role: "user",
								content: "从 App 继续调整",
								turnId: "turn-app",
								createdAt: 100,
								updatedAt: 100,
							},
							{
								id: "assistant-app",
								role: "assistant",
								content: "已同步到工程。",
								turnId: "turn-app",
								createdAt: 101,
								updatedAt: 200,
							},
						],
					};
				},
			},
		});

		expect(calls).toEqual(["thread-shared"]);
		expect(conversation.conversations[0]).toMatchObject({
			id: "conversation-shared",
			title: "App 中继续的会话",
			sessionId: "thread-shared",
			messages: [
				{ id: "user-app", content: "从 App 继续调整" },
				{ id: "assistant-app", content: "已同步到工程。" },
			],
		});
	});

	test("writes and reloads the same project conversation", async () => {
		const { projectId } = await routeFixture();
		const context = { params: Promise.resolve({ projectId }) };
		const writeResponse = await POST(
			new Request(`http://localhost/api/codex/history/${projectId}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					conversationId: "conversation-route",
					sessionId: "thread-route",
					messages: [
						{
							id: "message-route",
							role: "assistant",
							content: "跨页面可见",
							createdAt: 100,
							updatedAt: 100,
						},
					],
				}),
			}),
			context,
		);
		const readResponse = await GET(
			new Request(`http://localhost/api/codex/history/${projectId}`),
			context,
		);
		const conversation = await readResponse.json();

		expect(writeResponse.status).toBe(200);
		expect(readResponse.status).toBe(200);
		expect(readResponse.headers.get("cache-control")).toContain("no-store");
		expect(conversation).toMatchObject({
			projectId,
			schemaVersion: "opencut.codex-conversations.v2",
			conversations: [
				{
					id: "conversation-route",
					sessionId: "thread-route",
					messages: [{ id: "message-route", content: "跨页面可见" }],
				},
			],
		});
	});

	test("returns stable client errors for unsafe projects and invalid payloads", async () => {
		const unsafe = await GET(
			new Request("http://localhost/api/codex/history/unsafe"),
			{ params: Promise.resolve({ projectId: "../unsafe" }) },
		);
		const { projectId } = await routeFixture();
		const invalid = await POST(
			new Request(`http://localhost/api/codex/history/${projectId}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ messages: "not-an-array" }),
			}),
			{ params: Promise.resolve({ projectId }) },
		);
		const invalidSession = await POST(
			new Request(`http://localhost/api/codex/history/${projectId}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					conversationId: "conversation-invalid-session",
					sessionId: 42,
					messages: [],
				}),
			}),
			{ params: Promise.resolve({ projectId }) },
		);
		const missingConversation = await POST(
			new Request(`http://localhost/api/codex/history/${projectId}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: null, messages: [] }),
			}),
			{ params: Promise.resolve({ projectId }) },
		);

		expect(unsafe.status).toBe(400);
		expect(invalid.status).toBe(400);
		expect(invalidSession.status).toBe(400);
		expect(missingConversation.status).toBe(400);
	});
});
