import type { FrameRate } from "opencut-wasm";
import type { RetimeConfig, TimelineElement } from "@/timeline/types";
import {
	computeGroupResize,
	type GroupResizeMember,
	type GroupResizeUpdate,
	type ResizeSide,
} from "@/timeline/group-resize";
import {
	getSourceSpanAtClipTime,
	getTimelineDurationForSourceSpan,
} from "@/retime";
import {
	addMediaTime,
	clampMediaTime,
	mediaTime,
	type MediaTime,
	roundFrameTicks,
	roundMediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

export type PrecisionTrimMode =
	| "standard"
	| "ripple"
	| "roll"
	| "slip"
	| "slide";

export type PrecisionTrimClip = Pick<
	TimelineElement,
	"id" | "type" | "startTime" | "duration" | "trimStart" | "trimEnd"
> & {
	sourceDuration?: MediaTime;
	retime?: RetimeConfig;
};

export type PrecisionTrimAvailability =
	| { available: true; reason?: never }
	| { available: false; reason: string };

export interface PrecisionTrimPlan {
	valid: boolean;
	reason?: string;
	appliedDelta: MediaTime;
	updates: GroupResizeUpdate[];
}

export function resolveActiveTrimMode({
	precisionMode,
	rippleEditingEnabled,
}: {
	precisionMode: Exclude<PrecisionTrimMode, "ripple">;
	rippleEditingEnabled: boolean;
}): PrecisionTrimMode {
	return rippleEditingEnabled ? "ripple" : precisionMode;
}

export function getPrecisionTrimModeAvailability({
	mode,
	elementId,
	elements,
}: {
	mode: PrecisionTrimMode;
	elementId: string | null;
	elements: PrecisionTrimClip[];
}): PrecisionTrimAvailability {
	if (mode === "standard" || mode === "ripple") {
		return { available: true };
	}
	const selected = elements.find((element) => element.id === elementId);
	if (!selected) {
		return { available: false, reason: "Select one timeline clip" };
	}

	const { previous, next } = findTouchingNeighbours({
		element: selected,
		elements,
	});
	if (mode === "roll") {
		return previous || next
			? { available: true }
			: { available: false, reason: "Roll needs a touching clip at the cut" };
	}
	if (mode === "slip") {
		const hasSourceHandles =
			(selected.type === "video" || selected.type === "audio") &&
			selected.sourceDuration !== undefined &&
			(selected.trimStart > ZERO_MEDIA_TIME ||
				selected.trimEnd > ZERO_MEDIA_TIME);
		return hasSourceHandles
			? { available: true }
			: {
					available: false,
					reason:
						"Slip is only meaningful for video or audio with source handles",
				};
	}
	return previous && next
		? { available: true }
		: {
				available: false,
				reason: "Slide needs clips touching both sides",
			};
}

export function getPrecisionTrimModeDescription({
	mode,
}: {
	mode: PrecisionTrimMode;
}): string {
	switch (mode) {
		case "standard":
			return "Move one clip edge";
		case "ripple":
			return "Trim and close or open downstream time";
		case "roll":
			return "Move a cut while preserving pair duration";
		case "slip":
			return "Change source in and out without moving the clip";
		case "slide":
			return "Move a clip while rolling both neighbouring cuts";
	}
}

export function buildPrecisionTrimPlan({
	mode,
	side,
	trackId,
	elementId,
	elements,
	deltaTime,
	fps,
}: {
	mode: PrecisionTrimMode;
	side: ResizeSide;
	trackId: string;
	elementId: string;
	elements: PrecisionTrimClip[];
	deltaTime: MediaTime;
	fps: FrameRate;
}): PrecisionTrimPlan {
	const availability = getPrecisionTrimModeAvailability({
		mode,
		elementId,
		elements,
	});
	if (!availability.available) {
		return invalidPlan(availability.reason);
	}
	if (mode === "standard" || mode === "ripple") {
		return invalidPlan("Standard and ripple trim use the edge-resize pipeline");
	}

	const selected = elements.find((element) => element.id === elementId);
	if (!selected) return invalidPlan("Select one timeline clip");
	const frameDelta = mediaTime({
		ticks: roundFrameTicks({ ticks: deltaTime, fps }),
	});
	if (mode === "slip") {
		return buildSlipPlan({
			trackId,
			element: selected,
			deltaTime: frameDelta,
		});
	}

	const { previous, next } = findTouchingNeighbours({
		element: selected,
		elements,
	});
	if (mode === "roll") {
		const left = side === "left";
		const first = left ? previous : selected;
		const second = left ? selected : next;
		if (!first || !second) {
			return invalidPlan(
				`${left ? "Left" : "Right"} roll needs a touching clip`,
			);
		}
		return buildPairedResizePlan({
			trackId,
			first,
			firstSide: "right",
			second,
			secondSide: "left",
			deltaTime: frameDelta,
			fps,
		});
	}

	if (!previous || !next) {
		return invalidPlan("Slide needs clips touching both sides");
	}
	const boundaryPlan = buildPairedResizePlan({
		trackId,
		first: previous,
		firstSide: "right",
		second: next,
		secondSide: "left",
		deltaTime: frameDelta,
		fps,
	});
	if (!boundaryPlan.valid) return boundaryPlan;
	return {
		...boundaryPlan,
		updates: [
			boundaryPlan.updates[0],
			{
				trackId,
				elementId: selected.id,
				patch: {
					startTime: addMediaTime({
						a: selected.startTime,
						b: boundaryPlan.appliedDelta,
					}),
					duration: selected.duration,
					trimStart: selected.trimStart,
					trimEnd: selected.trimEnd,
				},
			},
			boundaryPlan.updates[1],
		],
	};
}

function buildSlipPlan({
	trackId,
	element,
	deltaTime,
}: {
	trackId: string;
	element: PrecisionTrimClip;
	deltaTime: MediaTime;
}): PrecisionTrimPlan {
	const requestedSourceDelta = getSourceDelta({
		element,
		clipDelta: deltaTime,
	});
	const sourceDelta = clampMediaTime({
		time: requestedSourceDelta,
		min: subMediaTime({ a: ZERO_MEDIA_TIME, b: element.trimStart }),
		max: element.trimEnd,
	});
	const appliedDelta = getClipDelta({
		element,
		sourceDelta,
	});
	return {
		valid: true,
		appliedDelta,
		updates: [
			{
				trackId,
				elementId: element.id,
				patch: {
					startTime: element.startTime,
					duration: element.duration,
					trimStart: addMediaTime({
						a: element.trimStart,
						b: sourceDelta,
					}),
					trimEnd: subMediaTime({
						a: element.trimEnd,
						b: sourceDelta,
					}),
				},
			},
		],
	};
}

function buildPairedResizePlan({
	trackId,
	first,
	firstSide,
	second,
	secondSide,
	deltaTime,
	fps,
}: {
	trackId: string;
	first: PrecisionTrimClip;
	firstSide: ResizeSide;
	second: PrecisionTrimClip;
	secondSide: ResizeSide;
	deltaTime: MediaTime;
	fps: FrameRate;
}): PrecisionTrimPlan {
	const firstMember = toResizeMember({ trackId, element: first });
	const secondMember = toResizeMember({ trackId, element: second });
	const firstProbe = computeGroupResize({
		members: [firstMember],
		side: firstSide,
		deltaTime,
		fps,
	});
	const secondProbe = computeGroupResize({
		members: [secondMember],
		side: secondSide,
		deltaTime,
		fps,
	});
	const sharedDelta =
		deltaTime >= ZERO_MEDIA_TIME
			? Math.min(firstProbe.deltaTime, secondProbe.deltaTime)
			: Math.max(firstProbe.deltaTime, secondProbe.deltaTime);
	const appliedDelta = mediaTime({ ticks: sharedDelta });
	const firstResult = computeGroupResize({
		members: [firstMember],
		side: firstSide,
		deltaTime: appliedDelta,
		fps,
	});
	const secondResult = computeGroupResize({
		members: [secondMember],
		side: secondSide,
		deltaTime: appliedDelta,
		fps,
	});
	return {
		valid: true,
		appliedDelta,
		updates: [firstResult.updates[0], secondResult.updates[0]],
	};
}

function toResizeMember({
	trackId,
	element,
}: {
	trackId: string;
	element: PrecisionTrimClip;
}): GroupResizeMember {
	return {
		trackId,
		elementId: element.id,
		startTime: element.startTime,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		sourceDuration: element.sourceDuration,
		retime: element.retime,
		leftNeighborBound: null,
		rightNeighborBound: null,
	};
}

function findTouchingNeighbours({
	element,
	elements,
}: {
	element: PrecisionTrimClip;
	elements: PrecisionTrimClip[];
}): {
	previous: PrecisionTrimClip | null;
	next: PrecisionTrimClip | null;
} {
	const selectedEnd = addMediaTime({
		a: element.startTime,
		b: element.duration,
	});
	const previous =
		elements.find(
			(candidate) =>
				candidate.id !== element.id &&
				addMediaTime({
					a: candidate.startTime,
					b: candidate.duration,
				}) === element.startTime,
		) ?? null;
	const next =
		elements.find(
			(candidate) =>
				candidate.id !== element.id &&
				candidate.startTime === selectedEnd,
		) ?? null;
	return { previous, next };
}

function getSourceDelta({
	element,
	clipDelta,
}: {
	element: PrecisionTrimClip;
	clipDelta: MediaTime;
}): MediaTime {
	if (!element.retime) return clipDelta;
	const sourceDelta =
		clipDelta >= ZERO_MEDIA_TIME
			? getSourceSpanAtClipTime({
					clipTime: clipDelta,
					retime: element.retime,
				})
			: -getSourceSpanAtClipTime({
					clipTime: Math.abs(clipDelta),
					retime: element.retime,
				});
	return roundMediaTime({ time: sourceDelta });
}

function getClipDelta({
	element,
	sourceDelta,
}: {
	element: PrecisionTrimClip;
	sourceDelta: MediaTime;
}): MediaTime {
	if (!element.retime) return sourceDelta;
	const clipDelta =
		sourceDelta >= ZERO_MEDIA_TIME
			? getTimelineDurationForSourceSpan({
					sourceSpan: sourceDelta,
					retime: element.retime,
				})
			: -getTimelineDurationForSourceSpan({
					sourceSpan: Math.abs(sourceDelta),
					retime: element.retime,
				});
	return roundMediaTime({ time: clipDelta });
}

function invalidPlan(reason: string): PrecisionTrimPlan {
	return {
		valid: false,
		reason,
		appliedDelta: ZERO_MEDIA_TIME,
		updates: [],
	};
}
