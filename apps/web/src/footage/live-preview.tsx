"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPreviewRenderer, type PreviewPlan } from "./preview-renderer";
import type { FootageSource, Shot } from "./types";
import { trimmedPreview } from "./trimmed-preview";
import { requestPreview as request } from "./preview-request";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function LivePreview({
	shot,
	source,
	videoRef,
	initialTime,
}: {
	shot: Shot;
	source: FootageSource;
	videoRef: RefObject<HTMLVideoElement | null>;
	initialTime: number;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const scrubVideo = useRef<HTMLVideoElement>(null);
	const outsideTime = useRef<number | null>(null);
	const renderer = useRef<ReturnType<typeof createPreviewRenderer> | null>(
		null,
	);
	const plan = useRef<PreviewPlan | null>(null);
	const [error, setError] = useState("");
	const [renderError, setRenderError] = useState("");
	const [pending, setPending] = useState(true);
	const [retryCount, setRetryCount] = useState(0);
	const [exposureError, setExposureError] = useState("");
	const [exposurePending, setExposurePending] = useState(false);
	const [exposure, setExposure] = useState<{
		key: string;
		brightness: number;
		lut?: PreviewPlan["lut"];
	} | null>(null);
	const [ready, setReady] = useState(false);
	const start = shot.startTicks / 120000;
	const end = shot.endTicks / 120000;
	const [clip, setClip] = useState<{
		url: string;
		start: number;
		end: number;
	} | null>(null);
	const [clipError, setClipError] = useState("");
	const clipCurrent = clip?.start === start && clip?.end === end;
	useEffect(() => {
		const controller = new AbortController();
		let url: string | undefined;
		videoRef.current?.pause();
		setReady(false);
		setClipError("");
		const timer = setTimeout(() => {
			void trimmedPreview(
				`/api/footage/media/source/${source.id}/preview`,
				start,
				end,
				controller.signal,
			)
				.then((value) => {
					if (controller.signal.aborted) {
						URL.revokeObjectURL(value);
						return;
					}
					url = value;
					setClip({ url: value, start, end });
				})
				.catch((error) => {
					if (!controller.signal.aborted)
						setClipError(
							error instanceof Error ? error.message : "裁剪预览失败",
						);
				});
		}, 150);
		return () => {
			clearTimeout(timer);
			controller.abort();
			if (url) URL.revokeObjectURL(url);
		};
	}, [source.id, start, end, videoRef, retryCount]);
	const range = useRef({ start: 0, end: end - start });
	useEffect(() => {
		range.current = { start: 0, end: end - start };
	}, [start, end]);
	const recipeJson = JSON.stringify(shot.recipe);
	const valid =
		Number.isFinite(start) &&
		Number.isFinite(end) &&
		start >= 0 &&
		end - start >= 0.2 &&
		end <= source.durationTicks / 120000;
	const adaptive = shot.recipe.colorMode === "adaptive";
	const exposureKey = `${source.id}:${shot.startTicks}:${shot.endTicks}:${shot.recipe.colorMode}`;
	const auto = shot.recipe.colorMode === "auto" || adaptive;
	const lut =
		adaptive && exposure?.key === exposureKey ? exposure.lut : undefined;
	const brightness =
		auto && exposure?.key === exposureKey ? exposure.brightness : 0;
	const draw = () => {
		const player = outsideTime.current === null ? videoRef.current : scrubVideo.current;
		if (player && player.readyState >= 2 && plan.current)
			renderer.current?.draw(player, outsideTime.current === null
				? plan.current : { ...plan.current, zoom: undefined });
	};
	useEffect(() => {
		const outside = initialTime < start || initialTime > end;
		outsideTime.current = outside ? initialTime : null;
		const player = videoRef.current;
		if (player) {
			if (outside) player.dataset.scrubSourceTime = String(initialTime);
			else delete player.dataset.scrubSourceTime;
		}
		if (outside && scrubVideo.current?.readyState) {
			scrubVideo.current.currentTime = Math.min(initialTime, Math.max(0, scrubVideo.current.duration - 0.001));
		}
		draw();
	}, [initialTime, start, end]);

	useEffect(() => {
		if (!canvas.current) return;
		try {
			renderer.current = createPreviewRenderer(canvas.current);
		} catch (e) {
			setRenderError(e instanceof Error ? e.message : "预览初始化失败");
			return;
		}
		const element = canvas.current;
		const lost = (event: Event) => {
			event.preventDefault();
			videoRef.current?.pause();
			setRenderError("实时预览已中断，请切换原片后重试");
		};
		element.addEventListener("webglcontextlost", lost);
		let frame = 0;
		const tick = () => {
			const video = videoRef.current;
			if (video && !video.paused) {
				if (video.currentTime >= range.current.end) {
					video.pause();
					video.currentTime = range.current.end;
				} else if (video.currentTime < range.current.start)
					video.currentTime = range.current.start;
				if (plan.current) renderer.current?.draw(video, plan.current);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			element.removeEventListener("webglcontextlost", lost);
			cancelAnimationFrame(frame);
			renderer.current?.dispose();
			renderer.current = null;
		};
	}, [videoRef, retryCount]);

	useEffect(() => {
		if (!valid || !auto || exposure?.key === exposureKey) {
			setExposurePending(false);
			return;
		}
		const controller = new AbortController();
		setExposurePending(true);
		setExposureError("");
		const timeout = setTimeout(() => {
			void request<{ brightness?: number; size: number; values: number[] }>(
				`shots/${shot.id}/${adaptive ? "preview-lut" : "preview-exposure"}`,
				{ startTicks: shot.startTicks, endTicks: shot.endTicks },
				controller.signal,
			)
				.then((result) => {
					if (!controller.signal.aborted) {
						setExposure({
							key: exposureKey,
							brightness: result.brightness ?? 0,
							lut: adaptive
								? { size: result.size, values: result.values }
								: undefined,
						});
						setExposurePending(false);
					}
				})
				.catch((e) => {
					if (!controller.signal.aborted) {
						setExposureError(e.message);
						setExposurePending(false);
					}
				});
		}, 300);
		return () => {
			clearTimeout(timeout);
			controller.abort();
		};
	}, [
		auto,
		adaptive,
		valid,
		exposureKey,
		exposure?.key,
		retryCount,
		shot.id,
		shot.startTicks,
		shot.endTicks,
	]);

	useEffect(() => {
		const controller = new AbortController();
		if (!valid) {
			videoRef.current?.pause();
			setError("入出点需位于原片内，且片段至少 0.2 秒");
			setPending(false);
			return;
		}
		setPending(true);
		setError("");
		void request<PreviewPlan>(
			`shots/${shot.id}/preview-plan`,
			{
				startTicks: shot.startTicks,
				endTicks: shot.endTicks,
				recipe: JSON.parse(recipeJson),
				autoBrightness: brightness,
				baseLut: lut,
			},
			controller.signal,
		)
			.then((value) => {
				if (!controller.signal.aborted) {
					value.lut = value.lut ?? lut;
					plan.current = value;
					setPending(false);
					draw();
				}
			})
			.catch((e) => {
				if (!controller.signal.aborted) {
					setError(e.message);
					setPending(false);
				}
			});
		return () => controller.abort();
	}, [
		shot.id,
		shot.startTicks,
		shot.endTicks,
		recipeJson,
		retryCount,
		brightness,
		lut,
		valid,
		videoRef,
	]);

	useEffect(() => {
		const video = videoRef.current;
		if (
			video &&
			ready &&
			valid &&
			(video.currentTime < 0 || video.currentTime > end - start)
		) {
			video.currentTime = Math.max(0, Math.min(video.currentTime, end - start));
		}
	}, [start, end, ready, valid, videoRef]);

	const visibleError =
		clipError || renderError || error || (auto ? exposureError : "");
	return (
		<div className="footage-live-preview">
			{/* A separate decoder keeps out-of-range scrubbing independent of trimmed playback. */}
			{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
			<video
				ref={scrubVideo}
				hidden
				muted
				playsInline
				preload="auto"
				src={`/api/footage/media/source/${source.id}/preview`}
				onLoadedMetadata={() => {
					if (scrubVideo.current && outsideTime.current !== null)
						scrubVideo.current.currentTime = Math.min(outsideTime.current, Math.max(0, scrubVideo.current.duration - 0.001));
				}}
				onLoadedData={draw}
				onSeeked={draw}
			/>
			{/* Source audio stays on the media element; the canvas only draws its decoded frames. */}
			{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
			<video
				ref={videoRef}
				className="footage-preview-decoder"
				playsInline
				controls
				controlsList="nofullscreen nodownload noremoteplayback"
				preload="auto"
				src={clipCurrent ? clip.url : undefined}
				data-source-offset={clip?.start ?? start}
				data-playback-end={end - start}
				disablePictureInPicture
				disableRemotePlayback
				aria-label="实时预览播放器"
				onLoadedMetadata={() => {
					if (videoRef.current)
						videoRef.current.currentTime = Math.max(
							0,
							Math.min(initialTime - start, end - start),
						);
				}}
				onLoadedData={() => {
					setReady(true);
					draw();
				}}
				onSeeking={() => {
					const video = videoRef.current;
					if (video && valid && !video.paused) {
						const clamped = Math.max(
							0,
							Math.min(video.currentTime, end - start),
						);
						if (clamped !== video.currentTime) video.currentTime = clamped;
					}
				}}
				onSeeked={draw}
				onPause={draw}
				onPlay={() => {
					const video = videoRef.current;
					if (!video) return;
					if (!valid || visibleError || !clipCurrent) {
						video.pause();
						return;
					}
					if (outsideTime.current !== null || video.currentTime >= end - start - 0.02) {
						outsideTime.current = null;
						delete video.dataset.scrubSourceTime;
						video.currentTime = 0;
						void video.play().catch((cause: unknown) => {
							if (!(cause instanceof DOMException && cause.name === "AbortError"))
								setError("无法播放视频，请重试");
						});
					}
				}}
				onError={() => setError("原片预览读取失败")}
			/>
			<div className="footage-live-stage">
				<canvas ref={canvas} aria-label="实时画面预览" />
				{visibleError && (
					<div className="footage-preview-message" role="alert">
						<p>{visibleError}</p>
						<Button variant="outline" onClick={() => {
							setRenderError("");
							setError("");
							setClipError("");
							setExposureError("");
							setRetryCount((count) => count + 1);
						}}>
							<RefreshCw /> 重试预览
						</Button>
					</div>
				)}
				{!visibleError && (pending || !ready || exposurePending) && (
					<span className="footage-preview-pending" role="status">
						{!ready
							? "加载预览"
							: exposurePending
								? "计算自动调色"
								: "更新预览"}
					</span>
				)}
			</div>
		</div>
	);
}
