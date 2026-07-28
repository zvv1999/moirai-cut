export interface TimelineRenderElement {
	id: string;
	startTime: number;
	duration: number;
}

export function selectTimelineRenderElements<
	Element extends TimelineRenderElement,
>({
	elements,
	viewportStart,
	viewportEnd,
	overscan,
	pinnedIds = new Set(),
}: {
	elements: Element[];
	viewportStart: number;
	viewportEnd: number;
	overscan: number;
	pinnedIds?: ReadonlySet<string>;
}): { elements: Element[]; omittedCount: number } {
	const start = Math.max(0, viewportStart - Math.max(0, overscan));
	const end = Math.max(start, viewportEnd + Math.max(0, overscan));
	const visible = elements.filter(
		(element) =>
			pinnedIds.has(element.id) ||
			(element.startTime + element.duration >= start &&
				element.startTime <= end),
	);
	return {
		elements: visible,
		omittedCount: Math.max(0, elements.length - visible.length),
	};
}

export interface PerformanceBudget {
	id:
		| "media-dom"
		| "timeline-dom"
		| "waveform-cache"
		| "thumbnail-cache"
		| "interaction-latency";
	label: string;
	value: number;
	target: number;
	unit: "items" | "ratio" | "ms";
	status: "pass" | "warn";
}

const cacheRatio = ({ hits, misses }: { hits: number; misses: number }) => {
	const total = hits + misses;
	return total === 0 ? 1 : hits / total;
};

export function buildLargeProjectPerformanceReport({
	mediaItems,
	mountedMediaItems,
	timelineElements,
	mountedTimelineElements,
	waveformCache,
	thumbnailCache,
	lastInteractionMs,
}: {
	mediaItems: number;
	mountedMediaItems: number;
	timelineElements: number;
	mountedTimelineElements: number;
	waveformCache: { hits: number; misses: number };
	thumbnailCache: { hits: number; misses: number };
	lastInteractionMs: number;
}): { status: "pass" | "warn"; budgets: PerformanceBudget[] } {
	const mediaTarget = mediaItems > 200 ? 80 : Math.max(1, mediaItems);
	const timelineTarget =
		timelineElements > 500 ? 200 : Math.max(1, timelineElements);
	const waveformRatio = cacheRatio(waveformCache);
	const thumbnailRatio = cacheRatio(thumbnailCache);
	const budgets: PerformanceBudget[] = [
		{
			id: "media-dom",
			label: "Mounted media cards",
			value: mountedMediaItems,
			target: mediaTarget,
			unit: "items",
			status: mountedMediaItems <= mediaTarget ? "pass" : "warn",
		},
		{
			id: "timeline-dom",
			label: "Mounted timeline clips",
			value: mountedTimelineElements,
			target: timelineTarget,
			unit: "items",
			status: mountedTimelineElements <= timelineTarget ? "pass" : "warn",
		},
		{
			id: "waveform-cache",
			label: "Waveform cache reuse",
			value: waveformRatio,
			target: 0.8,
			unit: "ratio",
			status: waveformRatio >= 0.8 ? "pass" : "warn",
		},
		{
			id: "thumbnail-cache",
			label: "Thumbnail cache reuse",
			value: thumbnailRatio,
			target: 0.8,
			unit: "ratio",
			status: thumbnailRatio >= 0.8 ? "pass" : "warn",
		},
		{
			id: "interaction-latency",
			label: "Last UI interaction",
			value: lastInteractionMs,
			target: 16.7,
			unit: "ms",
			status: lastInteractionMs <= 16.7 ? "pass" : "warn",
		},
	];
	return {
		status: budgets.every((budget) => budget.status === "pass")
			? "pass"
			: "warn",
		budgets,
	};
}
