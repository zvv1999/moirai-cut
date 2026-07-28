import { describe, expect, test } from "bun:test";
import {
	getMouseAnchoredScrollLeft,
	getOverviewNavigationTarget,
	getOverviewViewport,
	getRevealPlayheadScrollLeft,
} from "@/timeline/navigation";

describe("timeline navigation", () => {
	test("keeps the time below the mouse stationary while zooming", () => {
		expect(
			getMouseAnchoredScrollLeft({
				scrollLeft: 300,
				pointerOffset: 200,
				previousZoom: 1,
				nextZoom: 2,
				scrollWidth: 5_000,
				viewportWidth: 600,
			}),
		).toBe(800);
	});

	test("clamps mouse-anchored zoom at both content edges", () => {
		expect(
			getMouseAnchoredScrollLeft({
				scrollLeft: 0,
				pointerOffset: 0,
				previousZoom: 2,
				nextZoom: 1,
				scrollWidth: 600,
				viewportWidth: 600,
			}),
		).toBe(0);
		expect(
			getMouseAnchoredScrollLeft({
				scrollLeft: 4_400,
				pointerOffset: 600,
				previousZoom: 1,
				nextZoom: 4,
				scrollWidth: 5_000,
				viewportWidth: 600,
			}),
		).toBe(4_400);
	});

	test("reveals the playhead in the centre and clamps at start and end", () => {
		expect(
			getRevealPlayheadScrollLeft({
				playheadPixels: 2_000,
				scrollWidth: 5_000,
				viewportWidth: 600,
			}),
		).toBe(1_700);
		expect(
			getRevealPlayheadScrollLeft({
				playheadPixels: 100,
				scrollWidth: 5_000,
				viewportWidth: 600,
			}),
		).toBe(0);
		expect(
			getRevealPlayheadScrollLeft({
				playheadPixels: 4_900,
				scrollWidth: 5_000,
				viewportWidth: 600,
			}),
		).toBe(4_400);
	});

	test("maps a long timeline viewport and overview clicks without drift", () => {
		expect(
			getOverviewViewport({
				scrollLeft: 24_000,
				scrollWidth: 50_000,
				viewportWidth: 1_000,
			}),
		).toEqual({ leftPercent: 48, widthPercent: 2 });
		expect(
			getOverviewNavigationTarget({
				pointerOffset: 250,
				overviewWidth: 500,
				scrollWidth: 50_000,
				viewportWidth: 1_000,
			}),
		).toBe(24_500);
	});
});
