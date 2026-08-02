import { describe, expect, test } from "bun:test";
import {
	buildPrecisionTrimPlan,
	getPrecisionTrimModeAvailability,
	resolveActiveTrimMode,
	type PrecisionTrimClip,
} from "@/timeline/precision-trim";
import {
	mediaTime,
	type MediaTime,
	TICKS_PER_SECOND,
} from "@/wasm";
import type { FrameRate } from "opencut-wasm";

const fps: FrameRate = { numerator: 25, denominator: 1 };
const frame = TICKS_PER_SECOND / 25;

function frames({ count }: { count: number }): MediaTime {
	return mediaTime({ ticks: count * frame });
}

function clip({
	id,
	startFrame,
	durationFrames,
	overrides = {},
}: {
	id: string;
	startFrame: number;
	durationFrames: number;
	overrides?: Partial<PrecisionTrimClip>;
}): PrecisionTrimClip {
	return {
		id,
		type: "video",
		startTime: frames({ count: startFrame }),
		duration: frames({ count: durationFrames }),
		trimStart: frames({ count: 0 }),
		trimEnd: frames({ count: 100 }),
		sourceDuration: frames({ count: durationFrames + 100 }),
		...overrides,
	};
}

function updateFor({
	plan,
	elementId,
}: {
	plan: ReturnType<typeof buildPrecisionTrimPlan>;
	elementId: string;
}) {
	return plan.updates.find((update) => update.elementId === elementId)?.patch;
}

describe("precision trim planning", () => {
	test("roll moves one shared cut without changing the pair duration", () => {
		const first = clip({ id: "a", startFrame: 0, durationFrames: 100 });
		const second = clip({
			id: "b",
			startFrame: 100,
			durationFrames: 100,
			overrides: {
				trimStart: frames({ count: 20 }),
				trimEnd: frames({ count: 80 }),
			},
		});
		const plan = buildPrecisionTrimPlan({
			mode: "roll",
			side: "right",
			trackId: "video",
			elementId: "a",
			elements: [first, second],
			deltaTime: frames({ count: 10 }),
			fps,
		});

		expect(plan.valid).toBe(true);
		expect(plan.appliedDelta).toBe(frames({ count: 10 }));
		expect(updateFor({ plan, elementId: "a" })).toMatchObject({
			startTime: frames({ count: 0 }),
			duration: frames({ count: 110 }),
			trimEnd: frames({ count: 90 }),
		});
		expect(updateFor({ plan, elementId: "b" })).toMatchObject({
			startTime: frames({ count: 110 }),
			duration: frames({ count: 90 }),
			trimStart: frames({ count: 30 }),
		});
	});

	test("slip changes source in/out while timeline position stays fixed", () => {
		const selected = clip({
			id: "selected",
			startFrame: 100,
			durationFrames: 100,
			overrides: {
				trimStart: frames({ count: 40 }),
				trimEnd: frames({ count: 60 }),
			},
		});
		const plan = buildPrecisionTrimPlan({
			mode: "slip",
			side: "right",
			trackId: "video",
			elementId: "selected",
			elements: [selected],
			deltaTime: frames({ count: 10 }),
			fps,
		});

		expect(plan.valid).toBe(true);
		expect(updateFor({ plan, elementId: "selected" })).toEqual({
			startTime: frames({ count: 100 }),
			duration: frames({ count: 100 }),
			trimStart: frames({ count: 50 }),
			trimEnd: frames({ count: 50 }),
		});
	});

	test("slide preserves the selected source span while rolling both neighbours", () => {
		const previous = clip({
			id: "previous",
			startFrame: 0,
			durationFrames: 100,
		});
		const selected = clip({
			id: "selected",
			startFrame: 100,
			durationFrames: 100,
			overrides: {
				trimStart: frames({ count: 40 }),
				trimEnd: frames({ count: 60 }),
			},
		});
		const next = clip({
			id: "next",
			startFrame: 200,
			durationFrames: 100,
			overrides: {
				trimStart: frames({ count: 20 }),
				trimEnd: frames({ count: 80 }),
			},
		});
		const plan = buildPrecisionTrimPlan({
			mode: "slide",
			side: "right",
			trackId: "video",
			elementId: "selected",
			elements: [previous, selected, next],
			deltaTime: frames({ count: 10 }),
			fps,
		});

		expect(plan.valid).toBe(true);
		expect(updateFor({ plan, elementId: "previous" })).toMatchObject({
			duration: frames({ count: 110 }),
			trimEnd: frames({ count: 90 }),
		});
		expect(updateFor({ plan, elementId: "selected" })).toEqual({
			startTime: frames({ count: 110 }),
			duration: frames({ count: 100 }),
			trimStart: frames({ count: 40 }),
			trimEnd: frames({ count: 60 }),
		});
		expect(updateFor({ plan, elementId: "next" })).toMatchObject({
			startTime: frames({ count: 210 }),
			duration: frames({ count: 90 }),
			trimStart: frames({ count: 30 }),
		});
	});

	test("all precision modes snap one shared delta to the project frame grid", () => {
		const first = clip({ id: "a", startFrame: 0, durationFrames: 100 });
		const second = clip({
			id: "b",
			startFrame: 100,
			durationFrames: 100,
			overrides: {
				trimStart: frames({ count: 20 }),
				trimEnd: frames({ count: 80 }),
			},
		});
		const plan = buildPrecisionTrimPlan({
			mode: "roll",
			side: "right",
			trackId: "video",
			elementId: "a",
			elements: [first, second],
			deltaTime: mediaTime({ ticks: frame * 0.6 }),
			fps,
		});

		expect(plan.appliedDelta).toBe(frames({ count: 1 }));
		expect(updateFor({ plan, elementId: "a" })?.duration).toBe(
			frames({ count: 101 }),
		);
		expect(updateFor({ plan, elementId: "b" })?.startTime).toBe(
			frames({ count: 101 }),
		);
	});

	test("availability explains missing neighbours and meaningless source slip", () => {
		const isolated = clip({
			id: "only",
			startFrame: 0,
			durationFrames: 100,
		});
		const image = { ...isolated, type: "image" as const };

		expect(
			getPrecisionTrimModeAvailability({
				mode: "slide",
				elementId: "only",
				elements: [isolated],
			}),
		).toEqual({
			available: false,
			reason: "滑动编辑需要素材两侧都有相接素材",
		});
		expect(
			getPrecisionTrimModeAvailability({
				mode: "slip",
				elementId: "only",
				elements: [image],
			}),
		).toEqual({
			available: false,
			reason: "仅带有源素材余量的视频或音频可使用滑移编辑",
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
