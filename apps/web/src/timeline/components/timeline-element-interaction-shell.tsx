"use client";

import type { MouseEventHandler, ReactNode } from "react";

export function TimelineElementInteractionShell({
	baseTrackHeight,
	clipContent,
	expandedContent,
	elementId,
	trackId,
	label,
	isSelected = false,
	onClick,
	onMouseDown,
}: {
	baseTrackHeight: number;
	clipContent: ReactNode;
	expandedContent: ReactNode;
	elementId?: string;
	trackId?: string;
	label?: string;
	isSelected?: boolean;
	onClick: MouseEventHandler<HTMLDivElement>;
	onMouseDown: MouseEventHandler<HTMLDivElement>;
}) {
	return (
		<>
			{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the clip surface is selected by pointer; keyboard editing is provided by global timeline shortcuts. A non-button surface permits dedicated controls inside the clip. */}
			<div
				role="button"
				tabIndex={-1}
				aria-label={label}
				aria-pressed={isSelected}
				data-element-id={elementId}
				data-track-id={trackId}
				className="absolute inset-x-0 top-0 flex overflow-hidden rounded-sm"
				style={{ height: `${baseTrackHeight}px` }}
				onClick={onClick}
				onMouseDown={onMouseDown}
			>
				{clipContent}
			</div>
			{expandedContent && (
				<div
					className="absolute inset-x-0 bottom-0 z-20"
					style={{ top: `${baseTrackHeight}px` }}
				>
					{expandedContent}
				</div>
			)}
		</>
	);
}
