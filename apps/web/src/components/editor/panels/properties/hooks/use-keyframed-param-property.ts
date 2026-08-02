"use client";

import { useEditor } from "@/editor/use-editor";
import {
	buildGraphicParamPath,
	getElementKeyframes,
	getKeyframeAtTime,
	hasKeyframesForPath,
	upsertPathKeyframe,
} from "@/animation";
import { getAdjacentKeyframeTimes } from "@/animation/keyframe-navigation";
import type { AnimationPath, ElementAnimations } from "@/animation/types";
import {
	coerceParamValue,
	getParamChannelLayout,
	type ParamDefinition,
} from "@/params";
import type { TimelineElement } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { addMediaTime, type MediaTime } from "@/wasm";

export interface KeyframedParamPropertyResult {
	hasAnimatedKeyframes: boolean;
	isKeyframedAtTime: boolean;
	keyframeIdAtTime: string | null;
	keyframeCount: number;
	canGoPrevious: boolean;
	canGoNext: boolean;
	onPreview: (value: number | string | boolean) => void;
	onCommit: () => void;
	goToPreviousKeyframe: () => void;
	goToNextKeyframe: () => void;
	toggleKeyframe: () => void;
}

export function useKeyframedParamProperty({
	param,
	trackId,
	elementId,
	animations,
	propertyPath,
	elementStartTime,
	elementDuration,
	localTime,
	isPlayheadWithinElementRange,
	resolvedValue,
	buildBaseUpdates,
}: {
	param: ParamDefinition;
	trackId: string;
	elementId: string;
	animations: ElementAnimations | undefined;
	propertyPath?: AnimationPath;
	elementStartTime: MediaTime;
	elementDuration: MediaTime;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	resolvedValue: number | string | boolean;
	buildBaseUpdates: ({
		value,
	}: {
		value: number | string | boolean;
	}) => Partial<TimelineElement>;
}): KeyframedParamPropertyResult {
	const editor = useEditor();
	const playheadTime = useEditor((currentEditor) =>
		currentEditor.playback.getCurrentTime(),
	);
	const resolvedPropertyPath =
		propertyPath ?? buildGraphicParamPath({ paramKey: param.key });
	const hasAnimatedKeyframes = hasKeyframesForPath({
		animations,
		propertyPath: resolvedPropertyPath,
	});
	const pathKeyframes = getElementKeyframes({ animations }).filter(
		(keyframe) => keyframe.propertyPath === resolvedPropertyPath,
	);
	const playheadPosition =
		playheadTime < elementStartTime
			? "before"
			: playheadTime > addMediaTime({ a: elementStartTime, b: elementDuration })
				? "after"
				: "inside";
	const adjacentKeyframes = getAdjacentKeyframeTimes({
		times: pathKeyframes.map((keyframe) => keyframe.time),
		localTime,
		position: playheadPosition,
	});
	const keyframeAtTime = isPlayheadWithinElementRange
		? getKeyframeAtTime({
				animations,
				propertyPath: resolvedPropertyPath,
				time: localTime,
			})
		: null;
	const keyframeIdAtTime = keyframeAtTime?.id ?? null;
	const isKeyframedAtTime = keyframeAtTime !== null;
	const shouldUseAnimatedChannel =
		hasAnimatedKeyframes && isPlayheadWithinElementRange;

	const selectAndSeekKeyframe = ({ time }: { time: MediaTime }) => {
		const keyframe = getKeyframeAtTime({
			animations,
			propertyPath: resolvedPropertyPath,
			time,
		});
		if (!keyframe) {
			return;
		}

		editor.selection.setSelectedKeyframes({
			keyframes: [
				{
					trackId,
					elementId,
					propertyPath: resolvedPropertyPath,
					keyframeId: keyframe.id,
				},
			],
			anchorKeyframe: {
				trackId,
				elementId,
				propertyPath: resolvedPropertyPath,
				keyframeId: keyframe.id,
			},
		});
		editor.playback.seek({
			time: addMediaTime({ a: elementStartTime, b: time }),
		});
	};

	const previewValue: KeyframedParamPropertyResult["onPreview"] = (value) => {
		if (shouldUseAnimatedChannel) {
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId,
						updates: {
							animations: upsertPathKeyframe({
								animations,
								propertyPath: resolvedPropertyPath,
								time: localTime,
								value,
								channelLayout: getParamChannelLayout({ param }),
								coerceValue: ({ value: nextValue }) =>
									coerceParamValue({
										param,
										value: nextValue,
									}),
							}),
						},
					},
				],
			});
			return;
		}

		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId,
					updates: buildBaseUpdates({ value }),
				},
			],
		});
	};

	const toggleKeyframe = () => {
		if (!isPlayheadWithinElementRange) {
			return;
		}

		if (keyframeIdAtTime) {
			editor.timeline.removeKeyframes({
				keyframes: [
					{
						trackId,
						elementId,
						propertyPath: resolvedPropertyPath,
						keyframeId: keyframeIdAtTime,
					},
				],
			});
			editor.selection.clearKeyframeSelection();
			return;
		}

		const keyframeId = generateUUID();
		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId,
					propertyPath: resolvedPropertyPath,
					time: localTime,
					value: resolvedValue,
					keyframeId,
				},
			],
		});
		editor.selection.setSelectedKeyframes({
			keyframes: [
				{
					trackId,
					elementId,
					propertyPath: resolvedPropertyPath,
					keyframeId,
				},
			],
			anchorKeyframe: {
				trackId,
				elementId,
				propertyPath: resolvedPropertyPath,
				keyframeId,
			},
		});
	};

	return {
		hasAnimatedKeyframes,
		isKeyframedAtTime,
		keyframeIdAtTime,
		keyframeCount: adjacentKeyframes.count,
		canGoPrevious: adjacentKeyframes.previous !== null,
		canGoNext: adjacentKeyframes.next !== null,
		onPreview: previewValue,
		onCommit: () => editor.timeline.commitPreview(),
		goToPreviousKeyframe: () => {
			if (adjacentKeyframes.previous !== null) {
				selectAndSeekKeyframe({ time: adjacentKeyframes.previous });
			}
		},
		goToNextKeyframe: () => {
			if (adjacentKeyframes.next !== null) {
				selectAndSeekKeyframe({ time: adjacentKeyframes.next });
			}
		},
		toggleKeyframe,
	};
}
