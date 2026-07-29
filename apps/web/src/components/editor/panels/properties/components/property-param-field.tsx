"use client";

import type {
	ParamDefinition,
	NumberParamDefinition,
	ParamValue,
} from "@/params";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { usePropertyDraft } from "../hooks/use-property-draft";
import { KeyframeControls } from "./keyframe-controls";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

export function PropertyParamField({
	param,
	value,
	onPreview,
	onCommit,
	keyframe,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onPreview: (value: ParamValue) => void;
	onCommit: () => void;
	keyframe?: {
		isActive: boolean;
		isDisabled: boolean;
		keyframeCount?: number;
		canGoPrevious?: boolean;
		canGoNext?: boolean;
		onPrevious?: () => void;
		onToggle: () => void;
		onNext?: () => void;
	};
}) {
	const isDefault = value === param.default;
	const reset = () => {
		onPreview(param.default);
		onCommit();
	};

	return (
		<div
			className="group grid min-h-9 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 py-1"
			data-inspector-field="row"
		>
			<Label className="text-muted-foreground truncate text-[12px] font-normal">
				{param.label}
			</Label>
			<div className="min-w-0">
				<ParamInput
					param={param}
					value={value}
					onPreview={onPreview}
					onCommit={onCommit}
				/>
			</div>
			<div className="flex min-w-6 items-center justify-end gap-0.5">
				<Button
					type="button"
					variant="text"
					size="icon"
					className="text-muted-foreground size-5 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-20"
					aria-label={`重置 ${param.label}`}
					title={`重置 ${param.label}`}
					disabled={isDefault}
					onClick={reset}
				>
					<HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3.5" />
				</Button>
				{keyframe && param.keyframable !== false ? (
					<KeyframeControls
						label={param.label}
						isActive={keyframe.isActive}
						isDisabled={keyframe.isDisabled}
						keyframeCount={keyframe.keyframeCount ?? 0}
						canGoPrevious={keyframe.canGoPrevious ?? false}
						canGoNext={keyframe.canGoNext ?? false}
						onPrevious={() => keyframe.onPrevious?.()}
						onToggle={keyframe.onToggle}
						onNext={() => keyframe.onNext?.()}
					/>
				) : null}
			</div>
		</div>
	);
}

function ParamInput({
	param,
	value,
	onPreview,
	onCommit,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onPreview: (value: ParamValue) => void;
	onCommit: () => void;
}) {
	if (param.type === "number") {
		return (
			<NumberParamField
				param={param}
				label={param.label}
				value={typeof value === "number" ? value : Number(value)}
				onPreview={onPreview}
				onCommit={onCommit}
			/>
		);
	}

	if (param.type === "boolean") {
		return (
			<Switch
				checked={Boolean(value)}
				onCheckedChange={(checked) => {
					onPreview(checked);
					onCommit();
				}}
			/>
		);
	}

	if (param.type === "select") {
		return (
			<Select
				value={String(value)}
				onValueChange={(selected) => {
					onPreview(selected);
					onCommit();
				}}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{param.options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (param.type === "color") {
		return (
			<ColorPicker
				value={String(value).replace(/^#/, "").toUpperCase()}
				onChange={(color) => onPreview(`#${color}`)}
				onChangeEnd={(color) => {
					onPreview(`#${color}`);
					onCommit();
				}}
			/>
		);
	}

	if (param.type === "text") {
		return (
			<Textarea
				value={String(value)}
				onChange={(event) => onPreview(event.currentTarget.value)}
				onBlur={onCommit}
			/>
		);
	}

	if (param.type === "font") {
		return (
			<input
				className="border-input bg-accent h-9 w-full rounded-md border px-3 text-sm outline-none"
				value={String(value)}
				onChange={(event) => onPreview(event.currentTarget.value)}
				onBlur={onCommit}
			/>
		);
	}

	return null;
}

function NumberParamField({
	param,
	label,
	value,
	onPreview,
	onCommit,
}: {
	param: NumberParamDefinition;
	label: string;
	value: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
}) {
	const { min, max, step, displayMultiplier = 1 } = param;
	const displayValue = value * displayMultiplier;
	const displayMin = min * displayMultiplier;
	const displayMax = max === undefined ? undefined : max * displayMultiplier;
	const displayStep = step * displayMultiplier;
	const clampDisplayValue = (nextDisplayValue: number) =>
		Math.max(
			displayMin,
			displayMax !== undefined
				? Math.min(displayMax, nextDisplayValue)
				: nextDisplayValue,
		);

	const previewFromDisplay = (displayVal: number) => {
		const clamped = clampDisplayValue(
			snapToStep({ value: displayVal, step: displayStep }),
		);
		onPreview(clamped / displayMultiplier);
	};

	const maxFractionDigits = getFractionDigitsForStep({ step: displayStep });

	const draft = usePropertyDraft({
		displayValue: formatNumberForDisplay({
			value: displayValue,
			maxFractionDigits,
		}),
		parse: (input) => {
			const parsed = parseFloat(input);
			if (Number.isNaN(parsed)) return null;
			return clampDisplayValue(
				snapToStep({ value: parsed, step: displayStep }),
			);
		},
		onPreview: previewFromDisplay,
		onCommit,
	});

	const softSliderMax = param.key.startsWith("transform.scale")
		? 500
		: undefined;
	const sliderMax = displayMax ?? softSliderMax;
	const hasSlider =
		sliderMax !== undefined &&
		Number.isFinite(sliderMax) &&
		sliderMax > displayMin;
	const sliderValue =
		sliderMax === undefined
			? displayValue
			: Math.min(sliderMax, Math.max(displayMin, displayValue));
	const suffix =
		displayMultiplier === 100
			? "%"
			: param.key === "transform.rotate"
				? "°"
				: undefined;

	return (
		<div className="flex min-w-0 items-center gap-2">
			{hasSlider ? (
				<input
					type="range"
					aria-label={`${label}滑杆`}
					className="inspector-range min-w-12 flex-1"
					min={displayMin}
					max={sliderMax}
					step={displayStep}
					value={sliderValue}
					onChange={(event) =>
						previewFromDisplay(Number(event.currentTarget.value))
					}
					onPointerUp={onCommit}
					onBlur={onCommit}
				/>
			) : null}
			<NumberField
				icon={param.shortLabel}
				suffix={suffix}
				suffixClassName="text-muted-foreground"
				className={cn(hasSlider ? "w-[92px] shrink-0" : "w-full")}
				value={draft.displayValue}
				dragSensitivity="slow"
				isDefault={value === param.default}
				onFocus={draft.onFocus}
				onChange={draft.onChange}
				onBlur={draft.onBlur}
				onScrub={previewFromDisplay}
				onScrubEnd={onCommit}
			/>
		</div>
	);
}
