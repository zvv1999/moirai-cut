"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AudioCapableElement } from "@/timeline/audio-state";
import {
	getAudioFadeDurations,
	setAudioFadeDuration,
} from "@/timeline/audio-envelope";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { TICKS_PER_SECOND } from "@/wasm";

type FadeSide = "in" | "out";

export function AudioFadeHandles({
	element,
	trackId,
	height,
}: {
	element: AudioCapableElement;
	trackId: string;
	height: number;
}) {
	const editor = useEditor();
	const surfaceRef = useRef<HTMLDivElement>(null);
	const dragSideRef = useRef<FadeSide | null>(null);
	const startElementRef = useRef(element);
	const [dragSide, setDragSide] = useState<FadeSide | null>(null);
	const [tooltip, setTooltip] = useState<{
		x: number;
		y: number;
		label: string;
	} | null>(null);
	const { fadeInSeconds, fadeOutSeconds } = getAudioFadeDurations({ element });
	const durationSeconds = Math.max(0, element.duration / TICKS_PER_SECOND);
	const fadeInPercent =
		durationSeconds > 0 ? (fadeInSeconds / durationSeconds) * 100 : 0;
	const fadeOutPercent =
		durationSeconds > 0 ? (fadeOutSeconds / durationSeconds) * 100 : 0;

	const updateFromPointer = useCallback(
		({
			side,
			clientX,
			clientY,
		}: {
			side: FadeSide;
			clientX: number;
			clientY: number;
		}) => {
			const rect = surfaceRef.current?.getBoundingClientRect();
			if (!rect || rect.width <= 0) return;
			const progress = Math.min(
				1,
				Math.max(0, (clientX - rect.left) / rect.width),
			);
			const requestedSeconds =
				side === "in"
					? progress * durationSeconds
					: (1 - progress) * durationSeconds;
			const nextElement = setAudioFadeDuration({
				element: startElementRef.current,
				side,
				seconds: requestedSeconds,
			});
			const next = getAudioFadeDurations({ element: nextElement });
			const seconds = side === "in" ? next.fadeInSeconds : next.fadeOutSeconds;

			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: { params: nextElement.params },
					},
				],
			});
			setTooltip({
				x: clientX + 10,
				y: clientY - 8,
				label: `${side === "in" ? "Fade in" : "Fade out"} ${seconds.toFixed(2)}s`,
			});
		},
		[durationSeconds, editor.timeline, element.id, trackId],
	);

	const finishDrag = useCallback(
		({ shouldCommit }: { shouldCommit: boolean }) => {
			if (shouldCommit) editor.timeline.commitPreview();
			else editor.timeline.discardPreview();
			dragSideRef.current = null;
			setDragSide(null);
			setTooltip(null);
		},
		[editor.timeline],
	);

	useEffect(() => {
		if (!dragSide) return;

		const handlePointerMove = (event: PointerEvent) => {
			const side = dragSideRef.current;
			if (!side) return;
			event.preventDefault();
			updateFromPointer({
				side,
				clientX: event.clientX,
				clientY: event.clientY,
			});
		};
		const handlePointerUp = (event: PointerEvent) => {
			if (!dragSideRef.current) return;
			event.preventDefault();
			finishDrag({ shouldCommit: true });
		};
		const handlePointerCancel = (event: PointerEvent) => {
			if (!dragSideRef.current) return;
			event.preventDefault();
			finishDrag({ shouldCommit: false });
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerCancel);
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerCancel);
		};
	}, [dragSide, finishDrag, updateFromPointer]);

	const handlePointerDown = ({
		event,
		side,
	}: {
		event: React.PointerEvent<HTMLButtonElement>;
		side: FadeSide;
	}) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		editor.selection.setSelectedElements({
			elements: [{ trackId, elementId: element.id }],
		});
		startElementRef.current = element;
		dragSideRef.current = side;
		setDragSide(side);
		updateFromPointer({ side, clientX: event.clientX, clientY: event.clientY });
	};

	return (
		<div
			ref={surfaceRef}
			className="pointer-events-none absolute inset-x-0 top-0 z-20 overflow-hidden rounded-sm"
			style={{ height }}
			data-audio-fades={`${fadeInSeconds.toFixed(2)}:${fadeOutSeconds.toFixed(2)}`}
		>
			{fadeInSeconds > 0 && (
				<div
					className="absolute inset-y-0 left-0 bg-black/30"
					style={{
						width: `${fadeInPercent}%`,
						clipPath: "polygon(0 0, 100% 0, 0 100%)",
					}}
				/>
			)}
			{fadeOutSeconds > 0 && (
				<div
					className="absolute inset-y-0 right-0 bg-black/30"
					style={{
						width: `${fadeOutPercent}%`,
						clipPath: "polygon(0 0, 100% 0, 100% 100%)",
					}}
				/>
			)}
			<FadeHandle
				side="in"
				percent={fadeInPercent}
				seconds={fadeInSeconds}
				isDragging={dragSide === "in"}
				onPointerDown={handlePointerDown}
			/>
			<FadeHandle
				side="out"
				percent={100 - fadeOutPercent}
				seconds={fadeOutSeconds}
				isDragging={dragSide === "out"}
				onPointerDown={handlePointerDown}
			/>
			{tooltip &&
				createPortal(
					<div
						className="pointer-events-none fixed left-0 top-0 z-50 -translate-y-full rounded bg-black/80 px-2 py-1 text-[10px] font-medium text-white shadow-lg"
						style={{
							transform: `translate(${tooltip.x}px, ${tooltip.y}px)`,
						}}
					>
						{tooltip.label}
					</div>,
					document.body,
				)}
		</div>
	);
}

function FadeHandle({
	side,
	percent,
	seconds,
	isDragging,
	onPointerDown,
}: {
	side: FadeSide;
	percent: number;
	seconds: number;
	isDragging: boolean;
	onPointerDown: ({
		event,
		side,
	}: {
		event: React.PointerEvent<HTMLButtonElement>;
		side: FadeSide;
	}) => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"pointer-events-auto absolute top-0 size-3 -translate-x-1/2 cursor-ew-resize rounded-full border border-white bg-black/75 shadow",
				isDragging && "ring-primary ring-2",
			)}
			style={{ left: `${percent}%` }}
			aria-label={`${side === "in" ? "Fade in" : "Fade out"} handle, ${seconds.toFixed(2)} seconds`}
			title={`${side === "in" ? "Fade in" : "Fade out"} ${seconds.toFixed(2)}s`}
			onPointerDown={(event) => onPointerDown({ event, side })}
			onClick={(event) => event.stopPropagation()}
		/>
	);
}
