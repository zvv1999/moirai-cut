import { describe, expect, test } from "bun:test";
import { previewZoomScale } from "./preview-renderer";

describe("previewZoomScale", () => {
	const motion = { startScale: 1, endScale: 1.2, durationSeconds: 10 };

	test("uses the selected source range as the motion time origin", () => {
		expect(previewZoomScale(motion, 30, 30)).toBe(1);
		expect(previewZoomScale(motion, 35, 30)).toBeCloseTo(1.1);
		expect(previewZoomScale(motion, 40, 30)).toBe(1.2);
	});

	test("clamps playback outside the selected range", () => {
		expect(previewZoomScale(motion, 20, 30)).toBe(1);
		expect(previewZoomScale(motion, 50, 30)).toBe(1.2);
		expect(previewZoomScale(undefined, 50, 30)).toBe(1);
	});
});
