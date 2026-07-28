import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type {
	ElementRef,
	SceneTracks,
	TimelineTransitionType,
} from "@/timeline";
import {
	applyTimelineTransition,
	removeTimelineTransition,
} from "@/timeline/transitions";
import type { MediaTime } from "@/wasm";

export class SetTimelineTransitionCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(
		private readonly params: {
			from: ElementRef;
			to: ElementRef;
			type: TimelineTransitionType;
			duration: MediaTime;
			transitionId: string;
			overlayTrackId: string;
		},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const updatedTracks = applyTimelineTransition({
			tracks: this.savedState,
			...this.params,
		});
		editor.timeline.updateTracks(updatedTracks);
		const incoming = [...updatedTracks.overlay, updatedTracks.main]
			.flatMap((track) =>
				track.elements.map((element) => ({ track, element })),
			)
			.find(
				({ element }) =>
					element.transitionIn?.id === this.params.transitionId,
			);
		return incoming
			? createElementSelectionResult([
					{
						trackId: incoming.track.id,
						elementId: incoming.element.id,
					},
				])
			: undefined;
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}

export class RemoveTimelineTransitionCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(private readonly transitionId: string) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const transition = [
			...this.savedState.overlay,
			this.savedState.main,
			...this.savedState.audio,
		]
			.flatMap((track) =>
				track.elements.map((element) => ({ track, element })),
			)
			.find(
				({ element }) => element.transitionIn?.id === this.transitionId,
			)?.element.transitionIn;
		if (!transition) {
			throw new Error(`Transition ${this.transitionId} was not found`);
		}

		let incomingId: string | undefined;
		for (const track of [
			...this.savedState.overlay,
			this.savedState.main,
			...this.savedState.audio,
		]) {
			const incoming = track.elements.find(
				(element) => element.transitionIn?.id === this.transitionId,
			);
			if (incoming) {
				incomingId = incoming.id;
				break;
			}
		}
		const updatedTracks = removeTimelineTransition({
			tracks: this.savedState,
			transitionId: this.transitionId,
		});
		editor.timeline.updateTracks(updatedTracks);
		return incomingId
			? createElementSelectionResult([
					{
						trackId: transition.originalTrackId,
						elementId: incomingId,
					},
				])
			: undefined;
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}
