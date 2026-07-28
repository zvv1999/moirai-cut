"use client";

import type { MouseEventHandler, ReactNode } from "react";

export function TimelineElementInteractionShell({
	baseTrackHeight,
	clipContent,
	expandedContent,
	onClick,
	onMouseDown,
}: {
	baseTrackHeight: number;
	clipContent: ReactNode;
	expandedContent: ReactNode;
	onClick: MouseEventHandler<HTMLButtonElement>;
	onMouseDown: MouseEventHandler<HTMLButtonElement>;
}) {
	return (
		<>
			<button
				type="button"
				tabIndex={-1}
				className="absolute inset-x-0 top-0 flex"
				style={{ height: `${baseTrackHeight}px` }}
				onClick={onClick}
				onMouseDown={onMouseDown}
			>
				{clipContent}
			</button>
			{expandedContent && (
				<div
					className="absolute inset-x-0 bottom-0"
					style={{ top: `${baseTrackHeight}px` }}
				>
					{expandedContent}
				</div>
			)}
		</>
	);
}
