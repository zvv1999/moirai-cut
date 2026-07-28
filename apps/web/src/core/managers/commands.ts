import type { EditorCore } from "@/core";
import type { Command, CommandResult } from "@/commands";
import type { EditorSelectionSnapshot } from "@/selection/editor-selection";
import { applyRippleAdjustments, computeRippleAdjustments } from "@/ripple";
import type { SceneTracks } from "@/timeline/types";

interface CommandHistoryEntry {
	command: Command;
	previousSelection: EditorSelectionSnapshot;
	selectionOverride?: EditorSelectionSnapshot;
}

export interface CommandHistoryState {
	undoDepth: number;
	redoDepth: number;
	undoLabel: string | null;
	redoLabel: string | null;
}

export class CommandManager {
	public isRippleEnabled = false;
	private history: CommandHistoryEntry[] = [];
	private redoStack: CommandHistoryEntry[] = [];
	private reactors: Array<() => void> = [];
	private listeners = new Set<() => void>();
	private historyState: CommandHistoryState = {
		undoDepth: 0,
		redoDepth: 0,
		undoLabel: null,
		redoLabel: null,
	};

	constructor(private editor: EditorCore) {}

	execute({
		command,
		verifyEffect,
	}: {
		command: Command;
		/**
		 * Optional post-execute check for callers that cannot tolerate a phantom
		 * history entry. Return false when the document is unchanged.
		 *
		 * Reactors can fully neutralise a command the instant it lands — the prune
		 * reactor removes element-less tracks, so an add-track can leave nothing
		 * behind. Recording that as history would cost the user a Cmd-Z that does
		 * nothing visible AND discard a redo they still wanted, since execute()
		 * clears the redo stack. So when the check fails we keep neither.
		 *
		 * Omitted on the UI path: the check is O(document), and interactive edits
		 * do not need it.
		 */
		verifyEffect?: () => boolean;
	}): Command {
		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = command.execute();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();

		if (verifyEffect && !this.changedAccordingTo(verifyEffect)) {
			// Nothing changed. Leave history and redoStack exactly as they were, and
			// undo the one side effect that did land: a selection pointing at
			// something the reactors just removed.
			if (selectionOverride !== undefined) {
				this.editor.selection.restoreSnapshot({ snapshot: previousSelection });
			}
			return command;
		}

		this.history.push({
			command,
			previousSelection,
			selectionOverride,
		});
		this.redoStack = [];
		this.publishHistory();
		return command;
	}

	push({ command }: { command: Command }): void {
		this.history.push({
			command,
			previousSelection: this.getSelectionSnapshot(),
		});
		this.redoStack = [];
		this.publishHistory();
	}

	registerReactor(reactor: () => void): void {
		this.reactors.push(reactor);
	}

	undo(): void {
		if (this.history.length === 0) return;
		const entry = this.history.pop();
		entry?.command.undo();
		if (entry) {
			// Only restore selection for commands that explicitly changed it.
			// Commands without selection intent leave selection untouched,
			// preserving any UI-driven selection changes (clicks, box select)
			// that happened between commands. Commands that remove editor-owned
			// selection targets must declare a selection override to clear stale refs.
			if (entry.selectionOverride !== undefined) {
				this.editor.selection.restoreSnapshot({
					snapshot: entry.previousSelection,
				});
			}
			this.redoStack.push(entry);
			this.publishHistory();
		}
	}

	redo(): void {
		if (this.redoStack.length === 0) return;
		const entry = this.redoStack.pop();
		if (!entry) {
			return;
		}

		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = entry.command.redo();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();

		this.history.push({
			command: entry.command,
			previousSelection,
			selectionOverride,
		});
		this.publishHistory();
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	clear(): void {
		const changed = this.history.length > 0 || this.redoStack.length > 0;
		this.history = [];
		this.redoStack = [];
		if (changed) this.publishHistory();
	}

	getHistoryState(): CommandHistoryState {
		return this.historyState;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Runs a caller's effect check, treating a throw as "the document changed".
	 *
	 * The two outcomes are not equally safe: a spurious history entry costs one
	 * extra Cmd-Z, whereas wrongly skipping one leaves an applied mutation with
	 * no way back. So any uncertainty resolves toward keeping the entry.
	 */
	private changedAccordingTo(verifyEffect: () => boolean): boolean {
		try {
			return verifyEffect();
		} catch {
			return true;
		}
	}

	private getSelectionSnapshot(): EditorSelectionSnapshot {
		return this.editor.selection.getSnapshot();
	}

	private applySelectionOverride(
		result: CommandResult | undefined,
	): EditorSelectionSnapshot | undefined {
		if (!result?.selection) {
			return undefined;
		}
		return this.editor.selection.applySelectionPatch({
			patch: result.selection,
		});
	}

	private runReactors(): void {
		for (const reactor of this.reactors) {
			reactor();
		}
	}

	private applyRippleIfEnabled({
		beforeTracks,
	}: {
		beforeTracks: SceneTracks | null;
	}): void {
		if (!this.isRippleEnabled || !beforeTracks) {
			return;
		}

		const afterTracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!afterTracks) {
			return;
		}
		const adjustments = computeRippleAdjustments({
			beforeTracks,
			afterTracks,
		});
		if (adjustments.length === 0) {
			return;
		}

		const tracksWithRipple = applyRippleAdjustments({
			tracks: afterTracks,
			adjustments,
		});
		this.editor.timeline.updateTracks(tracksWithRipple);
	}

	private publishHistory(): void {
		const undo = this.history.at(-1)?.command ?? null;
		const redo = this.redoStack.at(-1)?.command ?? null;
		this.historyState = {
			undoDepth: this.history.length,
			redoDepth: this.redoStack.length,
			undoLabel: undo?.getLabel() ?? null,
			redoLabel: redo?.getLabel() ?? null,
		};
		for (const listener of this.listeners) listener();
	}
}
