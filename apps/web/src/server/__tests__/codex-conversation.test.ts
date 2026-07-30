import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
	const root = await mkdtemp(
		path.join(tmpdir(), "opencut-codex-conversation-"),
	);
	temporaryRoots.push(root);
	const projectId = "project-shared-chat";
	await mkdir(path.join(root, projectId), { recursive: true });
	let clock = 1_000;
	return {
		projectId,
		root,
		store: createCodexConversationStore({
			rootDirectory: root,
			now: () => ++clock,
		}),
	};
}

describe("project-scoped Codex conversation storage", () => {
	test("synchronizes App thread messages without duplicating browser placeholders", async () => {
		const { store, projectId } = await fixture();
		await store.merge({
			projectId,
			conversationId: "conversation-shared",
			sessionId: "thread-shared",
			messages: [
				{
					id: "user-browser",
					role: "user",
					content: "收紧开场",
					referenceCount: 1,
					createdAt: 100,
					updatedAt: 100,
				},
				{
					id: "assistant-browser",
					role: "assistant",
					content: "处理中",
					streaming: false,
					turnId: "turn-browser",
					protocol: [],
					createdAt: 101,
					updatedAt: 101,
				},
			],
		});

		const synchronized = await store.synchronizeThread({
			projectId,
			conversationId: "conversation-shared",
			sessionId: "thread-shared",
			title: "收紧开场",
			messages: [
				{
					id: "user-browser",
					role: "user",
					content: "收紧开场",
					turnId: "turn-browser",
					createdAt: 100,
					updatedAt: 110,
				},
				{
					id: "assistant-native",
					role: "assistant",
					content: "已收紧开场。",
					turnId: "turn-browser",
					createdAt: 101,
					updatedAt: 111,
				},
				{
					id: "user-app",
					role: "user",
					content: "再快一点",
					turnId: "turn-app",
					createdAt: 120,
					updatedAt: 130,
				},
				{
					id: "assistant-app",
					role: "assistant",
					content: "已继续压缩停顿。",
					turnId: "turn-app",
					createdAt: 121,
					updatedAt: 131,
				},
			],
		});

		expect(synchronized.conversations[0]?.messages).toEqual([
			expect.objectContaining({
				id: "user-browser",
				content: "收紧开场",
				referenceCount: 1,
			}),
			expect.objectContaining({
				id: "assistant-browser",
				content: "已收紧开场。",
				turnId: "turn-browser",
				protocol: [],
			}),
			expect.objectContaining({
				id: "user-app",
				content: "再快一点",
			}),
			expect.objectContaining({
				id: "assistant-app",
				content: "已继续压缩停顿。",
			}),
		]);
	});

	test("persists multiple independent conversations and resumes each thread", async () => {
		const { projectId, store } = await fixture();
		await store.merge({
			projectId,
			conversationId: "conversation-first",
			sessionId: "thread-first",
			messages: [
				{
					id: "message-first",
					role: "user",
					content: "先整理开场节奏",
					createdAt: 100,
					updatedAt: 100,
				},
			],
		});
		await store.merge({
			projectId,
			conversationId: "conversation-second",
			sessionId: "thread-second",
			messages: [
				{
					id: "message-second",
					role: "user",
					content: "再调整片尾字幕",
					runId: "run-second",
					turnId: "turn-second",
					runSequence: 12,
					createdAt: 200,
					updatedAt: 200,
				},
			],
		});

		const reopened = createCodexConversationStore({
			rootDirectory: store.rootDirectory,
		});
		const history = await reopened.read(projectId);

		expect(history).toMatchObject({
			schemaVersion: "opencut.codex-conversations.v2",
			projectId,
			revision: 2,
			conversations: [
				{
					id: "conversation-second",
					title: "再调整片尾字幕",
					sessionId: "thread-second",
					messages: [
						{
							id: "message-second",
							runId: "run-second",
							turnId: "turn-second",
							runSequence: 12,
						},
					],
				},
				{
					id: "conversation-first",
					title: "先整理开场节奏",
					sessionId: "thread-first",
					messages: [{ id: "message-first" }],
				},
			],
		});
	});

	test("merges updates from different pages without dropping either page", async () => {
		const { projectId, store } = await fixture();
		await store.merge({
			projectId,
			conversationId: "conversation-shared",
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
			conversationId: "conversation-shared",
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

		const history = await store.read(projectId);
		const conversation = history.conversations[0];
		expect(conversation?.messages.map((message) => message.id)).toEqual([
			"page-a-user",
			"page-a-assistant",
			"page-b-user",
		]);
		expect(conversation?.messages[1]).toMatchObject({
			content: "页面 A 已完成",
			streaming: false,
		});
		expect(history.revision).toBe(2);
	});

	test("migrates the existing v1 project conversation without losing context", async () => {
		const { projectId, root, store } = await fixture();
		const agentDirectory = path.join(root, projectId, "agent");
		await mkdir(agentDirectory, { recursive: true });
		await writeFile(
			path.join(agentDirectory, "codex-conversation.json"),
			JSON.stringify({
				schemaVersion: "opencut.codex-conversation.v1",
				projectId,
				revision: 7,
				sessionId: "thread-legacy",
				messages: [
					{
						id: "legacy-user",
						role: "user",
						content: "继续之前的粗剪",
						createdAt: 300,
						updatedAt: 300,
					},
				],
				updatedAt: 400,
			}),
		);

		const history = await store.read(projectId);
		expect(history).toMatchObject({
			schemaVersion: "opencut.codex-conversations.v2",
			projectId,
			revision: 7,
			conversations: [
				{
					id: "legacy-conversation",
					title: "继续之前的粗剪",
					sessionId: "thread-legacy",
					messages: [{ id: "legacy-user" }],
					createdAt: 300,
					updatedAt: 400,
				},
			],
		});
	});

	test("rejects unsafe projects and oversized or malformed messages", async () => {
		const { store } = await fixture();

		await expect(store.read("../unsafe")).rejects.toThrow("Unsafe project id");
		await expect(
			store.merge({
				projectId: "project-shared-chat",
				conversationId: "conversation-invalid",
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
		await expect(
			store.merge({
				projectId: "project-shared-chat",
				conversationId: "../conversation",
				sessionId: null,
				messages: [],
			}),
		).rejects.toThrow("conversation id");
	});
});
