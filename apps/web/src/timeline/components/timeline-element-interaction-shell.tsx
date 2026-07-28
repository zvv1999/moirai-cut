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
	onClick: MouseEventHandler<HTMLButtonElement>;
	onMouseDown: MouseEventHandler<HTMLButtonElement>;
}) {
	return (
		<>
			<button
				type="button"
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
			</button>
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
