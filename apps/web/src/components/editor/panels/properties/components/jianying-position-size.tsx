"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	AlignBottomIcon,
	AlignHorizontalCenterIcon,
	AlignLeftIcon,
	AlignRightIcon,
	AlignTopIcon,
	AlignVerticalCenterIcon,
	ArrowTurnBackwardIcon,
	RotateClockwiseIcon,
} from "@hugeicons/core-free-icons";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/ui";
import { KeyframeControls } from "./keyframe-controls";

export type JianyingAlignment =
	| "left"
	| "horizontal-center"
	| "right"
	| "top"
	| "vertical-center"
	| "bottom";

type KeyframeState = {
	isActive: boolean;
	isDisabled: boolean;
	keyframeCount: number;
	canGoPrevious: boolean;
	canGoNext: boolean;
	onPrevious: () => void;
	onToggle: () => void;
	onNext: () => void;
};

export type JianyingNumberControl = {
	value: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
	keyframe?: KeyframeState;
};

export function buildLinkedScaleUpdates({
	value,
	equalScale,
}: {
	value: number;
	equalScale: boolean;
}): Record<string, number> {
	return {
		"transform.scaleX": value,
		...(equalScale ? { "transform.scaleY": value } : {}),
	};
}

const ALIGNMENTS: Array<{
	id: JianyingAlignment;
	label: string;
	icon:
		| typeof AlignLeftIcon
		| typeof AlignHorizontalCenterIcon
		| typeof AlignRightIcon
		| typeof AlignTopIcon
		| typeof AlignVerticalCenterIcon
		| typeof AlignBottomIcon;
}> = [
	{ id: "left", label: "左对齐", icon: AlignLeftIcon },
	{
		id: "horizontal-center",
		label: "水平居中",
		icon: AlignHorizontalCenterIcon,
	},
	{ id: "right", label: "右对齐", icon: AlignRightIcon },
	{ id: "top", label: "顶部对齐", icon: AlignTopIcon },
	{
		id: "vertical-center",
		label: "垂直居中",
		icon: AlignVerticalCenterIcon,
	},
	{ id: "bottom", label: "底部对齐", icon: AlignBottomIcon },
];

function FieldKeyframes({
	label,
	keyframe,
}: {
	label: string;
	keyframe?: KeyframeState;
}) {
	if (!keyframe) return <div className="w-[63px]" aria-hidden="true" />;
	return (
		<KeyframeControls
			label={label}
			isActive={keyframe.isActive}
			isDisabled={keyframe.isDisabled}
			keyframeCount={keyframe.keyframeCount}
			canGoPrevious={keyframe.canGoPrevious}
			canGoNext={keyframe.canGoNext}
			onPrevious={keyframe.onPrevious}
			onToggle={keyframe.onToggle}
			onNext={keyframe.onNext}
		/>
	);
}

function InspectorNumberField({
	label,
	control,
	icon,
	suffix,
	displayMultiplier = 1,
	className,
}: {
	label: string;
	control: JianyingNumberControl;
	icon?: React.ReactNode;
	suffix?: string;
	displayMultiplier?: number;
	className?: string;
}) {
	const displayValue = control.value * displayMultiplier;
	const previewDisplayValue = (value: number) => {
		if (Number.isFinite(value)) control.onPreview(value / displayMultiplier);
	};

	return (
		<NumberField
			aria-label={label}
			icon={icon}
			suffix={suffix}
			suffixClassName="text-muted-foreground"
			className={cn("text-foreground h-7 rounded-[5px]", className)}
			value={Number.isInteger(displayValue) ? displayValue : displayValue.toFixed(2)}
			dragSensitivity="slow"
			onChange={(event) =>
				previewDisplayValue(Number(event.currentTarget.value))
			}
			onBlur={control.onCommit}
			onScrub={previewDisplayValue}
			onScrubEnd={control.onCommit}
		/>
	);
}

function PropertyRow({
	label,
	children,
	keyframe,
}: {
	label: string;
	children: React.ReactNode;
	keyframe?: KeyframeState;
}) {
	return (
		<div
			className="grid min-h-10 grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-2"
			data-inspector-field="row"
		>
			<span className="text-muted-foreground text-[12px]">{label}</span>
			<div className="min-w-0">{children}</div>
			<FieldKeyframes label={label} keyframe={keyframe} />
		</div>
	);
}

export function JianyingPositionSizeControls({
	scaleX,
	scaleY,
	positionX,
	positionY,
	rotate,
	equalScale,
	onEqualScaleChange,
	onAlign,
	onReset,
}: {
	scaleX: JianyingNumberControl;
	scaleY: JianyingNumberControl;
	positionX: JianyingNumberControl;
	positionY: JianyingNumberControl;
	rotate: JianyingNumberControl;
	equalScale: boolean;
	onEqualScaleChange: (checked: boolean) => void;
	onAlign: (alignment: JianyingAlignment) => void;
	onReset: () => void;
}) {
	return (
		<Section
			sectionKey="jianying-position-size"
			collapsible
			defaultOpen
			showBottomBorder
			className="border-border/70"
		>
			<div data-inspector-section="position-size">
				<SectionHeader
					className="h-12 px-4"
					actions={
						<div className="flex items-center gap-1">
							<Button
								type="button"
								variant="text"
								size="icon"
								className="text-muted-foreground size-6 rounded-sm"
								aria-label="重置位置大小"
								title="重置位置大小"
								onClick={onReset}
							>
								<HugeiconsIcon
									icon={ArrowTurnBackwardIcon}
									className="size-3.5"
								/>
							</Button>
							<FieldKeyframes
								label="位置大小"
								keyframe={positionX.keyframe}
							/>
						</div>
					}
				>
					<SectionTitle className="text-[13px] font-medium">
						位置大小
					</SectionTitle>
				</SectionHeader>
				<SectionContent className="px-4 pb-4 pt-0">
					<div className="flex flex-col gap-0.5">
						<PropertyRow label="缩放" keyframe={scaleX.keyframe}>
							<div className="flex min-w-0 items-center gap-2">
								<input
									type="range"
									aria-label="缩放滑杆"
									className="inspector-range min-w-16 flex-1"
									min={1}
									max={500}
									step={1}
									value={Math.min(500, Math.max(1, scaleX.value * 100))}
									onChange={(event) =>
										scaleX.onPreview(Number(event.currentTarget.value) / 100)
									}
									onPointerUp={scaleX.onCommit}
									onBlur={scaleX.onCommit}
								/>
								<InspectorNumberField
									label="缩放"
									control={scaleX}
									suffix="%"
									displayMultiplier={100}
									className="w-[78px] shrink-0"
								/>
							</div>
						</PropertyRow>

						<div className="grid min-h-10 grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-2">
							<span className="text-muted-foreground text-[12px]">
								等比缩放
							</span>
							<Switch
								aria-label="等比缩放"
								checked={equalScale}
								onCheckedChange={onEqualScaleChange}
							/>
							<div className="w-[63px]" aria-hidden="true" />
						</div>

						{!equalScale ? (
							<PropertyRow label="纵向缩放" keyframe={scaleY.keyframe}>
								<InspectorNumberField
									label="纵向缩放"
									control={scaleY}
									icon="Y"
									suffix="%"
									displayMultiplier={100}
								/>
							</PropertyRow>
						) : null}

						<PropertyRow label="位置" keyframe={positionX.keyframe}>
							<div className="grid min-w-0 grid-cols-2 gap-2">
								<InspectorNumberField
									label="位置 X"
									control={positionX}
									icon="X"
								/>
								<InspectorNumberField
									label="位置 Y"
									control={positionY}
									icon="Y"
								/>
							</div>
						</PropertyRow>

						<PropertyRow label="旋转" keyframe={rotate.keyframe}>
							<div className="flex items-center gap-2">
								<InspectorNumberField
									label="旋转"
									control={rotate}
									icon={
										<HugeiconsIcon
											icon={RotateClockwiseIcon}
											className="size-3.5"
										/>
									}
									suffix="°"
									className="w-[108px]"
								/>
								<div
									className="border-border bg-accent relative size-7 shrink-0 rounded-full border"
									aria-hidden="true"
								>
									<span
										className="bg-primary absolute left-1/2 top-1/2 h-[9px] w-px origin-bottom"
										style={{
											transform: `translate(-50%, -100%) rotate(${rotate.value}deg)`,
										}}
									/>
								</div>
							</div>
						</PropertyRow>

						<div
							className="bg-accent mt-1 grid h-8 grid-cols-6 overflow-hidden rounded-[5px]"
							role="group"
							aria-label="画面对齐"
						>
							{ALIGNMENTS.map((alignment) => (
								<Button
									key={alignment.id}
									type="button"
									variant="text"
									size="icon"
									className="text-muted-foreground hover:bg-muted hover:text-foreground h-8 w-full rounded-none"
									aria-label={alignment.label}
									title={alignment.label}
									onClick={() => onAlign(alignment.id)}
								>
									<HugeiconsIcon icon={alignment.icon} className="size-4" />
								</Button>
							))}
						</div>
					</div>
				</SectionContent>
			</div>
		</Section>
	);
}
