"use client";

import type {
	PrecisionTrimAvailability,
	PrecisionTrimMode,
} from "@/timeline/precision-trim";
import {
	getPrecisionTrimModeAvailability,
	getPrecisionTrimModeDescription,
	resolveActiveTrimMode,
} from "@/timeline/precision-trim";
import { cn } from "@/utils/ui";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { useTimelineStore } from "@/timeline/timeline-store";

const MODE_LABELS: Record<PrecisionTrimMode, string> = {
	standard: "普通",
	ripple: "联动",
	roll: "滚动",
	slip: "滑移",
	slide: "滑动",
};

const MODE_ARIA_LABELS: Record<PrecisionTrimMode, string> = {
	standard: "普通修剪",
	ripple: "联动修剪",
	roll: "滚动编辑",
	slip: "滑移编辑",
	slide: "滑动编辑",
};

const PRECISION_TRIM_MODES: readonly PrecisionTrimMode[] = [
	"standard",
	"ripple",
	"roll",
	"slip",
	"slide",
];

export type PrecisionTrimAvailabilityMap = Record<
	PrecisionTrimMode,
	PrecisionTrimAvailability
>;

export function PrecisionTrimModeSelectorView({
	activeMode,
	availability,
	onSelect,
}: {
	activeMode: PrecisionTrimMode;
	availability: PrecisionTrimAvailabilityMap;
	onSelect: (mode: PrecisionTrimMode) => void;
}) {
	return (
		<div
			className="border-border/80 bg-muted/10 flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b px-2 scrollbar-hidden"
			role="group"
			aria-label="精确修剪工具"
		>
			<span className="text-muted-foreground mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]">
				修剪
			</span>
			{PRECISION_TRIM_MODES.map((mode) => {
				const modeAvailability = availability[mode];
				const baseLabel = MODE_ARIA_LABELS[mode];
				const label = modeAvailability.available
					? baseLabel
					: `${baseLabel}: ${modeAvailability.reason}`;
				const description = getPrecisionTrimModeDescription({ mode });
				return (
					<button
						key={mode}
						type="button"
						aria-label={label}
						aria-pressed={activeMode === mode}
						title={`${label} · ${description}`}
						disabled={!modeAvailability.available}
						className={cn(
							"border-border bg-background text-muted-foreground h-6 shrink-0 rounded border px-2 text-[10px] font-medium transition-colors",
							activeMode === mode &&
								"border-primary/40 bg-primary/10 text-primary",
							!modeAvailability.available && "cursor-not-allowed opacity-40",
						)}
						onClick={() => onSelect(mode)}
					>
						{MODE_LABELS[mode]}
					</button>
				);
			})}
			<span className="text-muted-foreground ml-auto shrink-0 text-[9px]">
				拖动已选素材的边缘
			</span>
		</div>
	);
}

export function PrecisionTrimModeSelector() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);
	const precisionMode = useTimelineStore((state) => state.precisionTrimMode);
	const setPrecisionTrimMode = useTimelineStore(
		(state) => state.setPrecisionTrimMode,
	);
	const selection =
		selectedElements.length === 1
			? (editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				})[0] ?? null)
			: null;
	const trackElements = selection
		? selection.track.elements.map((element) => ({
				...element,
				retime:
					element.type === "video" || element.type === "audio"
						? element.retime
						: undefined,
			}))
		: [];
	const getAvailability = (mode: PrecisionTrimMode) =>
		getPrecisionTrimModeAvailability({
			mode,
			elementId: selection?.element.id ?? null,
			elements: trackElements,
		});
	const availability: PrecisionTrimAvailabilityMap = {
		standard: getAvailability("standard"),
		ripple: getAvailability("ripple"),
		roll: getAvailability("roll"),
		slip: getAvailability("slip"),
		slide: getAvailability("slide"),
	};

	return (
		<PrecisionTrimModeSelectorView
			activeMode={resolveActiveTrimMode({
				precisionMode,
				rippleEditingEnabled,
			})}
			availability={availability}
			onSelect={setPrecisionTrimMode}
		/>
	);
}
