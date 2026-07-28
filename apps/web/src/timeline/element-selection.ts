import type { ElementRef } from "@/timeline/types";

export type TimelineSelectionIntent = "replace" | "toggle" | "range";

interface SelectionElement {
	id: string;
	startTime: number;
	duration: number;
}

interface SelectionTrack {
	id: string;
	elements: SelectionElement[];
}

function isSameElementRef({
	left,
	right,
}: {
	left: ElementRef;
	right: ElementRef;
}): boolean {
	return left.trackId === right.trackId && left.elementId === right.elementId;
}

function getTimelineSelectionOrder({
	tracks,
}: {
	tracks: SelectionTrack[];
}): ElementRef[] {
	return tracks
		.flatMap((track, trackIndex) =>
			track.elements.map((element, elementIndex) => ({
				ref: { trackId: track.id, elementId: element.id },
				startTime: element.startTime,
				endTime: element.startTime + element.duration,
				trackIndex,
				elementIndex,
			})),
		)
		.sort(
			(left, right) =>
				left.startTime - right.startTime ||
				left.endTime - right.endTime ||
				left.trackIndex - right.trackIndex ||
				left.elementIndex - right.elementIndex,
		)
		.map(({ ref }) => ref);
}

export function getTimelineRangeSelection({
	tracks,
	anchor,
	target,
}: {
	tracks: SelectionTrack[];
	anchor: ElementRef;
	target: ElementRef;
}): ElementRef[] {
	const ordered = getTimelineSelectionOrder({ tracks });
	const anchorIndex = ordered.findIndex((ref) =>
		isSameElementRef({ left: ref, right: anchor }),
	);
	const targetIndex = ordered.findIndex((ref) =>
		isSameElementRef({ left: ref, right: target }),
	);
	if (anchorIndex < 0 || targetIndex < 0) {
		return [target];
	}

	const rangeStart = Math.min(anchorIndex, targetIndex);
	const rangeEnd = Math.max(anchorIndex, targetIndex);
	return ordered.slice(rangeStart, rangeEnd + 1);
}

export function applyTimelineElementClickSelection({
	tracks,
	selected,
	anchor,
	target,
	intent,
}: {
	tracks: SelectionTrack[];
	selected: ElementRef[];
	anchor: ElementRef | null;
	target: ElementRef;
	intent: TimelineSelectionIntent;
}): { elements: ElementRef[]; anchor: ElementRef | null } {
	if (intent === "replace") {
		return { elements: [target], anchor: target };
	}

	if (intent === "range") {
		const range = anchor
			? getTimelineRangeSelection({ tracks, anchor, target })
			: [target];
		const nextAnchor =
			anchor &&
			range.some((ref) => isSameElementRef({ left: ref, right: anchor }))
				? anchor
				: target;
		return { elements: range, anchor: nextAnchor };
	}

	const targetIndex = selected.findIndex((ref) =>
		isSameElementRef({ left: ref, right: target }),
	);
	const elements =
		targetIndex >= 0
			? selected.filter((_, index) => index !== targetIndex)
			: [...selected, target];
	const nextAnchor =
		elements.length === 0
			? null
			: targetIndex >= 0
				? anchor && !isSameElementRef({ left: anchor, right: target })
					? anchor
					: (elements.at(-1) ?? null)
				: target;

	return { elements, anchor: nextAnchor };
}
