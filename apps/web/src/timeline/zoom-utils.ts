import {
	BASE_TIMELINE_PIXELS_PER_SECOND,
	TIMELINE_ZOOM_MAX,
} from "@/timeline/scale";
import { TICKS_PER_SECOND } from "@/wasm";

const FIT_CONTENT_RATIO = 0.9;
const PADDING_MAX_RATIO = 1 - FIT_CONTENT_RATIO;
const PADDING_MIN_RATIO = 0.03;
const PADDING_MIN_AT_ZOOM_PERCENT = 0.2;

export function getTimelineZoomMin({
	duration,
	containerWidth,
}: {
	duration: number;
	containerWidth: number | null | undefined;
}): number {
	const safeDurationSeconds = Math.max(duration / TICKS_PER_SECOND, 1);
	const safeContainerWidth = containerWidth ?? 1000;
	const availableWidth = safeContainerWidth * FIT_CONTENT_RATIO;
	const zoomToFit =
		availableWidth / (safeDurationSeconds * BASE_TIMELINE_PIXELS_PER_SECOND);

	return Math.min(TIMELINE_ZOOM_MAX, zoomToFit);
}

export function getTimelinePaddingPx({
	containerWidth,
	zoomLevel,
	minZoom,
}: {
	containerWidth: number;
	zoomLevel: number;
	minZoom: number;
}): number {
	const zoomPercent = getZoomPercent({ zoomLevel, minZoom });
	const paddingTransitionPercent = Math.min(
		zoomPercent / PADDING_MIN_AT_ZOOM_PERCENT,
		1,
	);
	const paddingRatio =
		PADDING_MAX_RATIO -
		(PADDING_MAX_RATIO - PADDING_MIN_RATIO) * paddingTransitionPercent;

	return containerWidth * paddingRatio;
}

export function getZoomPercent({
	zoomLevel,
	minZoom,
}: {
	zoomLevel: number;
	minZoom: number;
}): number {
	if (minZoom >= TIMELINE_ZOOM_MAX) {
		return 0;
	}
	return (zoomLevel - minZoom) / (TIMELINE_ZOOM_MAX - minZoom);
}

/**
 * convert linear slider position (0-1) to exponential zoom level.
 * at low slider values, zoom changes are small. at high values, changes are large.
 */
export function sliderToZoom({
	sliderPosition,
	minZoom,
	maxZoom = TIMELINE_ZOOM_MAX,
}: {
	sliderPosition: number;
	minZoom: number;
	maxZoom?: number;
}): number {
	const clampedPosition = Math.max(0, Math.min(1, sliderPosition));
	if (minZoom >= maxZoom) {
		return maxZoom;
	}
	return minZoom * (maxZoom / minZoom) ** clampedPosition;
}

/**
 * convert exponential zoom level to linear slider position (0-1).
 */
export function zoomToSlider({
	zoomLevel,
	minZoom,
	maxZoom = TIMELINE_ZOOM_MAX,
}: {
	zoomLevel: number;
	minZoom: number;
	maxZoom?: number;
}): number {
	if (minZoom >= maxZoom) {
		return 0;
	}
	const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel));
	return Math.log(clampedZoom / minZoom) / Math.log(maxZoom / minZoom);
}
