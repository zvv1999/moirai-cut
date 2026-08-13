import { describe, expect, test } from "bun:test";
import { SaveManager } from "../save-manager";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function makeEditor({
	saveCurrentProject,
	getFileConflict = () => null,
}: {
	saveCurrentProject: () => Promise<void>;
	getFileConflict?: () => { revision: number } | null;
}) {
	return {
		project: {
			getActive: () => ({ metadata: { id: "project-1" } }),
			getIsLoading: () => false,
			getMigrationState: () => ({ isMigrating: false }),
			getKnownFileRevision: () => 12,
			getFileConflict,
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
		const manager = new SaveManager({
			editor: makeEditor({ saveCurrentProject: () => save.promise }),
		});
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
		const manager = new SaveManager({
			editor: makeEditor({
				saveCurrentProject: async () => {
					attempts += 1;
					if (attempts === 1) throw new Error("disk full");
				},
			}),
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

	test("flush waits for a follow-up save when another save is in flight", async () => {
		const firstSave = deferred();
		const secondSave = deferred();
		let attempts = 0;
		const manager = new SaveManager({
			editor: makeEditor({
				saveCurrentProject: () => {
					attempts += 1;
					return attempts === 1 ? firstSave.promise : secondSave.promise;
				},
			}),
		});

		manager.markDirty();
		const autosave = manager.flush();
		let exportFlushSettled = false;
		const exportFlush = manager.flush().then(() => {
			exportFlushSettled = true;
		});

		await Promise.resolve();
		expect(attempts).toBe(1);
		expect(exportFlushSettled).toBe(false);

		firstSave.resolve();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(attempts).toBe(2);
		expect(exportFlushSettled).toBe(false);

		secondSave.resolve();
		await Promise.all([autosave, exportFlush]);
		expect(exportFlushSettled).toBe(true);
	});

	test("blocks blind retry when the project changed on disk", async () => {
		let attempts = 0;
		const manager = new SaveManager({
			editor: makeEditor({
				saveCurrentProject: async () => {
					attempts += 1;
				},
				getFileConflict: () => ({ revision: 19 }),
			}),
		});

		await manager.retry();

		expect(attempts).toBe(0);
		expect(manager.getState()).toMatchObject({
			status: "error",
			pendingChanges: true,
			conflictRevision: 19,
		});
		expect(manager.getState().error).toContain("Review the disk version");
	});
});
