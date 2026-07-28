import type { TimelineTrack, TrackType } from "@/timeline/types";
import { DEFAULT_TRACK_NAMES } from "@/timeline/tracks";
import { canTrackHaveAudio } from "@/timeline/track-capabilities";

export const TRACK_HEIGHT_MIN_PX = 44;
export const TRACK_HEIGHT_MAX_PX = 160;

export const TRACK_DEFAULT_HEIGHTS_PX: Record<TrackType, number> = {
	video: 65,
	text: TRACK_HEIGHT_MIN_PX,
	audio: 50,
	graphic: TRACK_HEIGHT_MIN_PX,
	effect: TRACK_HEIGHT_MIN_PX,
};

const TRACK_COMPATIBILITY_LABELS: Record<TrackType, string> = {
	video: "Video and image clips",
	text: "Text clips",
	audio: "Audio clips",
	graphic: "Stickers and graphics",
	effect: "Effect clips",
};

export type TrackControlPatch = Partial<
	Pick<TimelineTrack, "name" | "locked" | "height" | "solo">
>;

export function getTrackCompatibilityLabel({
	trackType,
}: {
	trackType: TrackType;
}): string {
	return TRACK_COMPATIBILITY_LABELS[trackType];
}

export function normalizeTrackName({
	name,
	trackType,
}: {
	name: string;
	trackType: TrackType;
}): string {
	return name.trim() || DEFAULT_TRACK_NAMES[trackType];
}

export function getTrackDisplayHeight({
	track,
}: {
	track: Pick<TimelineTrack, "type" | "height">;
}): number {
	const requestedHeight = track.height ?? TRACK_DEFAULT_HEIGHTS_PX[track.type];
	return Math.min(
		TRACK_HEIGHT_MAX_PX,
		Math.max(TRACK_HEIGHT_MIN_PX, Math.round(requestedHeight)),
	);
}

export function getNextTrackDisplayHeight({
	track,
}: {
	track: Pick<TimelineTrack, "type" | "height">;
}): number {
	const currentHeight = getTrackDisplayHeight({ track });
	const defaultHeight = TRACK_DEFAULT_HEIGHTS_PX[track.type];
	const tallHeight = Math.min(TRACK_HEIGHT_MAX_PX, defaultHeight + 36);
	if (currentHeight < tallHeight) return tallHeight;
	if (currentHeight < TRACK_HEIGHT_MAX_PX) return TRACK_HEIGHT_MAX_PX;
	return TRACK_HEIGHT_MIN_PX;
}

export function isTrackLocked({
	track,
}: {
	track: Pick<TimelineTrack, "locked">;
}): boolean {
	return track.locked === true;
}

export function isTrackAudible({
	track,
	tracks,
}: {
	track: TimelineTrack;
	tracks: TimelineTrack[];
}): boolean {
	if (!canTrackHaveAudio(track) || track.muted) return false;
	const hasSoloTrack = tracks.some(
		(candidate) => canTrackHaveAudio(candidate) && candidate.solo === true,
	);
	return !hasSoloTrack || track.solo === true;
}

export function applyTrackControlPatch<TTrack extends TimelineTrack>({
	track,
	patch,
}: {
	track: TTrack;
	patch: TrackControlPatch;
}): TTrack {
	const nextPatch: TrackControlPatch = { ...patch };
	if (patch.name !== undefined) {
		nextPatch.name = normalizeTrackName({
			name: patch.name,
			trackType: track.type,
		});
	}
	if (patch.height !== undefined) {
		nextPatch.height = getTrackDisplayHeight({
			track: { ...track, height: patch.height },
		});
	}
	if (!canTrackHaveAudio(track)) {
		delete nextPatch.solo;
	}
	return { ...track, ...nextPatch };
}
