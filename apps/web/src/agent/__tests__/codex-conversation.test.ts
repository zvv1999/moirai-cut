import { describe, expect, test } from "bun:test";
import {
	type CodexConversationMessage,
	synchronizeCodexConversationMessages,
} from "@/agent/codex-conversation";

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
});
