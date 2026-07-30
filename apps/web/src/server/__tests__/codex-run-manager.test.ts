import { describe, expect, test } from "bun:test";
import {
	createCodexRunManager,
	type CodexRunService,
} from "@/server/codex-run-manager";

function input() {
	return {
		projectId: "project-1",
		conversationId: "conversation-1",
		message: "自动完成重剪",
		context: "",
		toolProfile: "verify" as const,
	};
}

describe("Codex reconnectable run manager", () => {
	test("keeps the App turn alive after one subscriber disconnects and replays later events", async () => {
		let release = () => {};
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const service: CodexRunService = {
			stream: async function* () {
				yield { type: "session", sessionId: "thread-1" };
				yield {
					type: "turn",
					sessionId: "thread-1",
					turnId: "turn-1",
				};
				await barrier;
				yield { type: "delta", delta: "已完成" };
				yield {
					type: "done",
					sessionId: "thread-1",
					message: "已完成",
				};
			},
			steer: async () => {},
			interrupt: async () => {},
			compact: async () => {},
		};
		const manager = createCodexRunManager({
			service,
			createId: () => "run-1",
		});
		const run = manager.start(input());
		expect(run.runId).toBe("run-1");

		const firstSubscriber = manager
			.subscribe({ runId: "run-1", afterSequence: 0 })
			[Symbol.asyncIterator]();
		const sessionEvent = await firstSubscriber.next();
		expect(sessionEvent.value).toMatchObject({
			sequence: 1,
			event: { type: "session", sessionId: "thread-1" },
		});
		await firstSubscriber.return?.();

		release();
		await manager.waitForCompletion("run-1");

		const replayed = [];
		for await (const event of manager.subscribe({
			runId: "run-1",
			afterSequence: 1,
		})) {
			replayed.push(event);
		}
		expect(replayed.map((entry) => entry.sequence)).toEqual([2, 3, 4]);
		expect(replayed.at(-1)?.event).toEqual({
			type: "done",
			sessionId: "thread-1",
			message: "已完成",
		});
		expect(manager.get("run-1")).toMatchObject({
			status: "completed",
			sessionId: "thread-1",
			turnId: "turn-1",
		});
	});

	test("routes steer, interrupt, and compact actions to the active native thread", async () => {
		const actions: unknown[] = [];
		let release = () => {};
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const service: CodexRunService = {
			stream: async function* () {
				yield { type: "session", sessionId: "thread-2" };
				yield {
					type: "turn",
					sessionId: "thread-2",
					turnId: "turn-2",
				};
				await barrier;
				yield {
					type: "done",
					sessionId: "thread-2",
					message: "完成",
				};
			},
			steer: async (action) => {
				actions.push({ action: "steer", ...action });
			},
			interrupt: async (action) => {
				actions.push({ action: "interrupt", ...action });
				release();
			},
			compact: async (action) => {
				actions.push({ action: "compact", ...action });
			},
		};
		const manager = createCodexRunManager({
			service,
			createId: () => "run-2",
		});
		manager.start(input());
		const subscription = manager
			.subscribe({ runId: "run-2", afterSequence: 0 })
			[Symbol.asyncIterator]();
		await subscription.next();
		await subscription.next();

		await manager.steer({ runId: "run-2", message: "继续收紧" });
		await manager.compact({ runId: "run-2" });
		await manager.interrupt({ runId: "run-2" });
		await manager.waitForCompletion("run-2");

		expect(actions).toEqual([
			{
				action: "steer",
				sessionId: "thread-2",
				turnId: "turn-2",
				message: "继续收紧",
				toolProfile: "verify",
			},
			{
				action: "compact",
				sessionId: "thread-2",
				toolProfile: "verify",
			},
			{
				action: "interrupt",
				sessionId: "thread-2",
				turnId: "turn-2",
				toolProfile: "verify",
			},
		]);
	});
});
