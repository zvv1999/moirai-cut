import {
	applyRippleAdjustments,
	computeRippleAdjustments,
} from "@/ripple";
import type {
	GroupMoveResult,
	GroupResizeResult,
	GroupResizeUpdate,
} from "@/timeline";
import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline/types";
import type { PrecisionTrimMode } from "@/timeline/precision-trim";
import type { ResizeSide } from "@/timeline/group-resize";
import type { SnapPoint } from "@/timeline/snapping";
import {
	type MediaTime,
	mediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";

export type DirectManipulationTone = "positive" | "warning" | "negative";

export interface DirectManipulationFeedback {
	kind: "move" | "trim";
	tone: DirectManipulationTone;
	title: string;
	detail: string;
}

export interface ResizePreviewUpdate {
	trackId: string;
	elementId: string;
	patch: Partial<TimelineElement>;
}

export interface RippleResizePreview {
	updates: ResizePreviewUpdate[];
	shiftedElementCount: number;
	totalShift: MediaTime;
}

export function buildMoveFeedback({
	anchorTime,
	elementCount,
	result,
	tracks,
	snapPoint,
}: {
	anchorTime: MediaTime;
	elementCount: number;
	result: GroupMoveResult | null;
	tracks: SceneTracks;
	snapPoint: SnapPoint | null;
}): DirectManipulationFeedback {
	if (!result) {
		return {
			kind: "move",
			tone: "negative",
			title: `Cannot place ${elementCount === 1 ? "clip" : "clips"}`,
			detail: "Release cancels this move",
		};
	}

	const title = `Move ${elementCount} ${elementCount === 1 ? "clip" : "clips"} · ${formatMediaTime(anchorTime)}`;
	if (result.createTracks.length > 0) {
		const count = result.createTracks.length;
		return {
			kind: "move",
			tone: "warning",
			title,
			detail: `Creates ${count} compatible ${count === 1 ? "track" : "tracks"} to avoid an overlap`,
		};
	}

	const tracksById = new Map(
		orderedTracks(tracks).map((track) => [track.id, track]),
	);
	const targetNames = [
		...new Set(
			result.moves.map(
				(move) => tracksById.get(move.targetTrackId)?.name ?? "Unknown track",
			),
		),
	];
	const targetLabel =
		targetNames.length === 1
			? targetNames[0]
			: `${targetNames.length} destination tracks`;
	const snapLabel = snapPoint ? ` · ${describeSnapPoint(snapPoint)}` : "";
	return {
		kind: "move",
		tone: "positive",
		title,
		detail: `${targetLabel}${snapLabel}`,
	};
}

export function buildResizeFeedback({
	mode,
	side,
	requestedDeltaTime,
	result,
	snapPoint,
	rippleShiftedElementCount,
}: {
	mode: PrecisionTrimMode;
	side: ResizeSide;
	requestedDeltaTime: MediaTime;
	result: GroupResizeResult | null;
	snapPoint: SnapPoint | null;
	rippleShiftedElementCount: number;
}): DirectManipulationFeedback {
	if (!result) {
		return {
			kind: "trim",
			tone: "negative",
			title: "Cannot trim selection",
			detail: "Release keeps the current timing",
		};
	}

	const modeLabel = `${mode[0].toUpperCase()}${mode.slice(1)}`;
	const title = `${modeLabel} ${side} edge · ${formatSignedMediaTime(result.deltaTime)}`;
	const details: string[] = [];
	const constrained =
		result.deltaTime !== requestedDeltaTime && snapPoint === null;
	if (constrained) details.push("Limited by source or neighbour");
	if (snapPoint) details.push(describeSnapPoint(snapPoint));
	if (mode === "ripple" && rippleShiftedElementCount > 0) {
		details.push(
			`Ripple shifts ${rippleShiftedElementCount} following ${
				rippleShiftedElementCount === 1 ? "clip" : "clips"
			}`,
		);
	}
	if (details.length === 0) {
		details.push(`${result.updates.length} clip previewed`);
	}

	return {
		kind: "trim",
		tone: constrained || rippleShiftedElementCount > 0 ? "warning" : "positive",
		title,
		detail: details.join(" · "),
	};
}

/**
 * Mirrors the command manager's ripple pass against preview-only resize data.
 *
 * The editor commits only the selected-edge updates; CommandManager applies the
 * downstream ripple shift after execute. During pointer movement there is no
 * command yet, so this helper computes the same shift and emits extra preview
 * patches for the affected clips.
 */
export function buildRippleResizePreview({
	tracks,
	updates,
}: {
	tracks: SceneTracks;
	updates: GroupResizeUpdate[];
}): RippleResizePreview {
	const afterResize = applyUpdatesToTracks({ tracks, updates });
	const adjustments = computeRippleAdjustments({
		beforeTracks: tracks,
		afterTracks: afterResize,
	});
	const afterRipple = applyRippleAdjustments({
		tracks: afterResize,
		adjustments,
	});
	const updateIds = new Set(updates.map((update) => update.elementId));
	const originalById = new Map(
		orderedTracks(tracks).flatMap((track) =>
			track.elements.map((element) => [element.id, element] as const),
		),
	);
	const rippleUpdates: ResizePreviewUpdate[] = [];
	for (const track of orderedTracks(afterRipple)) {
		for (const element of track.elements) {
			if (updateIds.has(element.id)) continue;
			const original = originalById.get(element.id);
			if (!original || original.startTime === element.startTime) continue;
			rippleUpdates.push({
				trackId: track.id,
				elementId: element.id,
				patch: { startTime: element.startTime },
			});
		}
	}
	const totalShift = adjustments.reduce(
		(maximum, adjustment) =>
			adjustment.shiftAmount > maximum
				? mediaTime({ ticks: adjustment.shiftAmount })
				: maximum,
		ZERO_MEDIA_TIME,
	);
	return {
		updates: [...updates, ...rippleUpdates],
		shiftedElementCount: rippleUpdates.length,
		totalShift,
	};
}

function applyUpdatesToTracks({
	tracks,
	updates,
}: {
	tracks: SceneTracks;
	updates: GroupResizeUpdate[];
}): SceneTracks {
	const updatesById = new Map(
		updates.map((update) => [update.elementId, update.patch]),
	);
	const applyToTrack = <TTrack extends TimelineTrack>(track: TTrack): TTrack => ({
		...track,
		elements: track.elements.map((element) => {
			const patch = updatesById.get(element.id);
			return patch ? ({ ...element, ...patch } as TimelineElement) : element;
		}),
	});
	return {
		overlay: tracks.overlay.map(applyToTrack),
		main: applyToTrack(tracks.main),
		audio: tracks.audio.map(applyToTrack),
	};
}

function orderedTracks(tracks: SceneTracks): TimelineTrack[] {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function describeSnapPoint(snapPoint: SnapPoint): string {
	switch (snapPoint.type) {
		case "element-start":
			return "Snapped to clip start";
		case "element-end":
			return "Snapped to clip end";
		case "playhead":
			return "Snapped to playhead";
		case "bookmark":
			return "Snapped to marker";
		case "keyframe":
			return "Snapped to keyframe";
	}
}

function formatSignedMediaTime(time: MediaTime): string {
	if (time === 0) return "±00:00.00";
	return `${time < 0 ? "−" : "+"}${formatMediaTime(
		mediaTime({ ticks: Math.abs(time) }),
	)}`;
}

function formatMediaTime(time: MediaTime): string {
	const totalSeconds = Math.max(0, time / TICKS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.floor(totalSeconds % 60);
	const hundredths = Math.floor((totalSeconds % 1) * 100 + 1e-6);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}
