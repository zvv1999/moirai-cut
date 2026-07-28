import { EditorCore } from "@/core";
import { Command, type CommandResult } from "@/commands/base-command";
import {
	buildSeparatedAudioElement,
	canExtractSourceAudio,
	findSeparatedAudioCompanion,
	isSourceAudioSeparated,
	planSourceAudioRecovery,
} from "@/timeline/audio-separation";
import {
	applyPlacement,
	resolveTrackPlacement,
} from "@/timeline/placement";
import { updateElementInSceneTracks } from "@/timeline/track-element-update";
import type {
	SceneTracks,
	TimelineElement,
	VideoElement,
} from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import { toast } from "sonner";

export class ToggleSourceAudioSeparationCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(
		private readonly params: {
			trackId: string;
			elementId: string;
		},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		const sourceTrack = [
			...this.savedState.overlay,
			this.savedState.main,
			...this.savedState.audio,
		].find((track) => track.id === this.params.trackId);
		if (!sourceTrack) {
			return;
		}
		const sourceElement = sourceTrack.elements.find(
			(element) => element.id === this.params.elementId,
		) as TimelineElement | undefined;
		if (!sourceElement || sourceElement.type !== "video") {
			return;
		}
		const videoElement: VideoElement = sourceElement;

		if (isSourceAudioSeparated({ element: videoElement })) {
			const companion = findSeparatedAudioCompanion({
				tracks: this.savedState,
				sourceElement: videoElement,
			});
			if (companion) {
				const recovery = planSourceAudioRecovery({
					sourceElement: videoElement,
					companion: companion.element,
				});
				if (!recovery.ok) {
					toast.error(recovery.reason);
					return;
				}
				editor.timeline.updateTracks(
					recoverSourceAudio({
						tracks: this.savedState,
						trackId: this.params.trackId,
						elementId: this.params.elementId,
						companion,
						recoveredElement: recovery.recoveredElement,
					}),
				);
				return;
			}
			editor.timeline.updateTracks(
				updateSourceAudioEnabled({
					tracks: this.savedState,
					trackId: this.params.trackId,
					elementId: this.params.elementId,
					isSourceAudioEnabled: true,
				}),
			);
			return;
		}

		const mediaAsset = editor.media
			.getAssets()
			.find((asset) => asset.id === videoElement.mediaId);
		if (!canExtractSourceAudio(videoElement, mediaAsset)) {
			return;
		}
		if (videoElement.duration <= 0) {
			return;
		}

		const separatedAudioElement = {
			...buildSeparatedAudioElement({
				sourceElement: videoElement,
			}),
			id: generateUUID(),
		};
		const placementResult = resolveTrackPlacement({
			tracks: this.savedState,
			trackType: "audio",
			timeSpans: [
				{
					startTime: separatedAudioElement.startTime,
					duration: separatedAudioElement.duration,
				},
			],
			strategy: { type: "firstAvailable" },
		});
		if (!placementResult) {
			return;
		}
		const appliedPlacement = applyPlacement({
			tracks: this.savedState,
			placementResult,
			elements: [separatedAudioElement],
		});
		if (!appliedPlacement) {
			return;
		}

		editor.timeline.updateTracks(
			updateSourceAudioEnabled({
				tracks: appliedPlacement.updatedTracks,
				trackId: this.params.trackId,
				elementId: this.params.elementId,
				isSourceAudioEnabled: false,
			}),
		);
	}

	undo(): void {
		if (!this.savedState) {
			return;
		}

		const editor = EditorCore.getInstance();
		editor.timeline.updateTracks(this.savedState);
	}
}

function recoverSourceAudio({
	tracks,
	trackId,
	elementId,
	companion,
	recoveredElement,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
	companion: {
		trackId: string;
		element: Extract<TimelineElement, { type: "audio" }>;
	};
	recoveredElement: VideoElement;
}): SceneTracks {
	const withRecoveredVideo = updateElementInSceneTracks({
		tracks,
		trackId,
		elementId,
		update: () => recoveredElement,
	});
	return {
		...withRecoveredVideo,
		audio: withRecoveredVideo.audio.map((track) =>
			track.id === companion.trackId
				? {
						...track,
						elements: track.elements.filter(
							(element) => element.id !== companion.element.id,
						),
					}
				: track,
		),
	};
}

function updateSourceAudioEnabled({
	tracks,
	trackId,
	elementId,
	isSourceAudioEnabled,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
	isSourceAudioEnabled: boolean;
}): SceneTracks {
	return updateElementInSceneTracks({
		tracks,
		trackId,
		elementId,
		elementPredicate: (element): element is VideoElement =>
			element.type === "video",
		update: (element) => ({
			...element,
			isSourceAudioEnabled,
		}),
	});
}
