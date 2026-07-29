"use client";

import type { VideoElement } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { getSourceTimeAtClipTime } from "@/retime";
import { mediaTimeToSeconds, TICKS_PER_SECOND } from "@/wasm";
import { videoCache } from "@/services/video-cache/service";
import {
	buildTrackingFailureRanges,
	trackTemplateFrames,
	type MotionTrackingData,
	type TrackingFrame,
	type TrackingRegion,
} from "@/motion-tracking";

const MAX_TRACKING_SAMPLES = 120;

function frameToLuma({
	source,
	width,
	height,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
}): Uint8Array {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", {
		alpha: false,
		willReadFrequently: true,
	});
	if (!ctx) throw new Error("无法创建运动跟踪画布");
	ctx.drawImage(source, 0, 0, width, height);
	const rgba = ctx.getImageData(0, 0, width, height).data;
	const luma = new Uint8Array(width * height);
	for (let pixel = 0; pixel < luma.length; pixel++) {
		const offset = pixel * 4;
		luma[pixel] = Math.round(
			(rgba[offset] ?? 0) * 0.299 +
				(rgba[offset + 1] ?? 0) * 0.587 +
				(rgba[offset + 2] ?? 0) * 0.114,
		);
	}
	return luma;
}

function analysisSize({
	quality,
	aspectRatio,
}: {
	quality: MotionTrackingData["quality"];
	aspectRatio: number;
}): {
	width: number;
	height: number;
	sampleRate: number;
	searchRadius: number;
} {
	const width = quality === "precise" ? 160 : quality === "balanced" ? 120 : 96;
	return {
		width,
		height: Math.max(32, Math.round(width / Math.max(0.25, aspectRatio))),
		sampleRate: quality === "precise" ? 10 : quality === "balanced" ? 7 : 4,
		searchRadius: quality === "precise" ? 16 : quality === "balanced" ? 12 : 8,
	};
}

export async function analyzeVideoMotion({
	element,
	asset,
	region,
	quality,
	confidenceThreshold,
	signal,
	onProgress,
}: {
	element: VideoElement;
	asset: MediaAsset;
	region: TrackingRegion;
	quality: MotionTrackingData["quality"];
	confidenceThreshold: number;
	signal: AbortSignal;
	onProgress: (progress: number) => void;
}): Promise<MotionTrackingData> {
	const sourceSpan = Math.max(
		0,
		(element.sourceDuration ?? element.duration) -
			element.trimStart -
			element.trimEnd,
	);
	const naturalWidth = asset.width ?? 1920;
	const naturalHeight = asset.height ?? 1080;
	const size = analysisSize({
		quality,
		aspectRatio: naturalWidth / Math.max(1, naturalHeight),
	});
	const durationSeconds = mediaTimeToSeconds({ time: element.duration });
	const sampleCount = Math.max(
		2,
		Math.min(
			MAX_TRACKING_SAMPLES,
			Math.ceil(durationSeconds * size.sampleRate) + 1,
		),
	);
	const frames: TrackingFrame[] = [];

	for (let index = 0; index < sampleCount; index++) {
		if (signal.aborted) throw new DOMException("运动跟踪已取消", "AbortError");
		const localTime = Math.round(
			(element.duration * index) / Math.max(1, sampleCount - 1),
		);
		const mappedTime = getSourceTimeAtClipTime({
			clipTime: localTime,
			retime: element.retime,
			sourceSpan,
		});
		const sourceTime =
			element.trimStart + Math.min(Math.max(0, sourceSpan - 1), mappedTime);
		const frame = await videoCache.getFrameAt({
			mediaId: element.mediaId,
			file: asset.file,
			time: sourceTime / TICKS_PER_SECOND,
		});
		if (!frame) {
			throw new Error(`无法解码第 ${index + 1} 个跟踪画面`);
		}
		frames.push({
			time: localTime,
			width: size.width,
			height: size.height,
			luma: frameToLuma({
				source: frame.canvas,
				width: size.width,
				height: size.height,
			}),
		});
		onProgress((index + 1) / sampleCount);
	}

	const samples = trackTemplateFrames({
		frames,
		region,
		searchRadius: size.searchRadius,
	});
	return {
		region,
		samples,
		confidenceThreshold,
		failureRanges: buildTrackingFailureRanges({
			samples,
			confidenceThreshold,
		}),
		binding: { type: "none" },
		quality,
	};
}
