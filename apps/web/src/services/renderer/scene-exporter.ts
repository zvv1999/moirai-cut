import EventEmitter from "eventemitter3";

import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
	AudioBufferSource,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_HIGH,
	QUALITY_VERY_HIGH,
} from "mediabunny";
import type { FrameRate } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";
import { frameRateToFloat } from "@/fps/utils";
import type { RootNode } from "./nodes/root-node";
import type {
	AgentExportQuality,
	ExportAudioCodec,
	ExportFormat,
	ExportHardwareAcceleration,
	ExportVideoCodec,
} from "@/export";
import { CanvasRenderer } from "./canvas-renderer";

type ExportParams = {
	width: number;
	height: number;
	fps: FrameRate;
	format: ExportFormat;
	quality: AgentExportQuality;
	videoCodec?: ExportVideoCodec;
	videoBitrate?: number;
	audioCodec?: ExportAudioCodec;
	audioBitrate?: number;
	includeAlpha?: boolean;
	hardwareAcceleration?: ExportHardwareAcceleration;
	shouldIncludeAudio?: boolean;
	audioBuffer?: AudioBuffer;
};

const qualityMap = {
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	high: QUALITY_HIGH,
	very_high: QUALITY_VERY_HIGH,
	draft: QUALITY_LOW,
} satisfies Record<AgentExportQuality, typeof QUALITY_LOW>;

export type SceneExporterEvents = {
	progress: [progress: number];
	complete: [buffer: ArrayBuffer];
	error: [error: Error];
	cancelled: [];
};

export class SceneExporter extends EventEmitter<SceneExporterEvents> {
	private renderer: CanvasRenderer;
	private format: ExportFormat;
	private quality: AgentExportQuality;
	private videoCodec: ExportVideoCodec;
	private videoBitrate?: number;
	private audioCodec: ExportAudioCodec;
	private audioBitrate?: number;
	private includeAlpha: boolean;
	private hardwareAcceleration: ExportHardwareAcceleration;
	private shouldIncludeAudio: boolean;
	private audioBuffer?: AudioBuffer;

	private isCancelled = false;

	constructor({
		width,
		height,
		fps,
		format,
		quality,
		videoCodec,
		videoBitrate,
		audioCodec,
		audioBitrate,
		includeAlpha,
		hardwareAcceleration,
		shouldIncludeAudio,
		audioBuffer,
	}: ExportParams) {
		super();
		this.renderer = new CanvasRenderer({
			width,
			height,
			fps,
		});

		this.format = format;
		this.quality = quality;
		this.videoCodec = videoCodec ?? (format === "webm" ? "vp9" : "avc");
		this.videoBitrate = videoBitrate;
		this.audioCodec = audioCodec ?? (format === "webm" ? "opus" : "aac");
		this.audioBitrate = audioBitrate;
		this.includeAlpha = includeAlpha ?? false;
		this.hardwareAcceleration = hardwareAcceleration ?? "no-preference";
		this.shouldIncludeAudio = shouldIncludeAudio ?? false;
		this.audioBuffer = audioBuffer;
	}

	cancel(): void {
		this.isCancelled = true;
	}

	async export({
		rootNode,
		startTime = 0,
		endTime = rootNode.duration,
	}: {
		rootNode: RootNode;
		startTime?: number;
		endTime?: number;
	}): Promise<ArrayBuffer | null> {
		const fps = this.renderer.fps;
		const fpsFloat = frameRateToFloat(fps);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const safeStartTime = Math.max(0, Math.min(startTime, rootNode.duration));
		const safeEndTime = Math.max(
			safeStartTime,
			Math.min(endTime, rootNode.duration),
		);
		const frameCount = Math.floor(
			(safeEndTime - safeStartTime) / ticksPerFrame,
		);
		if (frameCount <= 0) {
			throw new Error("Export range contains no complete video frames");
		}

		const outputFormat =
			this.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		const videoSource = new CanvasSource(this.renderer.getOutputCanvas(), {
			codec: this.videoCodec,
			bitrate: this.videoBitrate ?? qualityMap[this.quality],
			alpha: this.includeAlpha ? "keep" : "discard",
			hardwareAcceleration: this.hardwareAcceleration,
		});

		output.addVideoTrack(videoSource, { frameRate: fpsFloat });

		let audioSource: AudioBufferSource | null = null;
		if (this.shouldIncludeAudio && this.audioBuffer) {
			audioSource = new AudioBufferSource({
				codec: this.audioCodec,
				bitrate: this.audioBitrate ?? qualityMap[this.quality],
			});
			output.addAudioTrack(audioSource);
		}

		await output.start();

		if (audioSource && this.audioBuffer) {
			await audioSource.add(this.audioBuffer);
			audioSource.close();
		}

		for (let i = 0; i < frameCount; i++) {
			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			const sourceTimeTicks = safeStartTime + i * ticksPerFrame;
			const outputTimeSeconds = i / fpsFloat;
			await this.renderer.render({ node: rootNode, time: sourceTimeTicks });
			await videoSource.add(outputTimeSeconds, 1 / fpsFloat);

			this.emit("progress", i / frameCount);
		}

		if (this.isCancelled) {
			await output.cancel();
			this.emit("cancelled");
			return null;
		}

		videoSource.close();
		await output.finalize();
		this.emit("progress", 1);

		const buffer = output.target.buffer;
		if (!buffer) {
			this.emit("error", new Error("Failed to export video"));
			return null;
		}

		this.emit("complete", buffer);
		return buffer;
	}
}
