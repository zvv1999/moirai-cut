import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCodexConversationStore } from "../codex-conversation";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

async function fixture() {
	const root = await mkdtemp(path.join(tmpdir(), "opencut-codex-conversation-"));
	temporaryRoots.push(root);
	const projectId = "project-shared-chat";
	await mkdir(path.join(root, projectId), { recursive: true });
	return {
		projectId,
		store: createCodexConversationStore({ rootDirectory: root }),
	};
}

describe("project-scoped Codex conversation storage", () => {
	test("persists one authoritative conversation across store instances", async () => {
		const { projectId, store } = await fixture();
		await store.merge({
			projectId,
			sessionId: "thread-shared",
			messages: [
				{
					id: "message-user",
					role: "user",
					content: "第一条消息",
					createdAt: 100,
					updatedAt: 100,
				},
			],
		});

		const reopened = createCodexConversationStore({
			rootDirectory: store.rootDirectory,
		});
		const conversation = await reopened.read(projectId);

		expect(conversation).toMatchObject({
			schemaVersion: "opencut.codex-conversation.v1",
			projectId,
			revision: 1,
			sessionId: "thread-shared",
			messages: [
				{
					id: "message-user",
					role: "user",
					content: "第一条消息",
				},
			],
		});
	});

	test("merges updates from different pages without dropping either page", async () => {
		const { projectId, store } = await fixture();
		await store.merge({
			projectId,
			sessionId: "thread-shared",
			messages: [
				{
					id: "page-a-user",
					role: "user",
					content: "页面 A",
					createdAt: 100,
					updatedAt: 100,
				},
				{
					id: "page-a-assistant",
					role: "assistant",
					content: "",
					streaming: true,
					createdAt: 101,
					updatedAt: 101,
					protocol: [],
				},
			],
		});
		await store.merge({
			projectId,
			sessionId: "thread-shared",
			messages: [
				{
					id: "page-b-user",
					role: "user",
					content: "页面 B",
					createdAt: 102,
					updatedAt: 102,
				},
				{
					id: "page-a-assistant",
					role: "assistant",
					content: "页面 A 已完成",
					streaming: false,
					createdAt: 101,
					updatedAt: 103,
					protocol: [
						{
							id: "turn-a",
							method: "turn/completed",
							threadId: "thread-shared",
							status: "completed",
							title: "处理完成",
						},
					],
				},
			],
		});

		const conversation = await store.read(projectId);
		expect(conversation.messages.map((message) => message.id)).toEqual([
			"page-a-user",
			"page-a-assistant",
			"page-b-user",
		]);
		expect(conversation.messages[1]).toMatchObject({
			content: "页面 A 已完成",
			streaming: false,
		});
		expect(conversation.revision).toBe(2);
	});

	test("rejects unsafe projects and oversized or malformed messages", async () => {
		const { store } = await fixture();

		await expect(store.read("../unsafe")).rejects.toThrow("Unsafe project id");
		await expect(
			store.merge({
				projectId: "project-shared-chat",
				sessionId: null,
				messages: [
					{
						id: "bad",
						role: "user",
						content: "x".repeat(200_001),
						createdAt: 1,
						updatedAt: 1,
					},
				],
			}),
		).rejects.toThrow("message content");
	});
});
