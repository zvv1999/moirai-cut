import { describe, expect, test } from "bun:test";
import {
	getElementKeyframes,
	resolveAnimationPathValueAtTime,
	upsertPathKeyframe,
} from "@/animation";
import type { AnimationPath, ElementAnimations } from "@/animation/types";
import { NUMBER_CHANNEL_LAYOUT, type ParamValue } from "@/params";
import { mediaTime, type MediaTime } from "@/wasm";
import { buildKeyframeAwareTransformUpdates } from "@/preview/keyframed-transform-updates";

const coerceNumber = ({ value }: { value: ParamValue }) =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

function addNumberKeyframe({
	animations,
	propertyPath,
	time,
	value,
}: {
	animations?: ElementAnimations;
	propertyPath: AnimationPath;
	time: MediaTime;
	value: number;
}): ElementAnimations {
	return (
		upsertPathKeyframe({
			animations,
			propertyPath,
			time,
			value,
			channelLayout: NUMBER_CHANNEL_LAYOUT,
			coerceValue: coerceNumber,
		}) ?? {}
	);
}

describe("buildKeyframeAwareTransformUpdates", () => {
	test("writes non-animated transform values to base params", () => {
		const updates = buildKeyframeAwareTransformUpdates({
			params: {
				"transform.positionX": 5,
				"transform.positionY": 6,
			},
			animations: undefined,
			localTime: mediaTime({ ticks: 50 }),
			values: {
				"transform.positionX": 25,
				"transform.positionY": 30,
			},
		});

		expect(updates.params).toEqual({
			"transform.positionX": 25,
			"transform.positionY": 30,
		});
		expect(updates.animations).toBeUndefined();
	});

	test("updates an animated axis while writing a non-animated axis to base params", () => {
		let animations = addNumberKeyframe({
			propertyPath: "transform.positionX",
			time: mediaTime({ ticks: 0 }),
			value: 0,
		});
		animations = addNumberKeyframe({
			animations,
			propertyPath: "transform.positionX",
			time: mediaTime({ ticks: 100 }),
			value: 10,
		});

		const updates = buildKeyframeAwareTransformUpdates({
			params: {
				"transform.positionX": 5,
				"transform.positionY": 6,
			},
			animations,
			localTime: mediaTime({ ticks: 50 }),
			values: {
				"transform.positionX": 25,
				"transform.positionY": 30,
			},
		});

		expect(updates.params["transform.positionX"]).toBe(5);
		expect(updates.params["transform.positionY"]).toBe(30);
		expect(
			resolveAnimationPathValueAtTime({
				animations: updates.animations,
				propertyPath: "transform.positionX",
				localTime: mediaTime({ ticks: 50 }),
				fallbackValue: 5,
			}),
		).toBe(25);
		expect(
			getElementKeyframes({ animations: updates.animations }).filter(
				(keyframe) => keyframe.propertyPath === "transform.positionX",
			),
		).toHaveLength(3);
	});

	test("replaces an existing keyframe at the playhead instead of duplicating it", () => {
		let animations = addNumberKeyframe({
			propertyPath: "transform.positionX",
			time: mediaTime({ ticks: 0 }),
			value: 0,
		});
		animations = addNumberKeyframe({
			animations,
			propertyPath: "transform.positionX",
			time: mediaTime({ ticks: 50 }),
			value: 10,
		});

		const updates = buildKeyframeAwareTransformUpdates({
			params: {
				"transform.positionX": 5,
				"transform.positionY": 6,
			},
			animations,
			localTime: mediaTime({ ticks: 50 }),
			values: {
				"transform.positionX": 25,
			},
		});
		const xKeyframes = getElementKeyframes({
			animations: updates.animations,
		}).filter(
			(keyframe) => keyframe.propertyPath === "transform.positionX",
		);

		expect(xKeyframes).toHaveLength(2);
		expect(xKeyframes.find((keyframe) => keyframe.time === 50)?.value).toBe(25);
	});
});
