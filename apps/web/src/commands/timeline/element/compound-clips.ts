import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { ElementRef, SceneTracks } from "@/timeline";
import {
	breakApartCompoundClip,
	createCompoundClip,
	updateCompoundChild,
} from "@/timeline/compound-clips";
import type { MediaTime } from "@/wasm";

export class CreateCompoundClipCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(
		private readonly params: {
			selection: ElementRef[];
			compoundId: string;
			name: string;
		},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const firstRef = this.params.selection[0];
		const updatedTracks = createCompoundClip({
			tracks: this.savedState,
			...this.params,
		});
		editor.timeline.updateTracks(updatedTracks);
		return createElementSelectionResult([
			{ trackId: firstRef.trackId, elementId: this.params.compoundId },
		]);
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}

export class BreakApartCompoundClipCommand extends Command {
	private savedState: SceneTracks | null = null;
	private restoredSelection: ElementRef[] = [];

	constructor(private readonly compoundId: string) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const located = [
			...this.savedState.overlay,
			this.savedState.main,
			...this.savedState.audio,
		]
			.flatMap((track) =>
				track.elements.map((element) => ({ track, element })),
			)
			.find(({ element }) => element.compound?.id === this.compoundId);
		if (!located?.element.compound) {
			throw new Error(`Compound clip ${this.compoundId} was not found`);
		}
		this.restoredSelection = located.element.compound.children.map((child) => ({
			trackId: located.track.id,
			elementId: child.element.id,
		}));
		editor.timeline.updateTracks(
			breakApartCompoundClip({
				tracks: this.savedState,
				compoundId: this.compoundId,
			}),
		);
		return createElementSelectionResult(this.restoredSelection);
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}

export class UpdateCompoundChildCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(
		private readonly params: {
			compoundId: string;
			childElementId: string;
			patch: { name?: string; relativeStartTime?: MediaTime };
			compoundRef: ElementRef;
		},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		editor.timeline.updateTracks(
			updateCompoundChild({
				tracks: this.savedState,
				compoundId: this.params.compoundId,
				childElementId: this.params.childElementId,
				patch: this.params.patch,
			}),
		);
		return createElementSelectionResult([this.params.compoundRef]);
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}
