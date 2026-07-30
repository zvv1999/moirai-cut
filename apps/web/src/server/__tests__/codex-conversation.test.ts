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
	test("does not rewrite unchanged App history on every browser refresh", async () => {
		const { store, projectId } = await fixture();
		await store.merge({
			projectId,
			conversationId: "conversation-stable",
			sessionId: "thread-stable",
			messages: [
				{
					id: "user-stable",
					role: "user",
					content: "保持历史稳定",
					turnId: "turn-stable",
					createdAt: 100,
					updatedAt: 100,
				},
			],
		});
		const synchronize = () =>
			store.synchronizeThread({
				projectId,
				conversationId: "conversation-stable",
				sessionId: "thread-stable",
				title: "保持历史稳定",
				messages: [
					{
						id: "user-stable",
						role: "user",
						content: "保持历史稳定",
						turnId: "turn-stable",
						createdAt: 100,
						updatedAt: 100,
					},
				],
			});

		const first = await synchronize();
		const second = await synchronize();

		expect(second.revision).toBe(first.revision);
	});

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
					streaming: true,
					turnId: "turn-browser",
					protocol: [
						{
							id: "turn-browser",
							method: "turn/started",
							threadId: "thread-shared",
							turnId: "turn-browser",
							status: "started",
							title: "开始处理",
						},
						{
							id: "assistant-native",
							method: "item/started",
							threadId: "thread-shared",
							turnId: "turn-browser",
							itemId: "assistant-native",
							itemType: "agentMessage",
							status: "started",
							title: "agentMessage",
						},
					],
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
				streaming: false,
				protocol: [
					expect.objectContaining({
						id: "turn-browser",
						status: "completed",
					}),
					expect.objectContaining({
						id: "assistant-native",
						status: "completed",
					}),
				],
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

	test("treats App thread history as authoritative and removes stale local-only messages", async () => {
		const { store, projectId } = await fixture();
		await store.merge({
			projectId,
			conversationId: "conversation-authoritative",
			sessionId: "thread-authoritative",
			messages: [
				{
					id: "user-native",
					role: "user",
					content: "保留原生消息",
					turnId: "turn-native",
					createdAt: 100,
					updatedAt: 100,
				},
				{
					id: "legacy-local-copy",
					role: "assistant",
					content: "这条只存在于旧浏览器缓存",
					createdAt: 101,
					updatedAt: 101,
				},
			],
		});

		const synchronized = await store.synchronizeThread({
			projectId,
			conversationId: "conversation-authoritative",
			sessionId: "thread-authoritative",
			title: "保留原生消息",
			messages: [
				{
					id: "user-native",
					role: "user",
					content: "保留原生消息",
					turnId: "turn-native",
					createdAt: 100,
					updatedAt: 110,
				},
				{
					id: "assistant-native",
					role: "assistant",
					content: "这是 App Server 的权威回复。",
					turnId: "turn-native",
					createdAt: 101,
					updatedAt: 111,
				},
			],
		});

		expect(
			synchronized.conversations[0]?.messages.map((message) => message.id),
		).toEqual(["user-native", "assistant-native"]);
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
