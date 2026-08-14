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
			title: "无法放置素材",
			detail: "松开后取消本次移动",
		};
	}

	const title = `移动 ${elementCount} 个素材 · ${formatMediaTime(anchorTime)}`;
	if (result.createTracks.length > 0) {
		const count = result.createTracks.length;
		return {
			kind: "move",
			tone: "warning",
			title,
			detail: `将新建 ${count} 条兼容轨道以避免重叠`,
		};
	}

	const tracksById = new Map(
		orderedTracks(tracks).map((track) => [track.id, track]),
	);
	const targetNames = [
		...new Set(
			result.moves.map(
				(move) => tracksById.get(move.targetTrackId)?.name ?? "未知轨道",
			),
		),
	];
	const targetLabel =
		targetNames.length === 1
			? targetNames[0]
			: `${targetNames.length} 条目标轨道`;
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
			title: "无法修剪所选素材",
			detail: "松开后保留当前时间",
		};
	}

	const modeLabel: Record<PrecisionTrimMode, string> = {
		standard: "普通修剪",
		ripple: "联动修剪",
		roll: "滚动编辑",
		slip: "滑移编辑",
		slide: "滑动编辑",
	};
	const title = `${modeLabel[mode]}${side === "left" ? "左" : "右"}边缘 · ${formatSignedMediaTime(result.deltaTime)}`;
	const details: string[] = [];
	const constrained =
		result.deltaTime !== requestedDeltaTime && snapPoint === null;
	if (constrained) details.push("受素材范围或相邻素材限制");
	if (snapPoint) details.push(describeSnapPoint(snapPoint));
	if (mode === "ripple" && rippleShiftedElementCount > 0) {
		details.push(`联动移动后续 ${rippleShiftedElementCount} 个素材`);
	}
	if (details.length === 0) {
		details.push(`已预览 ${result.updates.length} 个素材`);
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
			return "吸附到素材起点";
		case "element-end":
			return "吸附到素材终点";
		case "playhead":
			return "吸附到播放头";
		case "bookmark":
			return "吸附到标记点";
		case "keyframe":
			return "吸附到关键帧";
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
