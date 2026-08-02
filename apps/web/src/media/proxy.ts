import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	canEncodeVideo,
	CanvasSink,
	CanvasSource,
	Input,
	Mp4OutputFormat,
	Output,
	WebMOutputFormat,
} from "mediabunny";
import type { MediaAsset } from "@/media/types";
import type { MediaProxyData } from "@/services/storage/types";

const DEFAULT_PROXY_LONG_EDGE = 960;
const DEFAULT_PROXY_FPS = 15;
const DEFAULT_PROXY_BITRATE = 1_200_000;

export type MediaPlaybackSource = {
	mediaId: string;
	file: File;
	url: string;
};

export type GeneratedMediaProxy = {
	metadata: MediaProxyData;
	file: File;
	url: string;
};

export function getMediaProxyStorageId({
	mediaId,
}: {
	mediaId: string;
}): string {
	return `${mediaId}-proxy`;
}

export function isMediaProxyStorageId({
	storageId,
}: {
	storageId: string;
}): boolean {
	return storageId.endsWith("-proxy");
}

export function computeProxyDimensions({
	width,
	height,
	maxLongEdge = DEFAULT_PROXY_LONG_EDGE,
}: {
	width: number;
	height: number;
	maxLongEdge?: number;
}): { width: number; height: number } {
	const safeWidth = Math.max(2, width);
	const safeHeight = Math.max(2, height);
	const scale = Math.min(1, maxLongEdge / Math.max(safeWidth, safeHeight));
	const even = (value: number) => Math.max(2, Math.round(value * scale / 2) * 2);
	return { width: even(safeWidth), height: even(safeHeight) };
}

export function getMediaAssetPlaybackSource({
	asset,
	isPreview,
}: {
	asset: MediaAsset;
	isPreview?: boolean;
}): MediaPlaybackSource {
	if (
		isPreview &&
		asset.proxy?.enabled &&
		asset.proxyFile &&
		asset.proxyUrl
	) {
		return {
			mediaId: asset.proxy.storageId,
			file: asset.proxyFile,
			url: asset.proxyUrl,
		};
	}

	return {
		mediaId: asset.id,
		file: asset.file,
		url: asset.url ?? "",
	};
}

export function shouldAutoGenerateProxy({
	asset,
}: {
	asset: Pick<
		MediaAsset,
		| "type"
		| "browserCanDecode"
		| "proxy"
		| "proxyFile"
		| "file"
		| "width"
		| "height"
		| "fps"
		| "duration"
	>;
}): boolean {
	return (
		asset.type === "video" &&
		(asset.browserCanDecode === false || isExpensivePreviewSource({ asset })) &&
		(!asset.proxy || !asset.proxyFile)
	);
}

function isExpensivePreviewSource({
	asset,
}: {
	asset: Pick<
		MediaAsset,
		"file" | "width" | "height" | "fps" | "duration"
	>;
}): boolean {
	const pixels = (asset.width ?? 0) * (asset.height ?? 0);
	const estimatedBitrate =
		asset.duration && asset.duration > 0
			? (asset.file.size * 8) / asset.duration
			: 0;
	return (
		pixels >= 2560 * 1440 ||
		(asset.fps ?? 0) > 30 ||
		estimatedBitrate > 20_000_000
	);
}

export function automaticProxyProfile({
	asset,
}: {
	asset: Pick<MediaAsset, "width" | "height">;
}): "standard" | "high" {
	return (asset.width ?? 0) * (asset.height ?? 0) >= 2560 * 1440
		? "high"
		: "standard";
}

function fileExtension({ name }: { name: string }): string {
	const lastDot = name.lastIndexOf(".");
	return lastDot > 0 ? name.slice(lastDot) : "";
}

export function buildBatchMediaNames({
	assets,
	prefix,
	startIndex,
}: {
	assets: MediaAsset[];
	prefix: string;
	startIndex: number;
}): Array<{ assetId: string; name: string }> {
	const normalizedPrefix = prefix.trim() || "Clip";
	const padWidth = Math.max(3, String(startIndex + assets.length - 1).length);
	return assets.map((asset, index) => ({
		assetId: asset.id,
		name: `${normalizedPrefix} ${String(startIndex + index).padStart(
			padWidth,
			"0",
		)}${fileExtension({ name: asset.name })}`,
	}));
}

function canvasToBlob({
	canvas,
	type,
	quality,
}: {
	canvas: HTMLCanvasElement;
	type: string;
	quality?: number;
}): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Browser could not encode the proxy image"));
			},
			type,
			quality,
		);
	});
}

function proxyBaseName({ name }: { name: string }): string {
	const lastDot = name.lastIndexOf(".");
	return lastDot > 0 ? name.slice(0, lastDot) : name;
}

async function generateImageProxy({
	asset,
	onProgress,
}: {
	asset: MediaAsset;
	onProgress?: (progress: number) => void;
}): Promise<GeneratedMediaProxy> {
	onProgress?.(0.05);
	const bitmap = await createImageBitmap(asset.file);
	const dimensions = computeProxyDimensions({
		width: asset.width ?? bitmap.width,
		height: asset.height ?? bitmap.height,
	});
	const canvas = document.createElement("canvas");
	canvas.width = dimensions.width;
	canvas.height = dimensions.height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is not available");
	context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
	bitmap.close();
	onProgress?.(0.65);
	const blob = await canvasToBlob({
		canvas,
		type: "image/webp",
		quality: 0.78,
	});
	const name = `${proxyBaseName({ name: asset.name })}.proxy.webp`;
	const file = new File([blob], name, {
		type: blob.type,
		lastModified: Date.now(),
	});
	onProgress?.(1);
	return {
		metadata: {
			storageId: getMediaProxyStorageId({ mediaId: asset.id }),
			name,
			mimeType: file.type,
			size: file.size,
			width: dimensions.width,
			height: dimensions.height,
			generatedAt: new Date().toISOString(),
			sourceSize: asset.file.size,
			sourceLastModified: asset.file.lastModified,
			enabled: true,
		},
		file,
		url: URL.createObjectURL(file),
	};
}

async function generateVideoProxy({
	asset,
	onProgress,
}: {
	asset: MediaAsset;
	onProgress?: (progress: number) => void;
}): Promise<GeneratedMediaProxy> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(asset.file),
	});

	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error("The source does not contain a video track");
		if (!(await videoTrack.canDecode())) {
			throw new Error("This browser cannot decode the source video");
		}

		const dimensions = computeProxyDimensions({
			width: videoTrack.displayWidth,
			height: videoTrack.displayHeight,
		});
		const duration = Math.max(1 / DEFAULT_PROXY_FPS, await input.computeDuration());
		const useMp4 = await canEncodeVideo("avc", {
			width: dimensions.width,
			height: dimensions.height,
			bitrate: DEFAULT_PROXY_BITRATE,
		});
		const codec = useMp4 ? "avc" : "vp9";
		if (
			!useMp4 &&
			!(await canEncodeVideo("vp9", {
				width: dimensions.width,
				height: dimensions.height,
				bitrate: DEFAULT_PROXY_BITRATE,
			}))
		) {
			throw new Error("This browser cannot encode an H.264 or VP9 proxy");
		}

		const target = new BufferTarget();
		const output = new Output({
			format: useMp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
			target,
		});
		const outputCanvas = document.createElement("canvas");
		outputCanvas.width = dimensions.width;
		outputCanvas.height = dimensions.height;
		const outputContext = outputCanvas.getContext("2d");
		if (!outputContext) throw new Error("Canvas is not available");
		const videoSource = new CanvasSource(outputCanvas, {
			codec,
			bitrate: DEFAULT_PROXY_BITRATE,
			keyFrameInterval: 2,
			latencyMode: "realtime",
		});
		output.addVideoTrack(videoSource, { frameRate: DEFAULT_PROXY_FPS });
		await output.start();

		const sink = new CanvasSink(videoTrack, {
			width: dimensions.width,
			height: dimensions.height,
			fit: "contain",
			poolSize: 2,
		});
		const frameCount = Math.max(1, Math.ceil(duration * DEFAULT_PROXY_FPS));
		const timestamps = Array.from(
			{ length: frameCount },
			(_, index) => index / DEFAULT_PROXY_FPS,
		);

		let frameIndex = 0;
		for await (const frame of sink.canvasesAtTimestamps(timestamps)) {
			if (!frame) continue;
			outputContext.clearRect(0, 0, dimensions.width, dimensions.height);
			outputContext.drawImage(
				frame.canvas,
				0,
				0,
				dimensions.width,
				dimensions.height,
			);
			await videoSource.add(
				frameIndex / DEFAULT_PROXY_FPS,
				1 / DEFAULT_PROXY_FPS,
			);
			frameIndex += 1;
			onProgress?.(frameIndex / frameCount);
		}

		videoSource.close();
		await output.finalize();
		if (!target.buffer) throw new Error("Proxy encoder returned no output");
		const extension = useMp4 ? "mp4" : "webm";
		const mimeType = useMp4 ? "video/mp4" : "video/webm";
		const name = `${proxyBaseName({ name: asset.name })}.proxy.${extension}`;
		const file = new File([target.buffer], name, {
			type: mimeType,
			lastModified: Date.now(),
		});
		onProgress?.(1);
		return {
			metadata: {
				storageId: getMediaProxyStorageId({ mediaId: asset.id }),
				name,
				mimeType,
				size: file.size,
				width: dimensions.width,
				height: dimensions.height,
				generatedAt: new Date().toISOString(),
				sourceSize: asset.file.size,
				sourceLastModified: asset.file.lastModified,
				enabled: true,
			},
			file,
			url: URL.createObjectURL(file),
		};
	} finally {
		input.dispose();
	}
}

export async function generateMediaProxy({
	asset,
	onProgress,
}: {
	asset: MediaAsset;
	onProgress?: (progress: number) => void;
}): Promise<GeneratedMediaProxy> {
	if (asset.type === "audio") {
		throw new Error("Audio assets already use the original waveform and do not need a proxy");
	}
	return asset.type === "image"
		? generateImageProxy({ asset, onProgress })
		: generateVideoProxy({ asset, onProgress });
}
