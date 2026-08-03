import { afterEach, describe, expect, test } from "bun:test";
import {
	type CodexConversationMessage,
	fetchCodexConversation,
	isCodexProjectConversation,
	mergeCodexConversationMessages,
	persistCodexConversation,
	synchronizeCodexConversationMessages,
} from "@/agent/codex-conversation";

const originalFetch = globalThis.fetch;

function installFetchMock(
	handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): void {
	globalThis.fetch = Object.assign(handler, {
		preconnect: originalFetch.preconnect,
	});
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const nativeMessages: CodexConversationMessage[] = [
	{
		id: "user-native",
		role: "user",
		content: "原生历史",
		createdAt: 100,
		updatedAt: 100,
	},
];

describe("Codex conversation client synchronization", () => {
	test("validates complete Provider-native event history without accepting non-JSON payloads", () => {
		const projectConversation = {
			schemaVersion: "opencut.codex-conversations.v2",
			projectId: "project-1",
			revision: 1,
			updatedAt: 101,
			conversations: [
				{
					id: "conversation-1",
					title: "原生事件",
					provider: "claude",
					sessionId: "claude-session",
					createdAt: 100,
					updatedAt: 101,
					messages: [
						{
							id: "assistant-1",
							role: "assistant",
							content: "完成",
							createdAt: 100,
							updatedAt: 101,
							nativeEvents: [
								{
									id: "native-1",
									provider: "claude",
									transport: "stream-json",
									name: "assistant/tool_use",
									payload: {
										type: "assistant",
										message: { content: [{ type: "tool_use" }] },
									},
									raw: '{"type":"assistant"}',
								},
							],
						},
					],
				},
			],
		};

		expect(isCodexProjectConversation(projectConversation)).toBe(true);
		expect(
			isCodexProjectConversation({
				...projectConversation,
				conversations: [
					{
						...projectConversation.conversations[0],
						messages: [
							{
								...projectConversation.conversations[0]!.messages[0],
								nativeEvents: [
									{
										...projectConversation.conversations[0]!.messages[0]!
											.nativeEvents[0],
										payload: { invalid: () => true },
									},
								],
							},
						],
					},
				],
			}),
		).toBe(false);
	});

	test("replaces stale browser history with the authoritative App thread while idle", () => {
		const stale: CodexConversationMessage = {
			id: "stale-browser-only",
			role: "assistant",
			content: "旧浏览器副本",
			createdAt: 101,
			updatedAt: 101,
		};

		expect(
			synchronizeCodexConversationMessages({
				current: [...nativeMessages, stale],
				incoming: nativeMessages,
				hasActiveRun: false,
			}),
		).toEqual(nativeMessages);
	});

	test("keeps optimistic streaming messages until App history catches up", () => {
		const streaming: CodexConversationMessage = {
			id: "assistant-streaming",
			role: "assistant",
			content: "正在",
			streaming: true,
			runId: "run-1",
			createdAt: 101,
			updatedAt: 101,
		};

		expect(
			synchronizeCodexConversationMessages({
				current: [...nativeMessages, streaming],
				incoming: nativeMessages,
				hasActiveRun: true,
			}),
		).toEqual([...nativeMessages, streaming]);
	});

	test("uses the newest message version when merging live page updates", () => {
		const updated = {
			...nativeMessages[0]!,
			content: "跨页面更新",
			updatedAt: 101,
		};

		expect(
			mergeCodexConversationMessages({
				current: nativeMessages,
				incoming: [updated],
			}),
		).toEqual([updated]);
	});

	test("fetches the selected native task projection without browser caching", async () => {
		let requestedUrl = "";
		let requestedInit: RequestInit | undefined;
		installFetchMock(async (...[input, init]: Parameters<typeof fetch>) => {
			requestedUrl = String(input);
			requestedInit = init;
			return Response.json({
				schemaVersion: "opencut.codex-conversations.v2",
				projectId: "project-1",
				revision: 3,
				conversations: [],
				updatedAt: 100,
			});
		});

		const conversation = await fetchCodexConversation({
			projectId: "project-1",
			conversationId: "conversation 1",
		});

		expect(requestedUrl).toBe(
			"/api/codex/history/project-1?conversationId=conversation%201",
		);
		expect(requestedInit).toMatchObject({ cache: "no-store" });
		expect(conversation?.revision).toBe(3);
	});

	test("uses conditional local refreshes and skips parsing an unchanged history body", async () => {
		let requestedUrl = "";
		let requestedInit: RequestInit | undefined;
		installFetchMock(async (...[input, init]: Parameters<typeof fetch>) => {
			requestedUrl = String(input);
			requestedInit = init;
			return new Response(null, {
				status: 304,
				headers: { etag: '"opencut-codex-3"' },
			});
		});

		const conversation = await fetchCodexConversation({
			projectId: "project-1",
			conversationId: "conversation 1",
			revision: 3,
			synchronizeNative: false,
		});

		expect(requestedUrl).toBe(
			"/api/codex/history/project-1?conversationId=conversation%201&syncNative=0",
		);
		expect(new Headers(requestedInit?.headers).get("if-none-match")).toBe(
			'"opencut-codex-3"',
		);
		expect(conversation).toBeNull();
	});

	test("persists only the project binding and current UI projection", async () => {
		let body = "";
		installFetchMock(async (...[_input, init]: Parameters<typeof fetch>) => {
			body = String(init?.body);
			return Response.json({
				schemaVersion: "opencut.codex-conversations.v2",
				projectId: "project-1",
				revision: 4,
				conversations: [],
				updatedAt: 101,
			});
		});

		await persistCodexConversation({
			projectId: "project-1",
			conversationId: "conversation-1",
			title: "原生任务",
			sessionId: "thread-1",
			messages: nativeMessages,
		});

		expect(JSON.parse(body)).toEqual({
			conversationId: "conversation-1",
			title: "原生任务",
			sessionId: "thread-1",
			messages: nativeMessages,
		});
	});

	test("rejects App history errors and malformed projections", async () => {
		installFetchMock(async (..._args: Parameters<typeof fetch>) =>
			Response.json({ error: "App task 不可用" }, { status: 503 }),
		);
		await expect(
			fetchCodexConversation({ projectId: "project-1" }),
		).rejects.toThrow("App task 不可用");

		installFetchMock(async (..._args: Parameters<typeof fetch>) =>
			Response.json({ projectId: "project-1" }),
		);
		await expect(
			fetchCodexConversation({ projectId: "project-1" }),
		).rejects.toThrow("响应格式无效");
	});
});
