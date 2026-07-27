import { describe, expect, test } from "bun:test";
import { Command } from "@/commands";
import type { CommandResult } from "@/commands";
import { CommandManager } from "../commands";
import { SelectionManager } from "../selection-manager";

/**
 * Covers the `verifyEffect` contract on the REAL CommandManager.
 *
 * The agent tests stub CommandManager, so they can only prove AgentManager holds
 * up its end. These prove the other end: that omitting the callback leaves the
 * interactive path untouched, and that a failed check unwinds *everything*
 * execute() would otherwise have committed — history entry, redo stack, and
 * selection.
 */

class SpyCommand extends Command {
	executed = 0;
	undone = 0;
	constructor(private result?: CommandResult) {
		super();
	}
	execute(): CommandResult | undefined {
		this.executed += 1;
		return this.result;
	}
	undo(): void {
		this.undone += 1;
	}
}

function makeManager() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const editor: any = {
		scenes: { getActiveSceneOrNull: () => null },
		timeline: { updateTracks: () => {} },
	};
	// The real SelectionManager, so selection restore is exercised rather than
	// modelled — it is the part of the rollback most likely to be wrong.
	const selection = new SelectionManager(editor);
	editor.selection = selection;
	return { manager: new CommandManager(editor), selection };
}

describe("CommandManager.execute without verifyEffect (the interactive path)", () => {
	test("records history and clears the redo stack, exactly as before", () => {
		const { manager } = makeManager();
		const first = new SpyCommand();
		manager.execute({ command: first });
		expect(manager.canUndo()).toBe(true);

		manager.undo();
		expect(manager.canRedo()).toBe(true);

		// A fresh command must still discard the redo branch.
		manager.execute({ command: new SpyCommand() });
		expect(manager.canRedo()).toBe(false);
		expect(first.undone).toBe(1);
	});
});

describe("CommandManager.execute with verifyEffect", () => {
	test("a passing check behaves identically to no check at all", () => {
		const { manager } = makeManager();
		manager.execute({ command: new SpyCommand(), verifyEffect: () => true });
		expect(manager.canUndo()).toBe(true);
	});

	test("a failing check records no history entry", () => {
		const { manager } = makeManager();
		const command = new SpyCommand();
		manager.execute({ command, verifyEffect: () => false });

		expect(command.executed).toBe(1); // it really did run…
		expect(manager.canUndo()).toBe(false); // …but cost nobody a Cmd-Z.
	});

	test("a failing check preserves a pending redo instead of destroying it", () => {
		const { manager } = makeManager();
		const real = new SpyCommand();
		manager.execute({ command: real });
		manager.undo();
		expect(manager.canRedo()).toBe(true);

		// A command that changes nothing must not cost the user their redo.
		manager.execute({ command: new SpyCommand(), verifyEffect: () => false });
		expect(manager.canRedo()).toBe(true);

		manager.redo();
		expect(real.executed).toBe(2);
	});

	test("a failing check restores a selection the command had already moved", () => {
		const { manager, selection } = makeManager();
		const original = [{ trackId: "t1", elementId: "e1" }];
		selection.restoreSnapshot({
			snapshot: {
				selectedElements: original,
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			},
		});

		// Models a command that selects what it just created — which the prune
		// reactor then removes, leaving the selection pointing at nothing.
		const command = new SpyCommand({
			selection: {
				selectedElements: [{ trackId: "ghost", elementId: "ghost" }],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			},
		});
		manager.execute({ command, verifyEffect: () => false });

		expect(selection.getSnapshot().selectedElements).toEqual(original);
	});

	test("a throwing check keeps the history entry rather than stranding the edit", () => {
		const { manager } = makeManager();
		// Uncertainty must resolve toward undoable: an extra Cmd-Z is cheap, an
		// applied mutation with no way back is not.
		manager.execute({
			command: new SpyCommand(),
			verifyEffect: () => {
				throw new Error("fingerprint blew up");
			},
		});
		expect(manager.canUndo()).toBe(true);
	});
});
