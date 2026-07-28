import { describe, expect, test } from "bun:test";
import {
	buildPrecisionTrimPlan,
	getPrecisionTrimModeAvailability,
	resolveActiveTrimMode,
	type PrecisionTrimClip,
} from "@/timeline/precision-trim";
import { TICKS_PER_SECOND } from "@/wasm";

const fps = { numerator: 25, denominator: 1 };
const frame = TICKS_PER_SECOND / 25;

function clip(
	id: string,
	startTime: number,
	duration: number,
	overrides: Partial<PrecisionTrimClip> = {},
): PrecisionTrimClip {
	return {
		id,
		type: "video",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 100 * frame,
		sourceDuration: duration + 100 * frame,
		...overrides,
	};
}

function updateFor(
	plan: ReturnType<typeof buildPrecisionTrimPlan>,
	elementId: string,
) {
	return plan.updates.find((update) => update.elementId === elementId)?.patch;
}

describe("precision trim planning", () => {
	test("roll moves one shared cut without changing the pair duration", () => {
		const first = clip("a", 0, 100 * frame);
		const second = clip("b", 100 * frame, 100 * frame, {
			trimStart: 20 * frame,
			trimEnd: 80 * frame,
		});
		const plan = buildPrecisionTrimPlan({
			mode: "roll",
			side: "right",
			trackId: "video",
			elementId: "a",
			elements: [first, second],
			deltaTime: 10 * frame,
			fps,
		});

		expect(plan.valid).toBe(true);
		expect(plan.appliedDelta).toBe(10 * frame);
		expect(updateFor(plan, "a")).toMatchObject({
			startTime: 0,
			duration: 110 * frame,
			trimEnd: 90 * frame,
		});
		expect(updateFor(plan, "b")).toMatchObject({
			startTime: 110 * frame,
			duration: 90 * frame,
			trimStart: 30 * frame,
		});
	});

	test("slip changes source in/out while timeline position stays fixed", () => {
		const selected = clip("selected", 100 * frame, 100 * frame, {
			trimStart: 40 * frame,
			trimEnd: 60 * frame,
		});
		const plan = buildPrecisionTrimPlan({
			mode: "slip",
			side: "right",
			trackId: "video",
			elementId: "selected",
			elements: [selected],
			deltaTime: 10 * frame,
			fps,
		});

		expect(plan.valid).toBe(true);
		expect(updateFor(plan, "selected")).toEqual({
			startTime: 100 * frame,
			duration: 100 * frame,
			trimStart: 50 * frame,
			trimEnd: 50 * frame,
		});
	});

	test("slide preserves the selected source span while rolling both neighbours", () => {
		const previous = clip("previous", 0, 100 * frame);
		const selected = clip("selected", 100 * frame, 100 * frame, {
			trimStart: 40 * frame,
			trimEnd: 60 * frame,
		});
		const next = clip("next", 200 * frame, 100 * frame, {
			trimStart: 20 * frame,
			trimEnd: 80 * frame,
		});
		const plan = buildPrecisionTrimPlan({
			mode: "slide",
			side: "right",
			trackId: "video",
			elementId: "selected",
			elements: [previous, selected, next],
			deltaTime: 10 * frame,
			fps,
		});

		expect(plan.valid).toBe(true);
		expect(updateFor(plan, "previous")).toMatchObject({
			duration: 110 * frame,
			trimEnd: 90 * frame,
		});
		expect(updateFor(plan, "selected")).toEqual({
			startTime: 110 * frame,
			duration: 100 * frame,
			trimStart: 40 * frame,
			trimEnd: 60 * frame,
		});
		expect(updateFor(plan, "next")).toMatchObject({
			startTime: 210 * frame,
			duration: 90 * frame,
			trimStart: 30 * frame,
		});
	});

	test("all precision modes snap one shared delta to the project frame grid", () => {
		const first = clip("a", 0, 100 * frame);
		const second = clip("b", 100 * frame, 100 * frame, {
			trimStart: 20 * frame,
			trimEnd: 80 * frame,
		});
		const plan = buildPrecisionTrimPlan({
			mode: "roll",
			side: "right",
			trackId: "video",
			elementId: "a",
			elements: [first, second],
			deltaTime: frame * 0.6,
			fps,
		});

		expect(plan.appliedDelta).toBe(frame);
		expect(updateFor(plan, "a")?.duration).toBe(101 * frame);
		expect(updateFor(plan, "b")?.startTime).toBe(101 * frame);
	});

	test("availability explains missing neighbours and meaningless source slip", () => {
		const isolated = clip("only", 0, 100 * frame);
		const image = { ...isolated, type: "image" as const };

		expect(
			getPrecisionTrimModeAvailability({
				mode: "slide",
				elementId: "only",
				elements: [isolated],
			}),
		).toEqual({
			available: false,
			reason: "Slide needs clips touching both sides",
		});
		expect(
			getPrecisionTrimModeAvailability({
				mode: "slip",
				elementId: "only",
				elements: [image],
			}),
		).toEqual({
			available: false,
			reason: "Slip is only meaningful for video or audio with source handles",
		});
	});

	test("the persistent ripple switch resolves to the ripple trim tool", () => {
		expect(
			resolveActiveTrimMode({
				precisionMode: "roll",
				rippleEditingEnabled: true,
			}),
		).toBe("ripple");
		expect(
			resolveActiveTrimMode({
				precisionMode: "roll",
				rippleEditingEnabled: false,
			}),
		).toBe("roll");
	});
});
