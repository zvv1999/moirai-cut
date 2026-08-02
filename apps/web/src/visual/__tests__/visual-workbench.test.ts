import { describe, expect, test } from "bun:test";
import {
	buildVisualCssFilter,
	normalizeVisualAppearance,
	parseCubeLut,
	sampleCubeLut,
} from "@/visual/appearance";
import { resolveAdjustmentCoverage } from "@/visual/adjustment-coverage";
import {
	buildMaskStackPlan,
	type MaskCombineMode,
} from "@/masks/stack";

describe("visual geometry", () => {
	test("clamps crop pairs, keeps mirror explicit, and normalizes decoration", () => {
		expect(
			normalizeVisualAppearance({
				"crop.left": 80,
				"crop.right": 70,
				"crop.top": -5,
				"crop.bottom": 10,
				"geometry.mirrorX": true,
				"geometry.mirrorY": false,
				"geometry.cornerRadius": 140,
				"geometry.shadow.enabled": true,
				"geometry.shadow.blur": 18,
				"geometry.stroke.width": -3,
			}),
		).toEqual({
			crop: { left: 49.5, right: 49.5, top: 0, bottom: 10 },
			mirrorX: true,
			mirrorY: false,
			cornerRadius: 50,
			shadow: {
				enabled: true,
				blur: 18,
				offsetX: 0,
				offsetY: 8,
				color: "#00000080",
			},
			stroke: { width: 0, color: "#ffffff" },
		});
	});
});

describe("colour controls and LUTs", () => {
	test("builds a bounded non-destructive canvas filter", () => {
		expect(
			buildVisualCssFilter({
				exposure: 1,
				contrast: 25,
				temperature: -40,
				saturation: -20,
				highlights: 30,
				shadows: -10,
				curve: 15,
			}),
		).toBe(
			"brightness(1.9125) contrast(1.2875) saturate(0.8) sepia(0.16) hue-rotate(-4.8deg)",
		);
	});

	test("parses and samples a 2x2x2 .cube LUT deterministically", () => {
		const lut = parseCubeLut({
			source: [
				'TITLE "Invert"',
				"LUT_3D_SIZE 2",
				"0 0 0",
				"1 1 0",
				"0 1 1",
				"1 0 1",
				"1 1 1",
				"0 0 1",
				"1 0 0",
				"0 1 0",
			].join("\n"),
		});

		expect(lut.title).toBe("Invert");
		expect(lut.size).toBe(2);
		expect(lut.values).toHaveLength(8);
		expect(sampleCubeLut({ lut, color: [0, 0, 0] })).toEqual([0, 0, 0]);
		expect(sampleCubeLut({ lut, color: [1, 1, 1] })).toEqual([0, 1, 0]);
	});
});

describe("adjustment layer coverage", () => {
	test("targets only compatible, covered layers below the adjustment", () => {
		expect(
			resolveAdjustmentCoverage({
				adjustment: {
					id: "grade",
					trackIndex: 1,
					start: 2,
					end: 8,
				},
				candidates: [
					{ id: "above", trackIndex: 0, start: 0, end: 10, kind: "video" },
					{ id: "video", trackIndex: 2, start: 0, end: 4, kind: "video" },
					{ id: "image", trackIndex: 3, start: 5, end: 9, kind: "image" },
					{ id: "audio", trackIndex: 4, start: 0, end: 10, kind: "audio" },
					{ id: "late", trackIndex: 2, start: 9, end: 12, kind: "graphic" },
				],
			}),
		).toEqual(["video", "image"]);
	});
});

describe("mask stack", () => {
	test("maps ordered mask modes to deterministic canvas compositing", () => {
		const modes: MaskCombineMode[] = [
			"add",
			"intersect",
			"subtract",
			"exclude",
		];
		expect(
			buildMaskStackPlan({
				masks: modes.map((combineMode, index) => ({
					id: `mask-${index}`,
					combineMode,
					feather: index * 2,
					inverted: index === 3,
				})),
			}),
		).toEqual({
			maxFeather: 6,
			steps: [
				{ id: "mask-0", compositeOperation: "source-over", inverted: false },
				{ id: "mask-1", compositeOperation: "destination-in", inverted: false },
				{ id: "mask-2", compositeOperation: "destination-out", inverted: false },
				{ id: "mask-3", compositeOperation: "xor", inverted: true },
			],
		});
	});
});
