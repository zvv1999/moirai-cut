function clampScrollLeft({
	scrollLeft,
	scrollWidth,
	viewportWidth,
}: {
	scrollLeft: number;
	scrollWidth: number;
	viewportWidth: number;
}): number {
	const maxScrollLeft = Math.max(0, scrollWidth - viewportWidth);
	return Math.max(0, Math.min(maxScrollLeft, scrollLeft));
}

export function getMouseAnchoredScrollLeft({
	scrollLeft,
	pointerOffset,
	previousZoom,
	nextZoom,
	scrollWidth,
	viewportWidth,
}: {
	scrollLeft: number;
	pointerOffset: number;
	previousZoom: number;
	nextZoom: number;
	scrollWidth: number;
	viewportWidth: number;
}): number {
	if (
		!Number.isFinite(previousZoom) ||
		!Number.isFinite(nextZoom) ||
		previousZoom <= 0 ||
		nextZoom <= 0
	) {
		return clampScrollLeft({ scrollLeft, scrollWidth, viewportWidth });
	}

	const safePointerOffset = Math.max(
		0,
		Math.min(viewportWidth, pointerOffset),
	);
	const contentPixelUnderPointer = scrollLeft + safePointerOffset;
	const anchoredScrollLeft =
		contentPixelUnderPointer * (nextZoom / previousZoom) - safePointerOffset;

	return clampScrollLeft({
		scrollLeft: anchoredScrollLeft,
		scrollWidth,
		viewportWidth,
	});
}

export function getRevealPlayheadScrollLeft({
	playheadPixels,
	scrollWidth,
	viewportWidth,
}: {
	playheadPixels: number;
	scrollWidth: number;
	viewportWidth: number;
}): number {
	return clampScrollLeft({
		scrollLeft: playheadPixels - viewportWidth / 2,
		scrollWidth,
		viewportWidth,
	});
}

export function getOverviewViewport({
	scrollLeft,
	scrollWidth,
	viewportWidth,
}: {
	scrollLeft: number;
	scrollWidth: number;
	viewportWidth: number;
}): { leftPercent: number; widthPercent: number } {
	const safeScrollWidth = Math.max(1, scrollWidth);
	const clampedScrollLeft = clampScrollLeft({
		scrollLeft,
		scrollWidth: safeScrollWidth,
		viewportWidth,
	});

	return {
		leftPercent: (clampedScrollLeft / safeScrollWidth) * 100,
		widthPercent: Math.min(100, (viewportWidth / safeScrollWidth) * 100),
	};
}

export function getOverviewNavigationTarget({
	pointerOffset,
	overviewWidth,
	scrollWidth,
	viewportWidth,
}: {
	pointerOffset: number;
	overviewWidth: number;
	scrollWidth: number;
	viewportWidth: number;
}): number {
	if (overviewWidth <= 0 || scrollWidth <= viewportWidth) {
		return 0;
	}

	const pointerRatio = Math.max(0, Math.min(1, pointerOffset / overviewWidth));
	return clampScrollLeft({
		scrollLeft: pointerRatio * scrollWidth - viewportWidth / 2,
		scrollWidth,
		viewportWidth,
	});
}
