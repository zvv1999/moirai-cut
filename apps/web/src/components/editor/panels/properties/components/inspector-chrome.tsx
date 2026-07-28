"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { TimelineElement } from "@/timeline";
import { mediaTimeToSeconds, type MediaTime } from "@/wasm";
import { cn } from "@/utils/ui";

export type InspectorTabItem = {
	id: string;
	label: string;
	icon: ReactNode;
};

const ELEMENT_TYPE_LABELS: Record<TimelineElement["type"], string> = {
	video: "Video clip",
	image: "Image clip",
	audio: "Audio clip",
	text: "Text",
	sticker: "Sticker",
	graphic: "Graphic",
	effect: "Effect",
};

export function formatInspectorDuration({
	duration,
}: {
	duration: MediaTime;
}): string {
	const totalHundredths = Math.max(
		0,
		Math.round(mediaTimeToSeconds({ time: duration }) * 100),
	);
	const hundredths = totalHundredths % 100;
	const totalSeconds = Math.floor(totalHundredths / 100);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	return [hours, minutes, seconds]
		.map((part) => part.toString().padStart(2, "0"))
		.join(":")
		.concat(".", hundredths.toString().padStart(2, "0"));
}

export function InspectorSelectionHeader({
	name,
	type,
	duration,
	trackName,
}: {
	name: string;
	type: TimelineElement["type"];
	duration: MediaTime;
	trackName: string;
}) {
	return (
		<section
			className="border-b px-3 py-3"
			aria-label={`Selected ${type}: ${name}`}
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-[10px] font-bold tracking-[0.14em] uppercase">
					Basic
				</p>
				<span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold">
					{ELEMENT_TYPE_LABELS[type]}
				</span>
			</div>
			<p className="truncate text-sm font-semibold" title={name}>
				{name}
			</p>
			<dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
				<dt>Duration</dt>
				<dd className="text-foreground text-right font-mono">
					{formatInspectorDuration({ duration })}
				</dd>
				<dt>Track</dt>
				<dd className="text-foreground truncate text-right" title={trackName}>
					{trackName}
				</dd>
			</dl>
		</section>
	);
}

export function InspectorTabNavigation({
	tabs,
	activeTabId,
	onSelect,
}: {
	tabs: InspectorTabItem[];
	activeTabId: string;
	onSelect: (tabId: string) => void;
}) {
	return (
		<div
			role="tablist"
			aria-label="Inspector sections"
			className="scrollbar-hidden flex shrink-0 gap-1 overflow-x-auto border-b p-1.5"
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTabId;
				return (
					<Button
						key={tab.id}
						role="tab"
						type="button"
						size="sm"
						variant={isActive ? "secondary" : "ghost"}
						aria-selected={isActive}
						aria-controls={`inspector-panel-${tab.id}`}
						title={tab.label}
						onClick={() => onSelect(tab.id)}
						className={cn(
							"h-7 shrink-0 gap-1.5 px-2 text-xs",
							!isActive && "text-muted-foreground",
						)}
					>
						{tab.icon}
						<span>{tab.label}</span>
					</Button>
				);
			})}
		</div>
	);
}
