"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useKeyframeSelection } from "@/timeline/hooks/element/use-keyframe-selection";
import { getKeyframeById } from "@/animation";
import type { AnimationInterpolation } from "@/animation/types";
import { buildKeyframeInterpolationUpdates } from "@/timeline/keyframe-actions";
import { invokeAction } from "@/actions";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Copy01Icon,
	Delete02Icon,
	FilePasteIcon,
} from "@hugeicons/core-free-icons";

type InterpolationValue = AnimationInterpolation | "mixed";

export function KeyframeSelectionToolbar() {
	const editor = useEditor();
	const { selectedKeyframes, clearKeyframeSelection } = useKeyframeSelection();
	const clipboardEntry = useSyncExternalStore(
		(listener) => editor.clipboard.subscribe(listener),
		() => editor.clipboard.getEntry(),
	);
	const resolvedKeyframes = selectedKeyframes.flatMap((keyframeRef) => {
		const selectedElement = editor.timeline.getElementsWithTracks({
			elements: [keyframeRef],
		})[0];
		if (!selectedElement) {
			return [];
		}

		const keyframe = getKeyframeById({
			animations: selectedElement.element.animations,
			propertyPath: keyframeRef.propertyPath,
			keyframeId: keyframeRef.keyframeId,
		});
		return keyframe
			? [{ keyframeRef, keyframe, element: selectedElement.element }]
			: [];
	});
	const interpolation: InterpolationValue =
		resolvedKeyframes.length > 0 &&
		resolvedKeyframes.every(
			({ keyframe }) =>
				keyframe.interpolation === resolvedKeyframes[0].keyframe.interpolation,
		)
			? resolvedKeyframes[0].keyframe.interpolation
			: "mixed";

	if (selectedKeyframes.length === 0) {
		return null;
	}

	return (
		<KeyframeSelectionToolbarView
			selectedCount={selectedKeyframes.length}
			canPaste={clipboardEntry?.type === "keyframes"}
			interpolation={interpolation}
			onNudgeBackward={() => invokeAction("nudge-keyframes-backward")}
			onNudgeForward={() => invokeAction("nudge-keyframes-forward")}
			onCopy={() => invokeAction("copy-selected")}
			onPaste={() => invokeAction("paste-copied")}
			onInterpolationChange={(nextInterpolation) => {
				const updates = buildKeyframeInterpolationUpdates({
					selectedKeyframes,
					interpolation: nextInterpolation,
					resolveKeyframe: (keyframeRef) => {
						const resolved = resolvedKeyframes.find(
							(candidate) =>
								candidate.keyframeRef.trackId === keyframeRef.trackId &&
								candidate.keyframeRef.elementId === keyframeRef.elementId &&
								candidate.keyframeRef.propertyPath ===
									keyframeRef.propertyPath &&
								candidate.keyframeRef.keyframeId === keyframeRef.keyframeId,
						);
						return resolved
							? {
									time: resolved.keyframe.time,
									value: resolved.keyframe.value,
								}
							: null;
					},
				});
				editor.timeline.upsertKeyframes({ keyframes: updates });
			}}
			onDelete={() => {
				editor.timeline.removeKeyframes({ keyframes: selectedKeyframes });
				clearKeyframeSelection();
			}}
		/>
	);
}

export function KeyframeSelectionToolbarView({
	selectedCount,
	canPaste,
	interpolation,
	onNudgeBackward,
	onNudgeForward,
	onCopy,
	onPaste,
	onInterpolationChange,
	onDelete,
}: {
	selectedCount: number;
	canPaste: boolean;
	interpolation: InterpolationValue;
	onNudgeBackward: () => void;
	onNudgeForward: () => void;
	onCopy: () => void;
	onPaste: () => void;
	onInterpolationChange: (interpolation: AnimationInterpolation) => void;
	onDelete: () => void;
}) {
	return (
		<div
			className="bg-primary/5 flex h-8 shrink-0 items-center gap-1 rounded-md border px-1.5"
			role="group"
			aria-label="所选关键帧操作"
		>
			<span className="text-muted-foreground px-1 text-[11px]">
				已选 {selectedCount} 个关键帧
			</span>
			<KeyframeActionButton
				label="将所选关键帧向前移动一帧"
				title="向前移动一帧（⌥←）"
				onClick={onNudgeBackward}
				icon={ArrowLeft01Icon}
			/>
			<KeyframeActionButton
				label="将所选关键帧向后移动一帧"
				title="向后移动一帧（⌥→）"
				onClick={onNudgeForward}
				icon={ArrowRight01Icon}
			/>
			<KeyframeActionButton
				label="复制所选关键帧"
				title="复制所选关键帧"
				onClick={onCopy}
				icon={Copy01Icon}
			/>
			<KeyframeActionButton
				label="在播放头处粘贴关键帧"
				title="在播放头处粘贴关键帧"
				onClick={onPaste}
				icon={FilePasteIcon}
				disabled={!canPaste}
			/>
			<select
				className="border-input bg-background h-6 rounded border px-1 text-[11px]"
				aria-label="关键帧插值"
				title="关键帧插值"
				value={interpolation}
				onChange={(event) => {
					const nextInterpolation = event.target.value;
					if (
						nextInterpolation === "linear" ||
						nextInterpolation === "hold" ||
						nextInterpolation === "bezier"
					) {
						onInterpolationChange(nextInterpolation);
					}
				}}
			>
				{interpolation === "mixed" ? (
					<option value="mixed">混合</option>
				) : null}
				<option value="linear">线性</option>
				<option value="hold">定格</option>
				<option value="bezier">贝塞尔</option>
			</select>
			<KeyframeActionButton
				label="删除所选关键帧"
				title="删除所选关键帧"
				onClick={onDelete}
				icon={Delete02Icon}
			/>
		</div>
	);
}

function KeyframeActionButton({
	label,
	title,
	onClick,
	icon,
	disabled = false,
}: {
	label: string;
	title: string;
	onClick: () => void;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
	disabled?: boolean;
}) {
	return (
		<Button
			type="button"
			variant="text"
			size="icon"
			className="size-6"
			aria-label={label}
			title={title}
			disabled={disabled}
			onClick={onClick}
		>
			<HugeiconsIcon icon={icon} className="size-3.5" />
		</Button>
	);
}
