import { cloneAnimations } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import type { MediaAsset } from "@/media/types";
import { DEFAULTS } from "@/timeline/defaults";
import type {
	CreateUploadAudioElement,
	SceneTracks,
	TimelineElement,
	AudioElement,
	VideoElement,
} from "../types";

type MediaAudioState = Pick<MediaAsset, "hasAudio">;
const SOURCE_AUDIO_ORIGIN_PARAM = "sourceAudioOriginElementId";

export interface SeparatedAudioCompanion {
	trackId: string;
	element: AudioElement;
}

export type SourceAudioRecoveryPlan =
	| {
			ok: true;
			recoveredElement: VideoElement;
			removeCompanion: true;
	  }
	| {
			ok: false;
			reason: "Separated audio must be aligned before recovery";
	  };

export function isSourceAudioEnabled({
	element,
}: {
	element: VideoElement;
}): boolean {
	return element.isSourceAudioEnabled !== false;
}

export function isSourceAudioSeparated({
	element,
}: {
	element: VideoElement;
}): boolean {
	return !isSourceAudioEnabled({ element });
}

export function canExtractSourceAudio(
	element: TimelineElement,
	mediaAsset: MediaAudioState | null | undefined,
): element is VideoElement {
	return (
		element.type === "video" &&
		isSourceAudioEnabled({ element }) &&
		!!mediaAsset &&
		mediaAsset.hasAudio !== false
	);
}

export function canRecoverSourceAudio(
	element: TimelineElement,
): element is VideoElement {
	return element.type === "video" && isSourceAudioSeparated({ element });
}

export function canToggleSourceAudio(
	element: TimelineElement,
	mediaAsset: MediaAudioState | null | undefined,
): element is VideoElement {
	return (
		canRecoverSourceAudio(element) || canExtractSourceAudio(element, mediaAsset)
	);
}

export function doesElementHaveEnabledAudio({
	element,
	mediaAsset,
}: {
	element: AudioElement | VideoElement;
	mediaAsset?: MediaAudioState | null;
}): boolean {
	if (element.type === "audio") {
		return true;
	}

	return (
		!!mediaAsset &&
		mediaAsset.hasAudio !== false &&
		isSourceAudioEnabled({ element })
	);
}

export function buildSeparatedAudioElement({
	sourceElement,
}: {
	sourceElement: VideoElement;
}): CreateUploadAudioElement {
	return {
		type: "audio",
		sourceType: "upload",
		mediaId: sourceElement.mediaId,
		name: sourceElement.name,
		duration: sourceElement.duration,
		startTime: sourceElement.startTime,
		trimStart: sourceElement.trimStart,
		trimEnd: sourceElement.trimEnd,
		sourceDuration: sourceElement.sourceDuration,
		params: {
			volume:
				typeof sourceElement.params.volume === "number"
					? sourceElement.params.volume
					: DEFAULTS.element.volume,
			muted: sourceElement.params.muted === true,
			[SOURCE_AUDIO_ORIGIN_PARAM]: sourceElement.id,
		},
		retime: sourceElement.retime
			? {
					rate: sourceElement.retime.rate,
					maintainPitch: sourceElement.retime.maintainPitch,
				}
			: undefined,
		animations: cloneVolumeAnimations({
			animations: sourceElement.animations,
		}),
	};
}

export function findSeparatedAudioCompanion({
	tracks,
	sourceElement,
}: {
	tracks: SceneTracks;
	sourceElement: VideoElement;
}): SeparatedAudioCompanion | null {
	const candidates = tracks.audio.flatMap((track) =>
		track.elements
			.filter(
				(element): element is AudioElement =>
					element.type === "audio" &&
					element.sourceType === "upload" &&
					element.mediaId === sourceElement.mediaId,
			)
			.map((element) => ({ trackId: track.id, element })),
	);
	const marked = candidates.find(
		({ element }) =>
			element.params[SOURCE_AUDIO_ORIGIN_PARAM] === sourceElement.id,
	);
	if (marked) return marked;

	const exact = candidates.filter(({ element }) =>
		isSeparatedAudioAligned({ sourceElement, companion: element }),
	);
	return exact.length === 1 ? exact[0] : null;
}

export function planSourceAudioRecovery({
	sourceElement,
	companion,
}: {
	sourceElement: VideoElement;
	companion: AudioElement;
}): SourceAudioRecoveryPlan {
	if (!isSeparatedAudioAligned({ sourceElement, companion })) {
		return {
			ok: false,
			reason: "Separated audio must be aligned before recovery",
		};
	}

	const companionVolumeAnimations = companion.animations?.volume;
	const clonedCompanionVolume = companionVolumeAnimations
		? cloneAnimations({
				animations: { volume: companionVolumeAnimations },
				shouldRegenerateKeyframeIds: true,
			})?.volume
		: undefined;
	const recoveredAnimations = {
		...sourceElement.animations,
		...(clonedCompanionVolume
			? { volume: clonedCompanionVolume }
			: {}),
	};
	const nextParams = { ...sourceElement.params };
	for (const [key, value] of Object.entries(companion.params)) {
		if (
			key === "volume" ||
			key === "muted" ||
			key.startsWith("audio")
		) {
			nextParams[key] = value;
		}
	}

	return {
		ok: true,
		recoveredElement: {
			...sourceElement,
			isSourceAudioEnabled: true,
			params: nextParams,
			animations:
				Object.keys(recoveredAnimations).length > 0
					? recoveredAnimations
					: undefined,
		},
		removeCompanion: true,
	};
}

export function getSourceAudioActionLabel({
	element,
}: {
	element: VideoElement;
}): "Extract audio" | "Recover audio" {
	return isSourceAudioSeparated({ element })
		? "Recover audio"
		: "Extract audio";
}

function cloneVolumeAnimations({
	animations,
}: {
	animations: ElementAnimations | undefined;
}): ElementAnimations | undefined {
	const volumeData = animations?.volume;
	if (!volumeData) {
		return undefined;
	}

	return cloneAnimations({
		animations: { volume: volumeData },
		shouldRegenerateKeyframeIds: true,
	});
}

function isSeparatedAudioAligned({
	sourceElement,
	companion,
}: {
	sourceElement: VideoElement;
	companion: AudioElement;
}): boolean {
	return (
		companion.startTime === sourceElement.startTime &&
		companion.duration === sourceElement.duration &&
		companion.trimStart === sourceElement.trimStart &&
		companion.trimEnd === sourceElement.trimEnd &&
		companion.sourceDuration === sourceElement.sourceDuration &&
		JSON.stringify(companion.retime ?? null) ===
			JSON.stringify(sourceElement.retime ?? null)
	);
}
