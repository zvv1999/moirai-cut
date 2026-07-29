"use client";

import { useState } from "react";
import { resolveAnimationPathValueAtTime } from "@/animation";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { MasksTab } from "@/masks/components/masks-tab";
import {
	getElementParams,
	readElementParamValue,
	writeElementParamValue,
	type ElementParamDefinition,
} from "@/params/registry";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import {
	isMaskableElement,
	type TimelineElement,
	type VisualElement,
} from "@/timeline";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { cn } from "@/utils/ui";
import { useElementPlayhead } from "../hooks/use-element-playhead";
import { useKeyframedParamProperty } from "../hooks/use-keyframed-param-property";
import { ElementParamsTab, type ElementParamSection } from "./element-params-tab";
import {
	JianyingPositionSizeControls,
	buildLinkedScaleUpdates,
	type JianyingAlignment,
	type JianyingNumberControl,
} from "./jianying-position-size";

export const VISUAL_SUBTABS = [
	{ id: "basic", label: "基础" },
	{ id: "cutout", label: "抠像" },
	{ id: "masks", label: "蒙版" },
	{ id: "beauty", label: "美颜美体" },
] as const;

type VisualSubtabId = (typeof VISUAL_SUBTABS)[number]["id"];

const BLENDING_PARAM_KEYS = ["opacity", "blendMode"] as const;
const DEFORMATION_PARAM_KEYS = [
	"geometry.mirrorX",
	"geometry.mirrorY",
	"crop.left",
	"crop.right",
	"crop.top",
	"crop.bottom",
	"geometry.cornerRadius",
	"geometry.shadow.enabled",
	"geometry.shadow.color",
	"geometry.shadow.blur",
	"geometry.shadow.offsetX",
	"geometry.shadow.offsetY",
	"geometry.stroke.width",
	"geometry.stroke.color",
] as const;

export const VISUAL_PARAM_SECTIONS: readonly ElementParamSection[] = [
	{
		id: "blending",
		label: "混合",
		paramKeys: BLENDING_PARAM_KEYS,
		defaultOpen: false,
	},
	{
		id: "deformation",
		label: "变形",
		paramKeys: DEFORMATION_PARAM_KEYS,
		defaultOpen: false,
	},
] as const;

const VISUAL_BASIC_PARAM_KEYS = [
	...BLENDING_PARAM_KEYS,
	...DEFORMATION_PARAM_KEYS,
] as const;

function UnavailableVisualFeature({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="flex min-h-52 flex-col items-center justify-center px-8 text-center">
			<div className="border-border bg-accent/60 mb-3 flex size-10 items-center justify-center rounded-xl border text-lg">
				◇
			</div>
			<p className="text-foreground text-[13px] font-medium">{title}</p>
			<p className="text-muted-foreground mt-1.5 max-w-56 text-[11px] leading-5">
				{description}
			</p>
		</div>
	);
}

function CapabilitySection({
	id,
	label,
	description,
	badge,
}: {
	id: string;
	label: string;
	description: string;
	badge?: string;
}) {
	return (
		<Section
			sectionKey={`jianying-capability:${id}`}
			collapsible
			defaultOpen={false}
			showBottomBorder
			className="border-border/70"
		>
			<SectionHeader className="h-12 px-4">
				<SectionTitle className="text-[13px] font-medium">{label}</SectionTitle>
				{badge ? (
					<span className="bg-primary/12 text-primary ml-2 rounded px-1.5 py-0.5 text-[9px]">
						{badge}
					</span>
				) : null}
			</SectionHeader>
			<SectionContent className="px-4 pb-4 pt-0">
				<p className="text-muted-foreground rounded-md border border-dashed px-3 py-2.5 text-[11px] leading-5">
					{description}
				</p>
			</SectionContent>
		</Section>
	);
}

export function VisualWorkbenchTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const [activeSubtab, setActiveSubtab] =
		useState<VisualSubtabId>("basic");

	return (
		<div className="flex flex-col">
			<div
				role="tablist"
				aria-label="画面属性"
				data-inspector-tabs="visual-properties"
				className="border-border/70 bg-background sticky top-0 z-10 grid h-[52px] shrink-0 grid-cols-4 items-center border-b px-4"
			>
				{VISUAL_SUBTABS.map((tab) => {
					const isActive = tab.id === activeSubtab;
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={isActive}
							aria-controls={`visual-subpanel-${tab.id}`}
							data-active={isActive}
							className={cn(
								"relative h-8 rounded-md text-[12px] transition-colors",
								isActive
									? "bg-accent text-foreground font-medium"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveSubtab(tab.id)}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			<div
				id={`visual-subpanel-${activeSubtab}`}
				role="tabpanel"
				aria-label={
					VISUAL_SUBTABS.find((tab) => tab.id === activeSubtab)?.label
				}
			>
				{activeSubtab === "basic" ? (
					<JianyingVisualBasicTab element={element} trackId={trackId} />
				) : null}
				{activeSubtab === "masks" && isMaskableElement(element) ? (
					<MasksTab element={element} trackId={trackId} />
				) : null}
				{activeSubtab === "masks" && !isMaskableElement(element) ? (
					<UnavailableVisualFeature
						title="此素材暂不支持蒙版"
						description="视频、图片和图形素材可使用蒙版；当前素材类型暂不支持。"
					/>
				) : null}
				{activeSubtab === "cutout" ? (
					<UnavailableVisualFeature
						title="抠像尚未接入"
						description="界面入口已与剪映对齐；智能抠像和色度抠图将在后续能力接入后开放。"
					/>
				) : null}
				{activeSubtab === "beauty" ? (
					<UnavailableVisualFeature
						title="美颜美体尚未接入"
						description="当前不会伪造处理结果；模型能力接入后将直接在此处提供参数。"
					/>
				) : null}
			</div>
		</div>
	);
}

function useNumberParamControl({
	element,
	trackId,
	paramKey,
	localTime,
	isPlayheadWithinElementRange,
	buildBaseUpdates,
}: {
	element: TimelineElement;
	trackId: string;
	paramKey: string;
	localTime: ReturnType<typeof useElementPlayhead>["localTime"];
	isPlayheadWithinElementRange: boolean;
	buildBaseUpdates?: ({
		value,
		param,
	}: {
		value: number;
		param: ElementParamDefinition;
	}) => Partial<TimelineElement>;
}): JianyingNumberControl {
	const param = getElementParams({ element }).find(
		(candidate) => candidate.key === paramKey,
	);
	if (!param || param.type !== "number") {
		throw new Error(`Expected number parameter: ${paramKey}`);
	}
	const baseValue = readElementParamValue({ element, param }) ?? param.default;
	const resolvedValue = resolveAnimationPathValueAtTime({
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		fallbackValue: baseValue,
	});
	const animated = useKeyframedParamProperty({
		param,
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: param.key,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue,
		buildBaseUpdates: ({ value }) =>
			buildBaseUpdates
				? buildBaseUpdates({ value: Number(value), param })
				: writeElementParamValue({ element, param, value }),
	});

	return {
		value: Number(resolvedValue),
		onPreview: (value) => animated.onPreview(value),
		onCommit: animated.onCommit,
		keyframe: {
			isActive: animated.isKeyframedAtTime,
			isDisabled: !isPlayheadWithinElementRange,
			keyframeCount: animated.keyframeCount,
			canGoPrevious: animated.canGoPrevious,
			canGoNext: animated.canGoNext,
			onPrevious: animated.goToPreviousKeyframe,
			onToggle: animated.toggleKeyframe,
			onNext: animated.goToNextKeyframe,
		},
	};
}

function JianyingVisualBasicTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: renderElement.startTime,
		duration: renderElement.duration,
	});
	const [equalScale, setEqualScale] = useState(true);

	const scaleX = useNumberParamControl({
		element: renderElement,
		trackId,
		paramKey: "transform.scaleX",
		localTime,
		isPlayheadWithinElementRange,
		buildBaseUpdates: ({ value, param }) => {
			let updated = writeElementParamValue({
				element: renderElement,
				param,
				value,
			});
			const linkedUpdates = buildLinkedScaleUpdates({ value, equalScale });
			if (linkedUpdates["transform.scaleY"] === undefined) return updated;
			const scaleYParam = getElementParams({ element: updated }).find(
				(candidate) => candidate.key === "transform.scaleY",
			);
			if (!scaleYParam) return updated;
			updated = writeElementParamValue({
				element: updated,
				param: scaleYParam,
				value: linkedUpdates["transform.scaleY"],
			});
			return updated;
		},
	});
	const scaleY = useNumberParamControl({
		element: renderElement,
		trackId,
		paramKey: "transform.scaleY",
		localTime,
		isPlayheadWithinElementRange,
	});
	const positionX = useNumberParamControl({
		element: renderElement,
		trackId,
		paramKey: "transform.positionX",
		localTime,
		isPlayheadWithinElementRange,
	});
	const positionY = useNumberParamControl({
		element: renderElement,
		trackId,
		paramKey: "transform.positionY",
		localTime,
		isPlayheadWithinElementRange,
	});
	const rotate = useNumberParamControl({
		element: renderElement,
		trackId,
		paramKey: "transform.rotate",
		localTime,
		isPlayheadWithinElementRange,
	});

	const previewTrackOverlay = useEditor((currentEditor) =>
		currentEditor.timeline.getPreviewTracks(),
	);
	const committedTracks = useEditor(
		(currentEditor) => currentEditor.scenes.getActiveScene().tracks,
	);
	const previewTracks = previewTrackOverlay ?? committedTracks;
	const currentTime = useEditor((currentEditor) =>
		currentEditor.playback.getCurrentTime(),
	);
	const canvasSize = useEditor(
		(currentEditor) => currentEditor.project.getActive().settings.canvasSize,
	);
	const mediaAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets(),
	);
	const selectedBounds = getVisibleElementsWithBounds({
		tracks: previewTracks,
		currentTime,
		canvasSize,
		mediaAssets,
	}).find((item) => item.elementId === renderElement.id)?.bounds;

	const align = (alignment: JianyingAlignment) => {
		if (!selectedBounds) return;
		const radians = (selectedBounds.rotation * Math.PI) / 180;
		const horizontalExtent =
			(Math.abs(Math.cos(radians)) * selectedBounds.width +
				Math.abs(Math.sin(radians)) * selectedBounds.height) /
			2;
		const verticalExtent =
			(Math.abs(Math.sin(radians)) * selectedBounds.width +
				Math.abs(Math.cos(radians)) * selectedBounds.height) /
			2;

		if (
			alignment === "left" ||
			alignment === "horizontal-center" ||
			alignment === "right"
		) {
			const targetCenter =
				alignment === "left"
					? horizontalExtent
					: alignment === "right"
						? canvasSize.width - horizontalExtent
						: canvasSize.width / 2;
			positionX.onPreview(
				positionX.value + targetCenter - selectedBounds.cx,
			);
			positionX.onCommit();
			return;
		}

		const targetCenter =
			alignment === "top"
				? verticalExtent
				: alignment === "bottom"
					? canvasSize.height - verticalExtent
					: canvasSize.height / 2;
		positionY.onPreview(positionY.value + targetCenter - selectedBounds.cy);
		positionY.onCommit();
	};

	const resetTransform = () => {
		for (const control of [scaleX, scaleY, positionX, positionY, rotate]) {
			control.onPreview(control === scaleX || control === scaleY ? 1 : 0);
			control.onCommit();
		}
	};

	return (
		<>
			<JianyingPositionSizeControls
				scaleX={scaleX}
				scaleY={scaleY}
				positionX={positionX}
				positionY={positionY}
				rotate={rotate}
				equalScale={equalScale}
				onEqualScaleChange={(checked) => {
					setEqualScale(checked);
					if (checked && scaleX.value !== scaleY.value) {
						scaleY.onPreview(scaleX.value);
						scaleY.onCommit();
					}
				}}
				onAlign={align}
				onReset={resetTransform}
			/>
			<ElementParamsTab
				element={renderElement}
				trackId={trackId}
				paramKeys={VISUAL_BASIC_PARAM_KEYS}
				sections={VISUAL_PARAM_SECTIONS}
				sectionKey="visual-basic"
			/>
			<CapabilitySection
				id="stabilization"
				label="视频防抖"
				description="运动跟踪与稳定功能已保留在 AI效果；此处正在补齐剪映同款的一键防抖参数。"
			/>
			<CapabilitySection
				id="quality"
				label="一键画质提升"
				badge="AI"
				description="当前不会对预览做虚假增强；待超分与降噪模型接入后，此入口将直接控制实际渲染。"
			/>
		</>
	);
}
