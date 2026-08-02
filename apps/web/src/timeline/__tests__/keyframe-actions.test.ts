import { describe, expect, test } from "bun:test";
import {
	buildKeyframeInterpolationUpdates,
	buildKeyframeRetimePlan,
} from "../keyframe-actions";
import type { SelectedKeyframeRef } from "@/animation/types";
import { mediaTime } from "@/wasm";

const selectedKeyframes: SelectedKeyframeRef[] = [
	{
		trackId: "track-1",
		elementId: "element-1",
		propertyPath: "opacity",
		keyframeId: "key-1",
	},
	{
		trackId: "track-1",
		elementId: "element-1",
		propertyPath: "transform.scaleX",
		keyframeId: "key-2",
	},
];

describe("buildKeyframeRetimePlan", () => {
	test("nudges every selected keyframe by one frame while clamping to the clip", () => {
		const plan = buildKeyframeRetimePlan({
			selectedKeyframes,
			delta: mediaTime({ ticks: -100 }),
			resolveKeyframe: ({ keyframeId }) =>
				keyframeId === "key-1"
					? {
							time: mediaTime({ ticks: 50 }),
							duration: mediaTime({ ticks: 1_000 }),
						}
					: {
							time: mediaTime({ ticks: 900 }),
							duration: mediaTime({ ticks: 1_000 }),
						},
		});

		expect(plan.map(({ time }) => time)).toEqual([
			mediaTime({ ticks: 0 }),
			mediaTime({ ticks: 800 }),
		]);
		expect(plan.map(({ keyframeId }) => keyframeId)).toEqual([
			"key-1",
			"key-2",
		]);
	});

	test("drops stale selections instead of inventing edits", () => {
		expect(
			buildKeyframeRetimePlan({
				selectedKeyframes,
				delta: mediaTime({ ticks: 100 }),
				resolveKeyframe: () => null,
			}),
		).toEqual([]);
	});
});

describe("buildKeyframeInterpolationUpdates", () => {
	test("preserves keyframe identity, time, and value when changing interpolation", () => {
		const updates = buildKeyframeInterpolationUpdates({
			selectedKeyframes,
			interpolation: "hold",
			resolveKeyframe: ({ keyframeId }) =>
				keyframeId === "key-1"
					? {
							time: mediaTime({ ticks: 50 }),
							value: 0.75,
						}
					: null,
		});

		expect(updates).toEqual([
			{
				...selectedKeyframes[0],
				time: mediaTime({ ticks: 50 }),
				value: 0.75,
				interpolation: "hold",
			},
		]);
	});
});
