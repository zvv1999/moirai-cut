import { describe, expect, test } from "bun:test";
import {
	beginRecoverySession,
	markRecoverySessionClean,
	type RecoverySessionStorage,
} from "../recovery-session";

function memoryStorage(seed?: Record<string, string>): RecoverySessionStorage {
	const values = new Map(Object.entries(seed ?? {}));
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
		removeItem: (key) => values.delete(key),
	};
}

describe("project recovery sessions", () => {
	test("offers an explicit choice after an interrupted autosaved session", () => {
		const storage = memoryStorage({
			"opencut:recovery:project-1": JSON.stringify({
				projectId: "project-1",
				sessionId: "old-session",
				status: "open",
				startedAt: "2026-07-28T10:00:00.000Z",
				openingRevision: 12,
				lastSavedRevision: 15,
			}),
		});

		const candidate = beginRecoverySession({
			storage,
			projectId: "project-1",
			currentRevision: 15,
			sessionId: "new-session",
			now: "2026-07-28T11:00:00.000Z",
		});

		expect(candidate).toEqual({
			projectId: "project-1",
			interruptedAt: "2026-07-28T10:00:00.000Z",
			openingRevision: 12,
			recoveryRevision: 15,
		});
	});

	test("clean exits and sessions without a newer saved state do not prompt", () => {
		const storage = memoryStorage();
		beginRecoverySession({
			storage,
			projectId: "project-1",
			currentRevision: 7,
			sessionId: "first",
			now: "2026-07-28T10:00:00.000Z",
		});
		markRecoverySessionClean({
			storage,
			projectId: "project-1",
			sessionId: "first",
		});

		expect(
			beginRecoverySession({
				storage,
				projectId: "project-1",
				currentRevision: 7,
				sessionId: "second",
				now: "2026-07-28T11:00:00.000Z",
			}),
		).toBeNull();
	});
});
