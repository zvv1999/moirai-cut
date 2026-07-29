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
	video: "视频",
	image: "图片",
	audio: "音频",
	text: "文本",
	sticker: "贴纸",
	graphic: "图形",
	effect: "特效",
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
			className="sr-only"
			aria-label={`已选${ELEMENT_TYPE_LABELS[type]}：${name}`}
			data-inspector-context="selected-clip"
		>
			<span>{ELEMENT_TYPE_LABELS[type]}</span>
			<span>{name}</span>
			<dl>
				<div>
					<dt>时长</dt>
					<dd>{formatInspectorDuration({ duration })}</dd>
				</div>
				<div>
					<dt>轨道</dt>
					<dd>{trackName}</dd>
				</div>
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
			aria-label="属性分类"
			data-inspector-tabs="clip-properties"
			className="scrollbar-hidden border-border/70 flex h-[50px] shrink-0 items-stretch justify-between gap-1 overflow-x-auto border-b px-3"
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTabId;
				return (
					<Button
						key={tab.id}
						role="tab"
						type="button"
						size="sm"
						variant="ghost"
						aria-selected={isActive}
						aria-controls={`inspector-panel-${tab.id}`}
						data-active={isActive}
						title={tab.label}
						onClick={() => onSelect(tab.id)}
						className={cn(
							"relative h-auto min-w-0 shrink-0 rounded-none border-0 px-1 text-[13px] font-medium hover:bg-transparent",
							"after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform",
							isActive
								? "text-primary after:scale-x-100"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<span className="sr-only" aria-hidden="true">
							{tab.icon}
						</span>
						<span>{tab.label}</span>
					</Button>
				);
			})}
		</div>
	);
}
