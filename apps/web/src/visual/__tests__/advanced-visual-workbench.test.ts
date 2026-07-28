import { describe, expect, test } from "bun:test";
import {
	buildTrackingFailureRanges,
	resolveTrackingOffset,
	trackTemplateFrames,
	type TrackingFrame,
} from "@/motion-tracking";
import {
	buildSpeedCurveRetime,
	getRetimeBoundaryStatus,
	getSourceTimeAtClipTime,
	getTimelineDurationForSourceSpan,
} from "@/retime";
import {
	applyBackgroundRemoval,
	applyChromaKey,
	resolveStabilizedPosition,
} from "@/visual/keying";
import {
	applyEffectPreset,
	createEffectPreset,
	duplicateEffectPreset,
	exportEffectPresets,
	importEffectPresets,
} from "@/effects/presets";
import { roundMediaTime } from "@/wasm";

function trackingFrame({
	time,
	left,
	blank = false,
}: {
	time: number;
	left: number;
	blank?: boolean;
}): TrackingFrame {
	const width = 12;
	const height = 8;
	const luma = new Uint8Array(width * height);
	if (!blank) {
		for (let y = 2; y < 5; y++) {
			for (let x = left; x < left + 3; x++) {
				luma[y * width + x] = 240;
			}
		}
	}
	return { time, width, height, luma };
}

describe("motion tracking", () => {
	test("tracks a moving region and exposes low-confidence failure ranges", () => {
		const samples = trackTemplateFrames({
			frames: [
				trackingFrame({ time: 0, left: 2 }),
				trackingFrame({ time: 1, left: 3 }),
				trackingFrame({ time: 2, left: 4 }),
				trackingFrame({ time: 3, left: 4, blank: true }),
			],
			region: { x: 2 / 12, y: 2 / 8, width: 3 / 12, height: 3 / 8 },
			searchRadius: 3,
		});

		expect(samples.slice(0, 3).map((sample) => sample.x)).toEqual([
			3.5 / 12,
			4.5 / 12,
			5.5 / 12,
		]);
		expect(samples[1]?.confidence).toBeGreaterThan(0.95);
		expect(samples[3]?.confidence).toBeLessThan(0.5);
		expect(
			buildTrackingFailureRanges({ samples, confidenceThreshold: 0.5 }),
		).toEqual([{ start: 3, end: 3, minimumConfidence: 0 }]);
	});

	test("interpolates a tracked offset for transform or mask bindings", () => {
		expect(
			resolveTrackingOffset({
				samples: [
					{ time: 0, x: 0.25, y: 0.4, confidence: 1 },
					{ time: 2, x: 0.45, y: 0.5, confidence: 0.8 },
				],
				time: 1,
				confidenceThreshold: 0.5,
			}),
		).toEqual({ x: 0.1, y: 0.05, confidence: 0.9 });
	});

	test("keeps separated low-confidence samples as separate failure ranges", () => {
		expect(
			buildTrackingFailureRanges({
				samples: [
					{ time: 1, x: 0, y: 0, confidence: 0.2 },
					{ time: 2, x: 0, y: 0, confidence: 0.9 },
					{ time: 3, x: 0, y: 0, confidence: 0.3 },
				],
				confidenceThreshold: 0.5,
			}),
		).toEqual([
			{ start: 1, end: 1, minimumConfidence: 0.2 },
			{ start: 3, end: 3, minimumConfidence: 0.3 },
		]);
	});
});

describe("advanced retime", () => {
	test("integrates a speed curve and reports source-boundary pressure", () => {
		const retime = buildSpeedCurveRetime({
			points: [
				{ time: 0, rate: 1 },
				{ time: 120_000, rate: 2 },
			],
		});
		expect(getSourceTimeAtClipTime({ clipTime: 120_000, retime })).toBe(
			180_000,
		);
		expect(
			getTimelineDurationForSourceSpan({
				sourceSpan: 180_000,
				retime,
			}),
		).toBeCloseTo(120_000, 4);
		expect(
			getRetimeBoundaryStatus({
				duration: 240_000,
				sourceSpan: 300_000,
				retime,
			}),
		).toEqual({
			usedSourceSpan: 420_000,
			availableSourceSpan: 300_000,
			remainingSourceSpan: -120_000,
			overrun: true,
		});
	});

	test("maps reverse and freeze-frame modes deterministically", () => {
		expect(
			getSourceTimeAtClipTime({
				clipTime: 120_000,
				sourceSpan: 480_000,
				retime: { rate: 1, reverse: true },
			}),
		).toBe(360_000);
		expect(
			getSourceTimeAtClipTime({
				clipTime: 300_000,
				sourceSpan: 480_000,
				retime: {
					rate: 1,
					freezeFrameAt: roundMediaTime({ time: 150_000 }),
				},
			}),
		).toBe(150_000);
	});
});

describe("stabilization and keying", () => {
	test("subtracts tracked camera motion at an adjustable strength", () => {
		expect(
			resolveStabilizedPosition({
				position: { x: 20, y: -10 },
				offset: { x: 0.1, y: -0.05, confidence: 0.9 },
				canvasSize: { width: 1000, height: 500 },
				strength: 50,
			}),
		).toEqual({ x: -30, y: 2.5 });
	});

	test("keys a selected color and removes a corner-sampled background", () => {
		const chroma = applyChromaKey({
			pixels: new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255]),
			keyColor: "#00ff00",
			similarity: 0.2,
			softness: 0.1,
			spill: 0.5,
		});
		expect([...chroma]).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);

		const removed = applyBackgroundRemoval({
			pixels: new Uint8ClampedArray([
				20, 40, 220, 255, 20, 40, 220, 255, 20, 40, 220, 255, 230, 30, 20, 255,
			]),
			width: 2,
			height: 2,
			threshold: 0.25,
			softness: 0.05,
		});
		expect(removed[3]).toBe(0);
		expect(removed[15]).toBe(255);
	});
});

describe("effect presets", () => {
	test("creates, organizes, duplicates, applies, and round-trips presets", () => {
		const preset = createEffectPreset({
			id: "preset-1",
			name: "Warm portrait",
			folder: "Portrait",
			effects: [
				{
					type: "color-grade",
					enabled: true,
					params: { temperature: 18, contrast: 8 },
				},
			],
		});
		const duplicate = duplicateEffectPreset({
			preset,
			id: "preset-2",
			name: "Warm portrait soft",
		});
		const applied = applyEffectPreset({
			existing: [
				{ id: "old", type: "blur", enabled: true, params: { intensity: 4 } },
			],
			preset: duplicate,
			mode: "replace",
			idFactory: () => "new-effect",
		});
		expect(applied).toEqual([
			{
				id: "new-effect",
				type: "color-grade",
				enabled: true,
				params: { temperature: 18, contrast: 8 },
			},
		]);

		const exported = exportEffectPresets({ presets: [preset, duplicate] });
		expect(importEffectPresets({ source: exported })).toEqual([
			preset,
			duplicate,
		]);
	});
});
