"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { upsertPathKeyframe } from "@/animation";
import { useEditor } from "@/editor/use-editor";
import { NUMBER_CHANNEL_LAYOUT } from "@/params";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import { getDbFromLinePos, getLinePosFromDb } from "@/timeline/audio-display";
import { buildVolumeEnvelopePoints } from "@/timeline/audio-envelope";
import { getElementVolume, hasAnimatedVolume } from "@/timeline/audio-state";
import type { AudioElement } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import { clamp, isNearlyEqual, snapToStep } from "@/utils/math";
import { cn } from "@/utils/ui";
import {
	addMediaTime,
	type MediaTime,
	roundMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";

const HIT_AREA_HEIGHT_PX = 14;
const TOOLTIP_OFFSET_PX = 10;
const VOLUME_STEP = 0.1;

function clampVolume({ value }: { value: number }): number {
	return clamp({
		value: snapToStep({ value, step: VOLUME_STEP }),
		min: VOLUME_DB_MIN,
		max: VOLUME_DB_MAX,
	});
}

function getVolumeFromPointer({
	clientY,
	rect,
}: {
	clientY: number;
	rect: DOMRect;
}): number {
	const clampedOffset = clamp({
		value: clientY - rect.top,
		min: 0,
		max: rect.height,
	});
	const progressPercent =
		rect.height <= 0 ? 0 : (clampedOffset / rect.height) * 100;
	return clampVolume({ value: getDbFromLinePos({ percent: progressPercent }) });
}

function getTimeFromPointer({
	clientX,
	rect,
	duration,
}: {
	clientX: number;
	rect: DOMRect;
	duration: MediaTime;
}): MediaTime {
	if (rect.width <= 0) return ZERO_MEDIA_TIME;
	const progress = clamp({
		value: (clientX - rect.left) / rect.width,
		min: 0,
		max: 1,
	});
	return roundMediaTime({ time: progress * duration });
}

export function AudioVolumeLine({
	element,
	trackId,
}: {
	element: AudioElement;
	trackId: string;
}) {
	return hasAnimatedVolume({ element }) ? (
		<AnimatedVolumeEnvelope element={element} trackId={trackId} />
	) : (
		<StaticVolumeLine element={element} trackId={trackId} />
	);
}

function StaticVolumeLine({
	element,
	trackId,
}: {
	element: AudioElement;
	trackId: string;
}) {
	const editor = useEditor();
	const surfaceRef = useRef<HTMLDivElement>(null);
	const activePointerIdRef = useRef<number | null>(null);
	const startVolumeRef = useRef(getElementVolume({ element }));
	const lastPreviewVolumeRef = useRef(getElementVolume({ element }));
	const hasChangedRef = useRef(false);
	const [isDragging, setIsDragging] = useState(false);
	const [tooltip, setTooltip] = useState<{
		x: number;
		y: number;
		label: string;
	} | null>(null);
	const currentVolume = getElementVolume({ element });
	const lineTop = `${getLinePosFromDb({ db: currentVolume })}%`;

	const previewVolume = useCallback(
		(nextVolume: number) => {
			if (
				isNearlyEqual({
					leftValue: nextVolume,
					rightValue: lastPreviewVolumeRef.current,
				})
			) {
				return;
			}
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							params: { ...element.params, volume: nextVolume },
						},
					},
				],
			});
			lastPreviewVolumeRef.current = nextVolume;
			hasChangedRef.current = !isNearlyEqual({
				leftValue: startVolumeRef.current,
				rightValue: nextVolume,
			});
		},
		[editor.timeline, element.id, element.params, trackId],
	);

	const updateFromPointer = useCallback(
		({ clientX, clientY }: { clientX: number; clientY: number }) => {
			const rect = surfaceRef.current?.getBoundingClientRect();
			if (!rect) return;
			const nextVolume = getVolumeFromPointer({ clientY, rect });
			setTooltip({
				x: clientX + TOOLTIP_OFFSET_PX,
				y: clientY - TOOLTIP_OFFSET_PX,
				label: `${nextVolume.toFixed(1)} dB`,
			});
			previewVolume(nextVolume);
		},
		[previewVolume],
	);

	const finishDrag = useCallback(
		({ shouldCommit }: { shouldCommit: boolean }) => {
			activePointerIdRef.current = null;
			setIsDragging(false);
			if (shouldCommit && hasChangedRef.current) {
				editor.timeline.commitPreview();
			} else {
				editor.timeline.discardPreview();
			}
			hasChangedRef.current = false;
			lastPreviewVolumeRef.current = startVolumeRef.current;
			setTooltip(null);
		},
		[editor.timeline],
	);

	useEffect(() => {
		if (!isDragging) return;

		const handlePointerMove = (event: PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) return;
			event.preventDefault();
			updateFromPointer({
				clientX: event.clientX,
				clientY: event.clientY,
			});
		};
		const handlePointerUp = (event: PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) return;
			event.preventDefault();
			finishDrag({ shouldCommit: true });
		};
		const handlePointerCancel = (event: PointerEvent) => {
			if (activePointerIdRef.current !== event.pointerId) return;
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
	}, [finishDrag, isDragging, updateFromPointer]);

	const addFirstEnvelopePoint = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const rect = surfaceRef.current?.getBoundingClientRect();
		if (!rect) return;
		const time = getTimeFromPointer({
			clientX: event.clientX,
			rect,
			duration: element.duration,
		});
		const value = getVolumeFromPointer({ clientY: event.clientY, rect });
		const baseValue = getElementVolume({ element });
		const keyframeId = generateUUID();
		editor.timeline.discardPreview();
		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: "volume",
					time: ZERO_MEDIA_TIME,
					value: baseValue,
					keyframeId: generateUUID(),
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: "volume",
					time,
					value,
					keyframeId,
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: "volume",
					time: element.duration,
					value: baseValue,
					keyframeId: generateUUID(),
				},
			],
		});
		editor.selection.setSelectedKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: "volume",
					keyframeId,
				},
			],
			anchorKeyframe: {
				trackId,
				elementId: element.id,
				propertyPath: "volume",
				keyframeId,
			},
		});
		editor.playback.seek({
			time: addMediaTime({ a: element.startTime, b: time }),
		});
	};

	return (
		<div className="pointer-events-none absolute inset-0">
			<div ref={surfaceRef} className="absolute inset-0">
				<div
					className={cn(
						"pointer-events-none absolute inset-x-0 -translate-y-1/2 border-t transition-colors",
						isDragging
							? "border-white"
							: "border-white/50 group-hover/audio:border-white/80",
					)}
					style={{ top: lineTop }}
				/>
				{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- timeline volume is a spatial drag surface; keyboard and numeric parity live in the Audio inspector. */}
				<div
					className="pointer-events-auto absolute inset-x-0 -translate-y-1/2 touch-none cursor-ns-resize"
					style={{ top: lineTop, height: `${HIT_AREA_HEIGHT_PX}px` }}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onMouseDown={(event) => event.stopPropagation()}
					onDoubleClick={addFirstEnvelopePoint}
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						event.preventDefault();
						event.stopPropagation();
						editor.selection.setSelectedElements({
							elements: [{ trackId, elementId: element.id }],
						});
						activePointerIdRef.current = event.pointerId;
						startVolumeRef.current = currentVolume;
						lastPreviewVolumeRef.current = currentVolume;
						hasChangedRef.current = false;
						setIsDragging(true);
						updateFromPointer({
							clientX: event.clientX,
							clientY: event.clientY,
						});
					}}
					title="Drag volume · double-click to create an envelope point"
				/>
				{tooltip && <VolumeTooltip tooltip={tooltip} />}
			</div>
		</div>
	);
}

function AnimatedVolumeEnvelope({
	element,
	trackId,
}: {
	element: AudioElement;
	trackId: string;
}) {
	const editor = useEditor();
	const surfaceRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{
		pointerId: number;
		keyframeId: string;
		animations: AudioElement["animations"];
	} | null>(null);
	const [draggingKeyframeId, setDraggingKeyframeId] = useState<string | null>(
		null,
	);
	const [tooltip, setTooltip] = useState<{
		x: number;
		y: number;
		label: string;
	} | null>(null);
	const points = buildVolumeEnvelopePoints({ element });
	const pointString = points
		.map((point) => `${point.xPercent},${point.yPercent}`)
		.join(" ");

	const updateFromPointer = useCallback(
		({
			clientX,
			clientY,
		}: {
			clientX: number;
			clientY: number;
		}) => {
			const drag = dragRef.current;
			const rect = surfaceRef.current?.getBoundingClientRect();
			if (!drag || !rect) return;
			const time = getTimeFromPointer({
				clientX,
				rect,
				duration: element.duration,
			});
			const value = getVolumeFromPointer({ clientY, rect });
			const animations = upsertPathKeyframe({
				animations: drag.animations,
				propertyPath: "volume",
				time,
				value,
				keyframeId: drag.keyframeId,
				channelLayout: NUMBER_CHANNEL_LAYOUT,
				coerceValue: ({ value: nextValue }) =>
					typeof nextValue === "number"
						? clampVolume({ value: nextValue })
						: null,
			});
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: { animations },
					},
				],
			});
			editor.playback.seek({
				time: addMediaTime({ a: element.startTime, b: time }),
			});
			setTooltip({
				x: clientX + TOOLTIP_OFFSET_PX,
				y: clientY - TOOLTIP_OFFSET_PX,
				label: `${(time / TICKS_PER_SECOND).toFixed(2)}s · ${value.toFixed(1)} dB`,
			});
		},
		[
			editor.playback,
			editor.timeline,
			element.duration,
			element.id,
			element.startTime,
			trackId,
		],
	);

	const finishDrag = useCallback(
		({ commit }: { commit: boolean }) => {
			if (!dragRef.current) return;
			if (commit) editor.timeline.commitPreview();
			else editor.timeline.discardPreview();
			dragRef.current = null;
			setDraggingKeyframeId(null);
			setTooltip(null);
		},
		[editor.timeline],
	);

	useEffect(() => {
		if (!draggingKeyframeId) return;

		const handlePointerMove = (event: PointerEvent) => {
			if (dragRef.current?.pointerId !== event.pointerId) return;
			event.preventDefault();
			updateFromPointer({
				clientX: event.clientX,
				clientY: event.clientY,
			});
		};
		const handlePointerUp = (event: PointerEvent) => {
			if (dragRef.current?.pointerId !== event.pointerId) return;
			event.preventDefault();
			finishDrag({ commit: true });
		};
		const handlePointerCancel = (event: PointerEvent) => {
			if (dragRef.current?.pointerId !== event.pointerId) return;
			event.preventDefault();
			finishDrag({ commit: false });
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerCancel);
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerCancel);
		};
	}, [draggingKeyframeId, finishDrag, updateFromPointer]);

	const addEnvelopePoint = (event: React.MouseEvent<SVGPolylineElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const rect = surfaceRef.current?.getBoundingClientRect();
		if (!rect) return;
		const time = getTimeFromPointer({
			clientX: event.clientX,
			rect,
			duration: element.duration,
		});
		const value = getVolumeFromPointer({ clientY: event.clientY, rect });
		const keyframeId = generateUUID();
		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: "volume",
					time,
					value,
					keyframeId,
				},
			],
		});
		editor.selection.setSelectedKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: "volume",
					keyframeId,
				},
			],
			anchorKeyframe: {
				trackId,
				elementId: element.id,
				propertyPath: "volume",
				keyframeId,
			},
		});
		editor.playback.seek({
			time: addMediaTime({ a: element.startTime, b: time }),
		});
	};

	return (
		<div
			ref={surfaceRef}
			className="pointer-events-none absolute inset-0"
			data-volume-envelope={
				points.filter((point) => point.kind === "keyframe").length
			}
		>
			<svg
				className="absolute inset-0 size-full overflow-visible"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<polyline
					points={pointString}
					fill="none"
					stroke="rgba(255,255,255,0.92)"
					strokeWidth="1.5"
					vectorEffect="non-scaling-stroke"
				/>
				<polyline
					points={pointString}
					fill="none"
					stroke="transparent"
					strokeWidth="12"
					vectorEffect="non-scaling-stroke"
					pointerEvents="stroke"
					onDoubleClick={addEnvelopePoint}
				/>
			</svg>
			{points
				.filter(
					(point): point is typeof point & { keyframeId: string } =>
						point.kind === "keyframe" && Boolean(point.keyframeId),
				)
				.map((point) => (
					<button
						key={point.keyframeId}
						type="button"
						className={cn(
							"pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-white bg-black shadow",
							draggingKeyframeId === point.keyframeId &&
								"bg-primary ring-primary/40 ring-2",
						)}
						style={{
							left: `${point.xPercent}%`,
							top: `${point.yPercent}%`,
						}}
						aria-label={`音量关键帧 ${(point.time / TICKS_PER_SECOND).toFixed(2)} 秒，${point.valueDb.toFixed(1)} dB`}
						title="Drag volume envelope point · double-click line to add"
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							event.preventDefault();
							event.stopPropagation();
							dragRef.current = {
								pointerId: event.pointerId,
								keyframeId: point.keyframeId,
								animations: element.animations,
							};
							setDraggingKeyframeId(point.keyframeId);
							editor.selection.setSelectedKeyframes({
								keyframes: [
									{
										trackId,
										elementId: element.id,
										propertyPath: "volume",
										keyframeId: point.keyframeId,
									},
								],
								anchorKeyframe: {
									trackId,
									elementId: element.id,
									propertyPath: "volume",
									keyframeId: point.keyframeId,
								},
							});
							updateFromPointer({
								clientX: event.clientX,
								clientY: event.clientY,
							});
						}}
						onClick={(event) => event.stopPropagation()}
					/>
				))}
			{tooltip && <VolumeTooltip tooltip={tooltip} />}
		</div>
	);
}

function VolumeTooltip({
	tooltip,
}: {
	tooltip: { x: number; y: number; label: string };
}) {
	return createPortal(
		<div
			className="pointer-events-none fixed left-0 top-0 z-50 -translate-y-full rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap"
			style={{
				transform: `translate(${tooltip.x}px, ${tooltip.y}px)`,
			}}
		>
			{tooltip.label}
		</div>,
		document.body,
	);
}
