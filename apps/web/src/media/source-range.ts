import type { MediaAsset, MediaType } from "@/media/types";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type {
	CreateTimelineElement,
	ElementRef,
	SceneTracks,
	TimelineTrack,
} from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";

export interface SourceRange {
	inPoint: number;
	outPoint: number;
}

export interface SourceOverwriteTarget {
	trackId: string | null;
	reason: string | null;
}

const MIN_SOURCE_RANGE_SECONDS = 1 / 120;

export function getSourceDurationSeconds({
	asset,
}: {
	asset: MediaAsset;
}): number {
	if (asset.duration !== undefined && asset.duration > 0) {
		return asset.duration;
	}
	return mediaTimeToSeconds({ time: DEFAULT_NEW_ELEMENT_DURATION });
}

export function getDefaultSourceRange({
	asset,
}: {
	asset: MediaAsset;
}): SourceRange {
	return {
		inPoint: 0,
		outPoint: getSourceDurationSeconds({ asset }),
	};
}

export function updateSourceRangePoint({
	range,
	point,
	time,
	duration,
}: {
	range: SourceRange;
	point: "in" | "out";
	time: number;
	duration: number;
}): SourceRange {
	const safeDuration = Math.max(MIN_SOURCE_RANGE_SECONDS, duration);
	const safeTime = clamp({ value: time, min: 0, max: safeDuration });

	if (point === "in") {
		const inPoint = Math.min(
			safeTime,
			Math.max(0, safeDuration - MIN_SOURCE_RANGE_SECONDS),
		);
		return {
			inPoint,
			outPoint: Math.max(
				inPoint + MIN_SOURCE_RANGE_SECONDS,
				clamp({ value: range.outPoint, min: 0, max: safeDuration }),
			),
		};
	}

	const outPoint = Math.max(
		MIN_SOURCE_RANGE_SECONDS,
		clamp({ value: safeTime, min: 0, max: safeDuration }),
	);
	return {
		inPoint: Math.min(
			clamp({ value: range.inPoint, min: 0, max: safeDuration }),
			outPoint - MIN_SOURCE_RANGE_SECONDS,
		),
		outPoint,
	};
}

export function buildElementFromSourceRange({
	asset,
	range,
	startTime,
}: {
	asset: MediaAsset;
	range: SourceRange;
	startTime: MediaTime;
}): CreateTimelineElement {
	const sourceDurationSeconds = getSourceDurationSeconds({ asset });
	const normalizedRange =
		asset.type === "image"
			? { inPoint: 0, outPoint: sourceDurationSeconds }
			: normalizeSourceRange({
					range,
					duration: sourceDurationSeconds,
				});
	const sourceDuration = mediaTimeFromSeconds({
		seconds: sourceDurationSeconds,
	});
	const trimStart = mediaTimeFromSeconds({
		seconds: normalizedRange.inPoint,
	});
	const trimEnd = mediaTimeFromSeconds({
		seconds: sourceDurationSeconds - normalizedRange.outPoint,
	});
	const duration = mediaTimeFromSeconds({
		seconds: normalizedRange.outPoint - normalizedRange.inPoint,
	});
	const element = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: asset.type,
		name: asset.name,
		duration: sourceDuration,
		startTime,
	});

	return {
		...element,
		duration,
		trimStart,
		trimEnd,
		...(asset.type !== "image" ? { sourceDuration } : {}),
	};
}

export function resolveSourceOverwriteTarget({
	tracks,
	selectedElements,
	mediaType,
}: {
	tracks: SceneTracks;
	selectedElements: ElementRef[];
	mediaType: MediaType;
}): SourceOverwriteTarget {
	const desiredTrackType = mediaType === "audio" ? "audio" : "video";
	for (const selection of selectedElements) {
		const track = getTrackById({ tracks, trackId: selection.trackId });
		if (track?.type === desiredTrackType && !track.locked) {
			return { trackId: track.id, reason: null };
		}
	}

	const candidates =
		desiredTrackType === "audio"
			? tracks.audio
			: [tracks.main, ...tracks.overlay.filter((track) => track.type === "video")];
	const target = candidates.find((track) => !track.locked);
	if (target) return { trackId: target.id, reason: null };

	return {
		trackId: null,
		reason: `Unlock a ${desiredTrackType} track before overwriting`,
	};
}

function normalizeSourceRange({
	range,
	duration,
}: {
	range: SourceRange;
	duration: number;
}): SourceRange {
	const inPoint = clamp({ value: range.inPoint, min: 0, max: duration });
	return updateSourceRangePoint({
		range: {
			inPoint,
			outPoint: clamp({ value: range.outPoint, min: 0, max: duration }),
		},
		point: "out",
		time: range.outPoint,
		duration,
	});
}

function getTrackById({
	tracks,
	trackId,
}: {
	tracks: SceneTracks;
	trackId: string;
}): TimelineTrack | null {
	if (tracks.main.id === trackId) return tracks.main;
	return (
		tracks.overlay.find((track) => track.id === trackId) ??
		tracks.audio.find((track) => track.id === trackId) ??
		null
	);
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}
