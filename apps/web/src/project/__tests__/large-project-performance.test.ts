import { describe, expect, test } from "bun:test";
import {
	buildLargeProjectPerformanceReport,
	selectTimelineRenderElements,
} from "@/project/large-project-performance";

describe("large-project performance", () => {
	test("mounts only viewport elements plus overscan and pinned interactions", () => {
		const elements = Array.from({ length: 1_000 }, (_, index) => ({
			id: `clip-${index}`,
			startTime: index * 1_000,
			duration: 800,
		}));

		const result = selectTimelineRenderElements({
			elements,
			viewportStart: 100_000,
			viewportEnd: 110_000,
			overscan: 5_000,
			pinnedIds: new Set(["clip-999"]),
		});

		expect(result.elements.length).toBeLessThan(30);
		expect(result.elements.some((element) => element.id === "clip-999")).toBe(
			true,
		);
		expect(result.omittedCount).toBeGreaterThan(970);
	});

	test("reports repeatable budgets for DOM, cache reuse, and interaction latency", () => {
		const report = buildLargeProjectPerformanceReport({
			mediaItems: 2_000,
			mountedMediaItems: 54,
			timelineElements: 10_000,
			mountedTimelineElements: 82,
			waveformCache: { hits: 90, misses: 10 },
			thumbnailCache: { hits: 180, misses: 20 },
			lastInteractionMs: 12,
		});

		expect(report.status).toBe("pass");
		expect(report.budgets.map((budget) => budget.id)).toEqual([
			"media-dom",
			"timeline-dom",
			"waveform-cache",
			"thumbnail-cache",
			"interaction-latency",
		]);
	});
});
