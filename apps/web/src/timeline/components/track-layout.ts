import type { TimelineTrack, TrackType } from "@/timeline";
import { getTrackDisplayHeight } from "@/timeline";
import {
	KEYFRAME_LANE_HEIGHT_PX,
	TIMELINE_TRACK_GAP_PX,
} from "./layout";

export function getTrackHeight({
	track,
}: {
	track: Pick<TimelineTrack, "type" | "height">;
}): number {
	return getTrackDisplayHeight({ track });
}

export function getExpandedTrackHeight({
	type,
	height,
	expandedLaneCount,
}: {
	type: TrackType;
	height?: number;
	expandedLaneCount: number;
}): number {
	return (
		getTrackDisplayHeight({ track: { type, height } }) +
		expandedLaneCount * KEYFRAME_LANE_HEIGHT_PX
	);
}

export function getCumulativeHeightBefore({
	tracks,
	trackIndex,
	getExtraHeight,
}: {
	tracks: Array<Pick<TimelineTrack, "type" | "height">>;
	trackIndex: number;
	getExtraHeight?: (trackIndex: number) => number;
}): number {
	return tracks
		.slice(0, trackIndex)
		.reduce(
			(sum, track, i) =>
				sum +
				getTrackHeight({ track }) +
				(getExtraHeight?.(i) ?? 0) +
				TIMELINE_TRACK_GAP_PX,
			0,
		);
}

export function getTotalTracksHeight({
	tracks,
	getExtraHeight,
}: {
	tracks: Array<Pick<TimelineTrack, "type" | "height">>;
	getExtraHeight?: (trackIndex: number) => number;
}): number {
	const tracksHeight = tracks.reduce(
		(sum, track, i) =>
			sum + getTrackHeight({ track }) + (getExtraHeight?.(i) ?? 0),
		0,
	);
	const gapsHeight = Math.max(0, tracks.length - 1) * TIMELINE_TRACK_GAP_PX;
	return tracksHeight + gapsHeight;
}
