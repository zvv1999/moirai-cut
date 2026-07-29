"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useEditor } from "@/editor/use-editor";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { useContainerSize } from "@/hooks/use-container-size";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import {
	mediaTimeToSeconds,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { findActiveMissingVisualElements } from "@/media/missing-media";
import { MissingMediaPlaceholder } from "@/media/missing-media-placeholder";
import { PreviewOverlayLayer } from "./overlay-layer";
import { PreviewInteractionOverlay } from "./preview-interaction-overlay";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type {
	PreviewOverlayControl,
	PreviewOverlayInstance,
} from "@/preview/overlays";
import { PreviewContextMenu } from "./context-menu";
import { PreviewToolbar } from "./toolbar";
import {
	PreviewViewportProvider,
	usePreviewViewportState,
} from "./preview-viewport";
import { usePreviewStore } from "@/preview/preview-store";
import { getPreviewFrameStep } from "@/playback/transport";
import { getPreviewVisualState } from "@/preview/visual-state";
import { Button } from "@/components/ui/button";
import { Film, RotateCcw } from "lucide-react";
import { selectVideoPrewarmCandidates } from "@/media/preview-prewarm";
import { getMediaAssetPlaybackSource } from "@/media/proxy";
import { videoCache } from "@/services/video-cache/service";

function usePreviewSize() {
	const canvasSize = useEditor(
		(e) => e.project.getActive()?.settings.canvasSize,
	);

	return {
		width: canvasSize?.width,
		height: canvasSize?.height,
	};
}

function normalizeWheelDelta({
	delta,
	deltaMode,
	pageSize,
}: {
	delta: number;
	deltaMode: number;
	pageSize: number;
}): number {
	if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
		return delta * 16;
	}

	if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
		return delta * pageSize;
	}

	return delta;
}

export function PreviewPanel({
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
}: {
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const { toggleFullscreen } = useFullscreen({ containerRef });
	const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
		containerRef.current = node;
		setContainer(node);
	}, []);

	return (
		<div
			ref={handleContainerRef}
			className="panel bg-background relative flex size-full min-h-0 min-w-0 flex-col rounded-lg border"
		>
			<PreviewCanvas
				container={container}
				onToggleFullscreen={toggleFullscreen}
				overlayControls={overlayControls}
				overlayInstances={overlayInstances}
				onOverlayVisibilityChange={onOverlayVisibilityChange}
			/>
			<RenderTreeController />
		</div>
	);
}

function RenderTreeController() {
	const editor = useEditor();
	const tracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const { width, height } = usePreviewSize();

	useDeepCompareEffect(() => {
		if (!activeProject) return;

		const duration = editor.timeline.getTotalDuration();
		const renderTree = buildScene({
			tracks,
			mediaAssets,
			duration,
			canvasSize: { width, height },
			background: activeProject.settings.background,
			isPreview: true,
		});

		editor.renderer.setRenderTree({ renderTree });
	}, [tracks, mediaAssets, activeProject?.settings.background, width, height]);

	return null;
}

function PreviewCanvas({
	container,
	onToggleFullscreen,
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
}: {
	container: HTMLElement | null;
	onToggleFullscreen: () => void;
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const canvasMountRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const renderingRef = useRef(false);
	const { width: nativeWidth, height: nativeHeight } = usePreviewSize();
	const viewportSize = useContainerSize({ containerRef: viewportRef });
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const renderTree = useEditor((e) => e.renderer.getRenderTree());
	const previewTracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const currentTime = useEditor((e) => e.playback.getCurrentTime());
	const previewQuality = usePreviewStore((state) => state.quality);
	const activeMissingMedia = useMemo(
		() =>
			findActiveMissingVisualElements({
				tracks: previewTracks,
				assets: mediaAssets,
				time: currentTime,
			}),
		[previewTracks, mediaAssets, currentTime],
	);
	const visualState = useMemo(
		() =>
			getPreviewVisualState({
				tracks: [...previewTracks.overlay, previewTracks.main],
				time: currentTime,
			}),
		[previewTracks, currentTime],
	);
	const viewport = usePreviewViewportState({
		canvasHeight: nativeHeight,
		canvasWidth: nativeWidth,
		viewportHeight: viewportSize.height,
		viewportRef,
		viewportWidth: viewportSize.width,
	});
	const { canPan, panByScreenDelta, scaleZoom } = viewport;

	useEffect(() => {
		const elements = [
			...previewTracks.overlay.flatMap((track) => track.elements),
			...previewTracks.main.elements,
		].flatMap((element) =>
			"mediaId" in element
				? [
						{
							type: element.type,
							mediaId: element.mediaId,
							startSeconds: mediaTimeToSeconds({
								time: element.startTime,
							}),
							durationSeconds: mediaTimeToSeconds({
								time: element.duration,
							}),
						},
					]
				: [],
		);
		const mediaIds = selectVideoPrewarmCandidates({
			elements,
			currentTime: mediaTimeToSeconds({ time: currentTime }),
			lookaheadSeconds: 3,
			maxCandidates: 2,
		});
		for (const mediaId of mediaIds) {
			const asset = mediaAssets.find(
				(candidate) => candidate.id === mediaId,
			);
			if (!asset || asset.type !== "video") {
				continue;
			}
			const source = getMediaAssetPlaybackSource({
				asset,
				isPreview: true,
			});
			void videoCache
				.prewarm({ mediaId: source.mediaId, file: source.file })
				.catch(() => undefined);
		}
	}, [currentTime, mediaAssets, previewTracks]);

	const renderer = useMemo(() => {
		return new CanvasRenderer({
			width: nativeWidth,
			height: nativeHeight,
			fps: activeProject.settings.fps,
		});
	}, [nativeWidth, nativeHeight, activeProject.settings.fps]);

	// Mount the compositor's output canvas directly into the preview. wgpu
	// renders straight into this element, so there is no intermediate copy —
	// the container div owns positioning/styling, the canvas itself fills it.
	useEffect(() => {
		const mount = canvasMountRef.current;
		if (!mount) return;
		const outputCanvas = renderer.getOutputCanvas();
		outputCanvas.style.display = "block";
		outputCanvas.style.width = "100%";
		outputCanvas.style.height = "100%";
		mount.appendChild(outputCanvas);
		return () => {
			if (outputCanvas.parentElement === mount) {
				mount.removeChild(outputCanvas);
			}
		};
	}, [renderer]);

	useEffect(() => {
		lastFrameRef.current = -1;
	}, [previewQuality]);

	const render = useCallback(() => {
		if (!renderTree || renderingRef.current) return;

		const renderTime = Math.min(
			editor.playback.getCurrentTime(),
			editor.timeline.getLastFrameTime(),
		);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * renderer.fps.denominator) / renderer.fps.numerator,
		);
		const frame = Math.floor(renderTime / ticksPerFrame);
		const previewFrameStep = getPreviewFrameStep({ quality: previewQuality });
		const sampledFrame = editor.playback.getIsPlaying()
			? frame - (frame % previewFrameStep)
			: frame;
		const sampledTime = Math.min(
			sampledFrame * ticksPerFrame,
			editor.timeline.getLastFrameTime(),
		);

		if (
			sampledFrame === lastFrameRef.current &&
			renderTree === lastSceneRef.current
		) {
			return;
		}

		renderingRef.current = true;
		lastSceneRef.current = renderTree;
		lastFrameRef.current = sampledFrame;
		renderer.render({ node: renderTree, time: sampledTime }).finally(() => {
			renderingRef.current = false;
		});
	}, [renderer, renderTree, editor.playback, editor.timeline, previewQuality]);

	useRafLoop(render);

	useEffect(() => {
		const container = viewportRef.current;
		if (!container) return;

		let pendingZoomDelta = 0;
		let pendingPanDeltaX = 0;
		let pendingPanDeltaY = 0;
		let zoomRafId: ReturnType<typeof requestAnimationFrame> | null = null;
		let panRafId: ReturnType<typeof requestAnimationFrame> | null = null;

		const onWheel = (event: WheelEvent) => {
			const normalizedDeltaX = normalizeWheelDelta({
				delta: event.deltaX,
				deltaMode: event.deltaMode,
				pageSize: container.clientWidth,
			});
			const normalizedDeltaY = normalizeWheelDelta({
				delta: event.deltaY,
				deltaMode: event.deltaMode,
				pageSize: container.clientHeight,
			});
			const isZoomGesture = event.ctrlKey || event.metaKey;
			if (isZoomGesture) {
				event.preventDefault();
				pendingZoomDelta += normalizedDeltaY;

				if (zoomRafId === null) {
					zoomRafId = requestAnimationFrame(() => {
						const cappedDelta =
							Math.sign(pendingZoomDelta) *
							Math.min(Math.abs(pendingZoomDelta), 30);
						const zoomFactor = Math.exp(-cappedDelta / 300);

						scaleZoom({ factor: zoomFactor });
						pendingZoomDelta = 0;
						zoomRafId = null;
					});
				}

				return;
			}

			if (!canPan) {
				return;
			}

			if (normalizedDeltaX === 0 && normalizedDeltaY === 0) {
				return;
			}

			event.preventDefault();
			pendingPanDeltaX += normalizedDeltaX;
			pendingPanDeltaY += normalizedDeltaY;

			if (panRafId === null) {
				panRafId = requestAnimationFrame(() => {
					panByScreenDelta({
						deltaX: pendingPanDeltaX,
						deltaY: pendingPanDeltaY,
					});
					pendingPanDeltaX = 0;
					pendingPanDeltaY = 0;
					panRafId = null;
				});
			}
		};

		container.addEventListener("wheel", onWheel, {
			capture: true,
			passive: false,
		});

		return () => {
			container.removeEventListener("wheel", onWheel, {
				capture: true,
			});
			if (zoomRafId !== null) {
				cancelAnimationFrame(zoomRafId);
			}
			if (panRafId !== null) {
				cancelAnimationFrame(panRafId);
			}
		};
	}, [canPan, panByScreenDelta, scaleZoom]);

	return (
		<PreviewViewportProvider value={viewport}>
			<div className="flex size-full min-h-0 min-w-0 flex-col">
				<div className="flex min-h-0 min-w-0 flex-1 p-2 pb-0">
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<div
								ref={viewportRef}
								className="relative flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden"
							>
								<div
									ref={canvasMountRef}
									className="absolute block border"
									style={{
										left: viewport.sceneLeft,
										top: viewport.sceneTop,
										width: viewport.sceneWidth,
										height: viewport.sceneHeight,
										background:
											activeProject.settings.background.type === "blur"
												? "transparent"
												: activeProject?.settings.background.color,
									}}
								>
									{activeMissingMedia[0] ? (
										<MissingMediaPlaceholder
											surface="canvas"
											mediaId={activeMissingMedia[0].mediaId}
											name={
												activeMissingMedia.length > 1
													? `${activeMissingMedia[0].name} (+${
															activeMissingMedia.length - 1
														} more)`
													: activeMissingMedia[0].name
											}
											type={activeMissingMedia[0].type}
										/>
									) : null}
								</div>
								<PreviewOverlayLayer
									instances={overlayInstances}
									plane="under-interaction"
								/>
								<PreviewInteractionOverlay />
								<PreviewOverlayLayer
									instances={overlayInstances}
									plane="over-interaction"
								/>
								{!activeMissingMedia[0] && visualState.kind !== "visible" ? (
									<PreviewEmptyState
										kind={visualState.kind}
										onGoToStart={() =>
											editor.playback.seek({ time: ZERO_MEDIA_TIME })
										}
									/>
								) : null}
							</div>
						</ContextMenuTrigger>
						<PreviewContextMenu
							onToggleFullscreen={onToggleFullscreen}
							container={container}
							overlayControls={overlayControls}
							onOverlayVisibilityChange={onOverlayVisibilityChange}
						/>
					</ContextMenu>
				</div>
				<PreviewToolbar onToggleFullscreen={onToggleFullscreen} />
			</div>
		</PreviewViewportProvider>
	);
}

function PreviewEmptyState({
	kind,
	onGoToStart,
}: {
	kind: Exclude<ReturnType<typeof getPreviewVisualState>["kind"], "visible">;
	onGoToStart: () => void;
}) {
	const copy = {
		"no-visuals": {
			title: "时间线里还没有画面",
			description: "把视频、图片、文字或贴纸拖到时间线开始创作",
		},
		before: {
			title: "画面尚未开始",
			description: "向右拖动播放头，或返回开头开始预览",
		},
		gap: {
			title: "当前位置没有画面",
			description: "这里是空白间隙，音频仍可继续播放",
		},
		after: {
			title: "画面已播放完",
			description: "当前位置只剩音频或空白尾帧",
		},
	}[kind];

	return (
		<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
			<div className="flex max-w-64 flex-col items-center gap-3 px-5 text-center text-white">
				<div className="flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-lg">
					<Film className="size-5 text-white/80" />
				</div>
				<div className="space-y-1">
					<p className="text-sm font-semibold tracking-wide">{copy.title}</p>
					<p className="text-[11px] leading-5 text-white/55">
						{copy.description}
					</p>
				</div>
				{kind !== "no-visuals" ? (
					<Button
						type="button"
						size="sm"
						variant="secondary"
						className="pointer-events-auto h-7 gap-1.5 border border-white/10 bg-white/12 px-3 text-[11px] text-white hover:bg-white/20"
						onClick={onGoToStart}
					>
						<RotateCcw className="size-3.5" />
						从头预览
					</Button>
				) : null}
			</div>
		</div>
	);
}
