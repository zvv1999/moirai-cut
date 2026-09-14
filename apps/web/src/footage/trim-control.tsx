"use client";

import {
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent,
	type RefObject,
} from "react";
import { ALL_FORMATS, CanvasSink, Input, UrlSource } from "mediabunny";

const TICKS = 120000;
const MIN_LENGTH = 24000;
const THUMB_WIDTH = 42;
const TRACK_HEIGHT = 63;
const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(value, max));
type DragMode = "start" | "end" | "seek";

function Filmstrip({ src, duration }: { src: string; duration: number }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [count, setCount] = useState(0);
	const [status, setStatus] = useState("loading");
	useEffect(() => {
		const parent = canvas.current?.parentElement;
		if (!parent) return;
		const observer = new ResizeObserver(([entry]) => {
			setCount(clamp(Math.ceil(entry.contentRect.width / THUMB_WIDTH), 1, 80));
		});
		observer.observe(parent);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		const element = canvas.current;
		if (!count || !element || duration <= 0) return;
		let cancelled = false;
		const input = new Input({
			source: new UrlSource(src, { getRetryDelay: () => null }),
			formats: ALL_FORMATS,
		});
		setStatus("loading");
		const render = async () => {
			try {
				const track = await input.getPrimaryVideoTrack();
				if (!track || !(await track.canDecode())) throw new Error("decode");
				if (cancelled) return;
				const context = element.getContext("2d");
				if (!context) throw new Error("canvas");
				const scale = 2;
				element.width = count * THUMB_WIDTH * scale;
				element.height = TRACK_HEIGHT * scale;
				const sink = new CanvasSink(track, {
					width: THUMB_WIDTH * scale,
					height: TRACK_HEIGHT * scale,
					fit: "cover",
					poolSize: 1,
				});
				const times = Array.from(
					{ length: count },
					(_, i) => ((i + 0.5) / count) * duration,
				);
				let index = 0;
				for await (const frame of sink.canvasesAtTimestamps(times)) {
					if (cancelled) return;
					if (!frame) throw new Error("frame");
					context.drawImage(frame.canvas, index * THUMB_WIDTH * scale, 0);
					index += 1;
				}
				setStatus("ready");
			} catch {
				if (!cancelled) setStatus("error");
			} finally {
				input.dispose();
			}
		};
		void render();
		return () => {
			cancelled = true;
			input.dispose();
		};
	}, [count, src, duration]);
	return (
		<>
			<canvas
				ref={canvas}
				className="footage-trim-frames"
				aria-label="原片时间轴缩略图"
				data-status={status}
			/>
			{status === "error" && (
				<span className="footage-trim-error">缩略图读取失败</span>
			)}
		</>
	);
}

export function TrimControl({
	src,
	durationTicks,
	startTicks,
	endTicks,
	videoRef,
	disabled,
	onChange,
	onSeek,
}: {
	src: string;
	durationTicks: number;
	startTicks: number;
	endTicks: number;
	videoRef: RefObject<HTMLVideoElement | null>;
	disabled: boolean;
	onChange: (start: number, end: number) => void;
	onSeek: (seconds: number) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const playhead = useRef<HTMLDivElement>(null);
	const drag = useRef<{
		mode: DragMode;
		pointerId: number;
		rect: DOMRect;
	} | null>(null);
	const [time, setTime] = useState(startTicks);
	const unavailable = disabled || durationTicks < MIN_LENGTH;
	const percent = (ticks: number) =>
		`${clamp(ticks / durationTicks, 0, 1) * 100}%`;

	useEffect(() => {
		let frame = 0;
		const tick = () => {
			// Read the current element because preview switches can replace the player.
			const video = videoRef.current;
			// Pointer position owns the playhead while scrubbing, even if decoding lags.
			if (video && video.readyState >= 1 && !drag.current)
				setTime(
					Math.round(
						Number(video.dataset.scrubSourceTime ?? (video.currentTime + Number(video.dataset.sourceOffset ?? 0))) *
							TICKS,
					),
				);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [videoRef]);

	const seek = (ticks: number) => {
		const next = clamp(Math.round(ticks), 0, durationTicks);
		const video = videoRef.current;
		video?.pause();
		setTime(next);
		if (video && video.readyState >= 1)
			video.currentTime = Math.max(
				0,
				next / TICKS - Number(video.dataset.sourceOffset ?? 0),
			);
		onSeek(next / TICKS);
	};
	const update = (mode: DragMode, ticks: number) => {
		let next = clamp(Math.round(ticks), 0, durationTicks);
		if (mode === "start") {
			next = clamp(next, 0, endTicks - MIN_LENGTH);
			onChange(next, endTicks);
		} else if (mode === "end") {
			next = clamp(next, startTicks + MIN_LENGTH, durationTicks);
			onChange(startTicks, next);
		}
		seek(next);
	};
	const move = (event: PointerEvent<HTMLDivElement>) => {
		const active = drag.current;
		if (unavailable || !active || active.pointerId !== event.pointerId) return;
		update(
			active.mode,
			((event.clientX - active.rect.left) / active.rect.width) * durationTicks,
		);
	};
	const begin = (event: PointerEvent<HTMLDivElement>) => {
		if (unavailable || event.button !== 0 || drag.current) return;
		event.preventDefault();
		const rect = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const startDistance = Math.abs(
			x - (startTicks / durationTicks) * rect.width,
		);
		const endDistance = Math.abs(x - (endTicks / durationTicks) * rect.width);
		// Resolve overlapping hit areas by the nearest edge, so either end stays reachable.
		const mode: DragMode =
			Math.min(startDistance, endDistance) <= 16
				? startDistance <= endDistance
					? "start"
					: "end"
				: "seek";
		drag.current = { mode, pointerId: event.pointerId, rect };
		event.currentTarget.setPointerCapture(event.pointerId);
		const control =
			mode === "seek"
				? playhead.current
				: track.current?.querySelector<HTMLElement>(
						`[data-trim-handle="${mode}"]`,
					);
		control?.focus({ preventScroll: true });
		move(event);
	};
	const finish = (event: PointerEvent<HTMLDivElement>) => {
		if (drag.current?.pointerId !== event.pointerId) return;
		move(event);
		drag.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
	};
	const keyDown = (mode: DragMode, event: KeyboardEvent<HTMLDivElement>) => {
		if (unavailable) return;
		const value =
			mode === "start" ? startTicks : mode === "end" ? endTicks : time;
		const step = event.shiftKey ? TICKS / 10 : TICKS / 100;
		const next = {
			ArrowLeft: value - step,
			ArrowRight: value + step,
			Home: 0,
			End: durationTicks,
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		update(mode, next);
	};
	return (
		<div className="footage-trim-control">
			<div
				ref={track}
				className="footage-trim-track"
				role="group"
				aria-label="裁剪范围"
				aria-disabled={unavailable}
				onPointerDown={begin}
				onPointerMove={move}
				onPointerUp={finish}
				onPointerCancel={() => {
					drag.current = null;
				}}
				onLostPointerCapture={() => {
					drag.current = null;
				}}
			>
				<Filmstrip src={src} duration={durationTicks / TICKS} />
				<div
					className="footage-trim-shade"
					style={{ width: percent(startTicks) }}
				/>
				<div
					className="footage-trim-shade"
					style={{ left: percent(endTicks), right: 0 }}
				/>
				<div
					className="footage-trim-selection"
					style={{
						left: percent(startTicks),
						width: percent(endTicks - startTicks),
					}}
				/>
				<div
					ref={playhead}
					className="footage-trim-playhead"
					style={{ left: percent(time) }}
					role="slider"
					tabIndex={unavailable ? -1 : 0}
					aria-label="视频播放位置"
					aria-valuenow={time / TICKS}
					aria-valuemin={0}
					aria-valuemax={durationTicks / TICKS}
					aria-valuetext={`${(time / TICKS).toFixed(2)} 秒`}
					aria-disabled={unavailable}
					onKeyDown={(e) => keyDown("seek", e)}
				/>
				{(["start", "end"] as const).map((mode) => (
					<div
						key={mode}
						className="footage-trim-handle"
						data-trim-handle={mode}
						style={{ left: percent(mode === "start" ? startTicks : endTicks) }}
						role="slider"
						tabIndex={unavailable ? -1 : 0}
						aria-label={mode === "start" ? "裁剪入点" : "裁剪出点"}
						aria-valuenow={(mode === "start" ? startTicks : endTicks) / TICKS}
						aria-valuemin={
							mode === "start" ? 0 : (startTicks + MIN_LENGTH) / TICKS
						}
						aria-valuemax={
							(mode === "start" ? endTicks - MIN_LENGTH : durationTicks) / TICKS
						}
						aria-disabled={unavailable}
						title={mode === "start" ? "拖动调整开始位置" : "拖动调整结束位置"}
						onKeyDown={(e) => keyDown(mode, e)}
					/>
				))}
			</div>
			<div className="footage-trim-times">
				<span>{(startTicks / TICKS).toFixed(2)} s</span>
				<strong>已选 {((endTicks - startTicks) / TICKS).toFixed(2)} s</strong>
				<span>{(endTicks / TICKS).toFixed(2)} s</span>
			</div>
		</div>
	);
}
