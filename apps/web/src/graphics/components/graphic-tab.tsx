"use client";

import { useRef, useState } from "react";
import { ellipseArcState } from "../definitions/ellipse";
import { hasKeyframesForPath } from "@/animation";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import {
	useKeyframedParamProperty,
	type KeyframedParamPropertyResult,
} from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import type { ParamDefinition, ParamValues } from "@/params";
import type { GraphicElement } from "@/timeline";
import {
	graphicsRegistry,
	registerDefaultGraphics,
	resolveGraphicElementParamsAtTime,
} from "@/graphics";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useEditor } from "@/editor/use-editor";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import type { MediaTime } from "@/wasm";

registerDefaultGraphics();

const DEFAULT_STROKE_WIDTH = 2;

export function ellipseEditingIssue(
	element: GraphicElement,
	params: ParamValues,
): string | null {
	if (element.definitionId !== "ellipse") return null;
	// A reveal channel must remain supported through its open-path frames, not
	// merely look valid when the playhead happens to be on its completed frame.
	const animated = hasKeyframesForPath({
		animations: element.animations,
		propertyPath: "params.strokeReveal",
	});
	return ellipseArcState(animated ? { ...params, strokeReveal: 0.5 } : params)
		.issue;
}

export function GraphicTab({
	element,
	trackId,
}: {
	element: GraphicElement;
	trackId: string;
}) {
	const definition = graphicsRegistry.get(element.definitionId);
	const editor = useEditor();
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const liveElement = renderElement as GraphicElement;
	const resolvedParams = resolveGraphicElementParamsAtTime({
		element: liveElement,
		localTime,
	});

	const shapeParams = definition.params.filter((p) => p.group !== "stroke");
	const hasStrokeParams = definition.params.some((p) => p.group === "stroke");
	const arcIssue = ellipseEditingIssue(liveElement, resolvedParams);
	const needsArcPreparation =
		element.definitionId === "ellipse" &&
		!!ellipseArcState({ ...resolvedParams, strokeReveal: 0.5 }).issue;
	const prepareArc = () => {
		const animations = { ...liveElement.animations };
		delete animations["params.fill"];
		delete animations["params.strokeAlign"];
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						params: {
							...liveElement.params,
							fill: "#00000000",
							strokeAlign: "center",
						},
						animations,
					},
				},
			],
		});
	};

	return (
		<div className="flex flex-col">
			{element.definitionId === "ellipse" && (
				<div className="px-4 py-2 text-xs">
					<p>
						开口弧线与描边显现使用透明填充、中心描边。起点与扫角是静态几何；描边显现可添加关键帧。
					</p>
					{arcIssue && <p role="alert">{arcIssue}</p>}
					{needsArcPreparation && (
						<Button variant="outline" size="sm" onClick={prepareArc}>
							改为透明填充与中心描边（清除这两项动画）
						</Button>
					)}
				</div>
			)}
			<Section collapsible sectionKey={`${element.id}:graphic`}>
				<SectionHeader>
					<SectionTitle>{definition.name}</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						{shapeParams.map((param) => (
							<AnimatedGraphicParamField
								key={param.key}
								param={param}
								trackId={trackId}
								element={liveElement}
								localTime={localTime}
								isPlayheadWithinElementRange={isPlayheadWithinElementRange}
								resolvedParams={resolvedParams}
							/>
						))}
					</SectionFields>
				</SectionContent>
			</Section>
			{hasStrokeParams && <StrokeSection element={element} trackId={trackId} />}
		</div>
	);
}

function StrokeSection({
	element,
	trackId,
}: {
	element: GraphicElement;
	trackId: string;
}) {
	const editor = useEditor();
	const definition = graphicsRegistry.get(element.definitionId);
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const liveElement = renderElement as GraphicElement;
	const resolvedParams = resolveGraphicElementParamsAtTime({
		element: liveElement,
		localTime,
	});
	const strokeParams = definition.params.filter((p) => p.group === "stroke");
	const lastStrokeWidth = useRef(DEFAULT_STROKE_WIDTH);
	const isStrokeEnabled = Number(element.params.strokeWidth ?? 0) > 0;

	const toggleStroke = () => {
		if (isStrokeEnabled) {
			lastStrokeWidth.current = Number(
				element.params.strokeWidth ?? DEFAULT_STROKE_WIDTH,
			);
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: { params: { ...element.params, strokeWidth: 0 } },
					},
				],
			});
		} else {
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: {
							params: {
								...element.params,
								strokeWidth: lastStrokeWidth.current,
							},
						},
					},
				],
			});
		}
	};

	return (
		<Section
			collapsible
			defaultOpen={isStrokeEnabled}
			sectionKey={`${element.id}:stroke`}
		>
			<SectionHeader
				trailing={
					<Button
						variant="ghost"
						size="icon"
						onClick={(event) => {
							event.stopPropagation();
							toggleStroke();
						}}
					>
						<HugeiconsIcon
							icon={isStrokeEnabled ? MinusSignIcon : PlusSignIcon}
							strokeWidth={1}
						/>
					</Button>
				}
			>
				<SectionTitle>Stroke</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn(!isStrokeEnabled && "pointer-events-none opacity-50")}
			>
				<SectionFields>
					{strokeParams.map((param) => (
						<AnimatedGraphicParamField
							key={param.key}
							param={param}
							trackId={trackId}
							element={liveElement}
							localTime={localTime}
							isPlayheadWithinElementRange={isPlayheadWithinElementRange}
							resolvedParams={resolvedParams}
						/>
					))}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function AnimatedGraphicParamField({
	param,
	trackId,
	element,
	localTime,
	isPlayheadWithinElementRange,
	resolvedParams,
}: {
	key?: string;
	param: ParamDefinition;
	trackId: string;
	element: GraphicElement;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	resolvedParams: ParamValues;
}) {
	const [issue, setIssue] = useState<string | null>(null);
	const animatedParam: KeyframedParamPropertyResult = useKeyframedParamProperty(
		{
			param,
			trackId,
			elementId: element.id,
			animations: element.animations,
			elementStartTime: element.startTime,
			elementDuration: element.duration,
			localTime,
			isPlayheadWithinElementRange,
			resolvedValue: resolvedParams[param.key] ?? param.default,
			buildBaseUpdates: ({ value }) => ({
				params: {
					...element.params,
					[param.key]: value,
				},
			}),
		},
	);

	const preview = (value: number | string | boolean) => {
		const invalid = ellipseEditingIssue(element, {
			...resolvedParams,
			[param.key]: value,
		});
		if (invalid) {
			setIssue(invalid);
			return;
		}
		setIssue(null);
		animatedParam.onPreview(value);
	};
	const toggle = () => {
		if (param.key === "strokeReveal" && element.definitionId === "ellipse") {
			const invalid = ellipseArcState({
				...resolvedParams,
				strokeReveal: 0.5,
			}).issue;
			if (invalid && !animatedParam.isKeyframedAtTime) {
				setIssue(invalid);
				return;
			}
		}
		setIssue(null);
		animatedParam.toggleKeyframe();
	};
	return (
		<>
			<PropertyParamField
				param={param}
				value={resolvedParams[param.key] ?? param.default}
				onPreview={preview}
				onCommit={animatedParam.onCommit}
				keyframe={{
					isActive: animatedParam.isKeyframedAtTime,
					isDisabled: !isPlayheadWithinElementRange,
					keyframeCount: animatedParam.keyframeCount,
					canGoPrevious: animatedParam.canGoPrevious,
					canGoNext: animatedParam.canGoNext,
					onPrevious: animatedParam.goToPreviousKeyframe,
					onToggle: toggle,
					onNext: animatedParam.goToNextKeyframe,
				}}
			/>
			{issue && (
				<p role="alert" className="text-xs">
					{issue}
				</p>
			)}
		</>
	);
}
