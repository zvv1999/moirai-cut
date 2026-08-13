interface SaveManagerEditor {
	project: {
		getActive(): { metadata: { id: string } };
		getIsLoading(): boolean;
		getMigrationState(): { isMigrating: boolean };
		getKnownFileRevision?(projectId: string): number | null;
		getFileConflict?(): { revision: number } | null;
		saveCurrentProject(): Promise<void>;
	};
	scenes: { subscribe(listener: () => void): () => void };
	timeline: { subscribe(listener: () => void): () => void };
}

type SaveManagerOptions = {
	debounceMs?: number;
};

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SaveState {
	status: SaveStatus;
	pendingChanges: boolean;
	savedAt: number | null;
	revision: number | null;
	conflictRevision: number | null;
	error: string | null;
}

export class SaveManager {
	private debounceMs: number;
	private isPaused = false;
	private isSaving = false;
	private activeSave: Promise<void> | null = null;
	private hasPendingSave = false;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private unsubscribeHandlers: Array<() => void> = [];
	private listeners = new Set<() => void>();
	private state: SaveState = {
		status: "idle",
		pendingChanges: false,
		savedAt: null,
		revision: null,
		conflictRevision: null,
		error: null,
	};

	constructor({
		editor,
		debounceMs = 800,
	}: {
		editor: SaveManagerEditor;
	} & SaveManagerOptions) {
		this.editor = editor;
		this.debounceMs = debounceMs;
	}

	private editor: SaveManagerEditor;

	start(): void {
		if (this.unsubscribeHandlers.length > 0) return;

		this.unsubscribeHandlers = [
			this.editor.scenes.subscribe(() => {
				this.markDirty();
			}),
			this.editor.timeline.subscribe(() => {
				this.markDirty();
			}),
		];
	}

	stop(): void {
		for (const unsubscribe of this.unsubscribeHandlers) {
			unsubscribe();
		}
		this.unsubscribeHandlers = [];
		this.clearTimer();
	}

	pause(): void {
		this.isPaused = true;
	}

	resume(): void {
		this.isPaused = false;
		if (this.hasPendingSave) {
			this.queueSave();
		}
	}

	markDirty({ force = false }: { force?: boolean } = {}): void {
		if (this.isPaused && !force) return;
		this.hasPendingSave = true;
		this.publish({
			...this.state,
			status: "dirty",
			pendingChanges: true,
			error: null,
		});
		this.queueSave();
	}

	async flush(): Promise<void> {
		this.hasPendingSave = true;
		this.publish({
			...this.state,
			status: "dirty",
			pendingChanges: true,
			error: null,
		});
		while (this.hasPendingSave || this.activeSave) {
			const progressed = await this.saveNow();
			if (!progressed || this.state.status === "error") return;
		}
	}

	async retry(): Promise<void> {
		if (this.isSaving) return;
		const conflict = this.editor.project.getFileConflict?.();
		if (conflict) {
			this.publish({
				...this.state,
				status: "error",
				pendingChanges: true,
				conflictRevision: conflict.revision,
				error: `Project changed on disk at revision ${conflict.revision}. Review the disk version before retrying.`,
			});
			return;
		}
		this.hasPendingSave = true;
		await this.saveNow();
	}

	getIsDirty(): boolean {
		return this.hasPendingSave || this.isSaving;
	}

	getState(): SaveState {
		return this.state;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * An external revision deliberately replaces the pending local document.
	 * Without clearing this flag, resume() would immediately write the freshly
	 * loaded file back as another revision and make "discard local" ineffective.
	 */
	acceptExternalState(): void {
		this.hasPendingSave = false;
		this.isSaving = false;
		this.clearTimer();
		this.publish({
			status: "saved",
			pendingChanges: false,
			savedAt: Date.now(),
			revision: this.knownRevision(),
			conflictRevision: null,
			error: null,
		});
	}

	private queueSave(): void {
		if (this.isSaving) return;
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			void this.saveNow();
		}, this.debounceMs);
	}

	private async saveNow(): Promise<boolean> {
		if (this.activeSave) {
			await this.activeSave;
			return true;
		}
		if (!this.hasPendingSave) return false;

		const activeProject = this.editor.project.getActive();
		if (!activeProject) return false;
		if (this.editor.project.getIsLoading()) return false;
		if (this.editor.project.getMigrationState().isMigrating) return false;

		const operation = this.performSave();
		this.activeSave = operation;
		try {
			await operation;
		} finally {
			if (this.activeSave === operation) {
				this.activeSave = null;
			}
		}
		return true;
	}

	private async performSave(): Promise<void> {
		this.isSaving = true;
		this.hasPendingSave = false;
		this.clearTimer();
		this.publish({
			...this.state,
			status: "saving",
			pendingChanges: true,
			conflictRevision: null,
			error: null,
		});

		try {
			await this.editor.project.saveCurrentProject();
			const conflict = this.editor.project.getFileConflict?.();
			if (conflict) {
				throw new Error(
					`Project changed on disk at revision ${conflict.revision}. Review the disk version before retrying.`,
				);
			}
			const pendingChanges = this.hasPendingSave;
			this.publish({
				status: pendingChanges ? "dirty" : "saved",
				pendingChanges,
				savedAt: Date.now(),
				revision: this.knownRevision(),
				conflictRevision: null,
				error: null,
			});
		} catch (error) {
			this.hasPendingSave = true;
			const conflict = this.editor.project.getFileConflict?.();
			this.publish({
				...this.state,
				status: "error",
				pendingChanges: true,
				conflictRevision: conflict?.revision ?? null,
				error: error instanceof Error ? error.message : "Save failed",
			});
		} finally {
			this.isSaving = false;
			if (this.hasPendingSave && this.state.status !== "error") {
				this.queueSave();
			}
		}
	}

	private knownRevision(): number | null {
		const activeProject = this.editor.project.getActive();
		return (
			this.editor.project.getKnownFileRevision?.(activeProject.metadata.id) ??
			null
		);
	}

	private publish(state: SaveState): void {
		this.state = state;
		for (const listener of this.listeners) listener();
	}

	private clearTimer(): void {
		if (!this.saveTimer) return;
		clearTimeout(this.saveTimer);
		this.saveTimer = null;
	}
}
