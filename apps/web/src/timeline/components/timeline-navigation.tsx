"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
	FitToScreenIcon,
	FocusPointIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	getOverviewNavigationTarget,
	getOverviewViewport,
} from "@/timeline/navigation";
import { cn } from "@/utils/ui";

export interface TimelineOverviewItem {
	id: string;
	startRatio: number;
	durationRatio: number;
	lane: number;
}

export function TimelineNavigationControls({
	onFitTimeline,
	onRevealPlayhead,
}: {
	onFitTimeline: () => void;
	onRevealPlayhead: () => void;
}) {
	return (
		<div className="flex items-center gap-0.5">
			<Button
				variant="text"
				size="icon"
				className="size-8"
				aria-label="Fit entire timeline"
				title="Fit entire timeline"
				onClick={onFitTimeline}
			>
				<HugeiconsIcon icon={FitToScreenIcon} />
			</Button>
			<Button
				variant="text"
				size="icon"
				className="size-8"
				aria-label="Reveal playhead"
				title="Reveal playhead"
				onClick={onRevealPlayhead}
			>
				<HugeiconsIcon icon={FocusPointIcon} />
			</Button>
		</div>
	);
}

export function TimelineOverview({
	items,
	laneCount,
	scrollLeft,
	scrollWidth,
	viewportWidth,
	onNavigate,
	onFitTimeline,
	onRevealPlayhead,
}: {
	items: TimelineOverviewItem[];
	laneCount: number;
	scrollLeft: number;
	scrollWidth: number;
	viewportWidth: number;
	onNavigate: (scrollLeft: number) => void;
	onFitTimeline: () => void;
	onRevealPlayhead: () => void;
}) {
	const [isDragging, setIsDragging] = useState(false);
	const viewport = getOverviewViewport({
		scrollLeft,
		scrollWidth,
		viewportWidth,
	});
	const safeLaneCount = Math.max(1, laneCount);

	const navigate = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		onNavigate(
			getOverviewNavigationTarget({
				pointerOffset: event.clientX - rect.left,
				overviewWidth: rect.width,
				scrollWidth,
				viewportWidth,
			}),
		);
	};

	return (
		<div
			className="border-border/80 bg-background flex h-8 shrink-0 items-center border-t px-2"
			role="group"
			aria-label="Timeline overview"
		>
			<TimelineNavigationControls
				onFitTimeline={onFitTimeline}
				onRevealPlayhead={onRevealPlayhead}
			/>
			<div className="bg-border mx-1.5 h-4 w-px shrink-0" />
			<button
				type="button"
				className={cn(
					"bg-muted/45 ring-foreground/10 relative h-4 w-full cursor-pointer overflow-hidden rounded-sm ring-1",
					isDragging && "cursor-grabbing",
				)}
				aria-label="Navigate timeline overview"
				title="Click or drag to navigate the timeline"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					setIsDragging(true);
					navigate(event);
				}}
				onPointerMove={(event) => {
					if (isDragging) {
						navigate(event);
					}
				}}
				onPointerUp={(event) => {
					event.currentTarget.releasePointerCapture(event.pointerId);
					setIsDragging(false);
				}}
				onLostPointerCapture={() => setIsDragging(false)}
			>
				{items.map((item) => (
					<span
						key={item.id}
						data-overview-item={item.id}
						className="bg-primary/55 absolute min-w-px rounded-[1px]"
						style={{
							left: `${Math.max(0, Math.min(1, item.startRatio)) * 100}%`,
							width: `${Math.max(0.15, Math.min(1, item.durationRatio) * 100)}%`,
							top: `${(Math.max(0, item.lane) / safeLaneCount) * 100}%`,
							height: `${Math.max(18, 100 / safeLaneCount)}%`,
						}}
					/>
				))}
				<span
					role="img"
					aria-label="Visible timeline viewport"
					className="border-primary bg-primary/10 pointer-events-none absolute inset-y-0 rounded-[2px] border"
					style={{
						left: `${viewport.leftPercent}%`,
						width: `${viewport.widthPercent}%`,
					}}
				/>
			</button>
		</div>
	);
}
