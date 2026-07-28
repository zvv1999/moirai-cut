import type { CaptionStyle } from "@/subtitles/styles";
import type { EditableCaptionCue } from "@/subtitles/caption-model";
import type { SubtitleCue } from "@/subtitles/types";
import type { SceneTracks } from "@/timeline";
import { canTrackHaveAudio } from "@/timeline";

export function getCaptionExportCues({
	cues,
	styles,
}: {
	cues: EditableCaptionCue[];
	styles: CaptionStyle[];
}): SubtitleCue[] {
	return cues.map((cue) => ({
		text: cue.primaryText,
		secondaryText: cue.secondaryText || undefined,
		speaker: cue.speaker || undefined,
		wordTimings: cue.wordTimings,
		startTime: cue.startTime,
		duration: cue.duration,
		styleId: cue.styleId ?? undefined,
		styleDetached: cue.styleDetached,
		style:
			cue.style ??
			styles.find((candidate) => candidate.id === cue.styleId)?.style,
	}));
}

export function listAudioStemTracks({
	tracks,
}: {
	tracks: SceneTracks;
}): Array<{ id: string; name: string }> {
	return [...tracks.overlay, tracks.main, ...tracks.audio]
		.filter((track) => canTrackHaveAudio(track) && track.elements.length > 0)
		.map((track) => ({ id: track.id, name: track.name }));
}

export function isolateAudioStemTracks({
	tracks,
	targetTrackId,
}: {
	tracks: SceneTracks;
	targetTrackId: string;
}): SceneTracks {
	return {
		overlay: tracks.overlay.map((track) =>
			track.type === "video"
				? { ...track, muted: track.id !== targetTrackId }
				: track,
		),
		main: {
			...tracks.main,
			muted: tracks.main.id !== targetTrackId,
		},
		audio: tracks.audio.map((track) => ({
			...track,
			muted: track.id !== targetTrackId,
		})),
	};
}
