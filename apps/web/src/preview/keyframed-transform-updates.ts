import { hasKeyframesForPath, upsertPathKeyframe } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import {
	NUMBER_CHANNEL_LAYOUT,
	type ParamValue,
	type ParamValues,
} from "@/params";
import type { MediaTime } from "@/wasm";

const TRANSFORM_PROPERTY_PATHS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const;

export type TransformPropertyPath = (typeof TRANSFORM_PROPERTY_PATHS)[number];

export function buildKeyframeAwareTransformUpdates({
	params,
	animations,
	localTime,
	values,
}: {
	params: ParamValues;
	animations: ElementAnimations | undefined;
	localTime: MediaTime;
	values: Partial<Record<TransformPropertyPath, number>>;
}): {
	params: ParamValues;
	animations?: ElementAnimations;
} {
	const nextParams = { ...params };
	let nextAnimations = animations;
	let didUpdateAnimations = false;

	for (const propertyPath of TRANSFORM_PROPERTY_PATHS) {
		const value = values[propertyPath];
		if (value === undefined) {
			continue;
		}

		if (
			hasKeyframesForPath({
				animations,
				propertyPath,
			})
		) {
			nextAnimations = upsertPathKeyframe({
				animations: nextAnimations,
				propertyPath,
				time: localTime,
				value,
				channelLayout: NUMBER_CHANNEL_LAYOUT,
				coerceValue: coerceFiniteNumber,
			});
			didUpdateAnimations = true;
			continue;
		}

		nextParams[propertyPath] = value;
	}

	return {
		params: nextParams,
		...(didUpdateAnimations ? { animations: nextAnimations } : {}),
	};
}

function coerceFiniteNumber({ value }: { value: ParamValue }): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
