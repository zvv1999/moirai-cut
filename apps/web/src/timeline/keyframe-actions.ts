import type {
	AnimationInterpolation,
	SelectedKeyframeRef,
} from "@/animation/types";
import type { ParamValue } from "@/params";
import {
	addMediaTime,
	clampMediaTime,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

export function buildKeyframeRetimePlan({
	selectedKeyframes,
	delta,
	resolveKeyframe,
}: {
	selectedKeyframes: SelectedKeyframeRef[];
	delta: MediaTime;
	resolveKeyframe: (
		keyframe: SelectedKeyframeRef,
	) => { time: MediaTime; duration: MediaTime } | null;
}): Array<SelectedKeyframeRef & { time: MediaTime }> {
	return selectedKeyframes.flatMap((selectedKeyframe) => {
		const resolved = resolveKeyframe(selectedKeyframe);
		if (!resolved) {
			return [];
		}

		return [
			{
				...selectedKeyframe,
				time: clampMediaTime({
					time: addMediaTime({ a: resolved.time, b: delta }),
					min: ZERO_MEDIA_TIME,
					max: resolved.duration,
				}),
			},
		];
	});
}

export function buildKeyframeInterpolationUpdates({
	selectedKeyframes,
	interpolation,
	resolveKeyframe,
}: {
	selectedKeyframes: SelectedKeyframeRef[];
	interpolation: AnimationInterpolation;
	resolveKeyframe: (
		keyframe: SelectedKeyframeRef,
	) => { time: MediaTime; value: ParamValue } | null;
}): Array<
	SelectedKeyframeRef & {
		time: MediaTime;
		value: ParamValue;
		interpolation: AnimationInterpolation;
	}
> {
	return selectedKeyframes.flatMap((selectedKeyframe) => {
		const resolved = resolveKeyframe(selectedKeyframe);
		if (!resolved) {
			return [];
		}

		return [
			{
				...selectedKeyframe,
				time: resolved.time,
				value: resolved.value,
				interpolation,
			},
		];
	});
}
