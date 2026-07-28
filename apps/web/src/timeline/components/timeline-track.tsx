"use client";

import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TimelineElement } from "./timeline-element";
import type { TimelineTrack } from "@/timeline";
import type { TimelineElement as TimelineElementType } from "@/timeline";
import { TIMELINE_LAYERS } from "./layers";
import type { ElementDragView } from "@/timeline";
import { useTimelineStore } from "@/timeline/timeline-store";
import { selectTimelineRenderElements } from "@/project/large-project-performance";

interface TimelineTrackContentProps {
	track: TimelineTrack;
	zoomLevel: number;
	dragView: ElementDragView;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onTrackMouseDown?: (event: React.MouseEvent) => void;
	onTrackMouseUp?: (event: React.MouseEvent) => void;
	shouldIgnoreClick?: () => boolean;
	targetElementId?: string | null;
	renderWindow?: {
		startTime: number;
		endTime: number;
		overscan: number;
	};
}

export function TimelineTrackContent({
	track,
	zoomLevel,
	dragView,
	onResizeStart,
	onElementMouseDown,
	onElementClick,
	onTrackMouseDown,
	onTrackMouseUp,
	shouldIgnoreClick,
	targetElementId = null,
	renderWindow,
}: TimelineTrackContentProps) {
	const { isElementSelected, selectedElements } = useElementSelection();
	const expandedElementIds = useTimelineStore(
		(state) => state.expandedElementIds,
	);
	const pinnedIds = new Set(
		selectedElements
			.filter((selection) => selection.trackId === track.id)
			.map((selection) => selection.elementId),
	);
	for (const elementId of expandedElementIds) pinnedIds.add(elementId);
	if (targetElementId) pinnedIds.add(targetElementId);
	if (dragView.kind === "dragging") {
		for (const elementId of dragView.memberTimeOffsets.keys()) {
			pinnedIds.add(elementId);
		}
	}
	const allElements: TimelineElementType[] = [];
	for (const element of track.elements) allElements.push(element);
	const renderedElements = renderWindow
		? selectTimelineRenderElements({
				elements: allElements,
				viewportStart: renderWindow.startTime,
				viewportEnd: renderWindow.endTime,
				overscan: renderWindow.overscan,
				pinnedIds,
			}).elements
		: allElements;

	return (
		<div
			className="relative size-full"
			data-track-locked={track.locked ? "true" : "false"}
		>
			<button
				type="button"
				className="absolute inset-0 m-0 size-full appearance-none border-0 bg-transparent p-0"
				aria-label={`Select ${track.name} track`}
				onMouseUp={(event) => {
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			/>
			{/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- spatial gesture surface; the wrapping <button> handles keyboard track selection, this <div> only forwards background clicks for box-select / deselect. */}
			<div
				className={`relative h-full min-w-full ${track.locked ? "bg-amber-500/5" : ""}`}
				style={{ zIndex: TIMELINE_LAYERS.trackContent }}
				onMouseUp={(event) => {
					if (event.target !== event.currentTarget) return;
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			>
				{track.elements.length === 0 ? (
					<div className="text-muted-foreground border-muted/30 pointer-events-none flex size-full items-center justify-center rounded-sm border-2 border-dashed text-xs" />
				) : (
					renderedElements.map((element) => {
						const isSelected = isElementSelected({
							trackId: track.id,
							elementId: element.id,
						});

						return (
							<TimelineElement
								key={element.id}
								element={element}
								track={track}
								zoomLevel={zoomLevel}
								isSelected={isSelected}
								onResizeStart={({ event, element, side }) =>
									!track.locked &&
									onResizeStart({ event, element, track, side })
								}
								onElementMouseDown={({ event, element }) =>
									!track.locked && onElementMouseDown({ event, element, track })
								}
								onElementClick={({ event, element }) =>
									onElementClick({ event, element, track })
								}
								dragView={dragView}
								isDropTarget={element.id === targetElementId}
							/>
						);
					})
				)}
			</div>
		</div>
	);
}
