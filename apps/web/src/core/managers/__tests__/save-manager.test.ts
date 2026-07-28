import { describe, expect, test } from "bun:test";
import { SaveManager } from "../save-manager";

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function makeEditor(saveCurrentProject: () => Promise<void>) {
	return {
		project: {
			getActive: () => ({ metadata: { id: "project-1" } }),
			getIsLoading: () => false,
			getMigrationState: () => ({ isMigrating: false }),
			getKnownFileRevision: () => 12,
			saveCurrentProject,
		},
		scenes: { subscribe: () => () => {} },
		timeline: { subscribe: () => () => {} },
	};
}

describe("SaveManager status model", () => {
	test("publishes dirty, saving, and saved without blocking interaction", async () => {
		const save = deferred();
		const states: string[] = [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const manager = new SaveManager({ editor: makeEditor(() => save.promise) as any });
		manager.subscribe(() => states.push(manager.getState().status));

		manager.markDirty();
		const flush = manager.flush();

		expect(manager.getState()).toMatchObject({
			status: "saving",
			pendingChanges: true,
		});
		save.resolve();
		await flush;

		expect(manager.getState()).toMatchObject({
			status: "saved",
			pendingChanges: false,
			revision: 12,
			error: null,
		});
		expect(states).toContain("dirty");
		expect(states).toContain("saving");
		expect(states.at(-1)).toBe("saved");
	});

	test("retains failed work and exposes an explicit retry", async () => {
		let attempts = 0;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const manager = new SaveManager({
			editor: makeEditor(async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("disk full");
			}) as any,
		});

		manager.markDirty();
		await manager.flush();
		expect(manager.getState()).toMatchObject({
			status: "error",
			pendingChanges: true,
			error: "disk full",
		});

		await manager.retry();
		expect(attempts).toBe(2);
		expect(manager.getState()).toMatchObject({
			status: "saved",
			pendingChanges: false,
			error: null,
		});
	});
});
