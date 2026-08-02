import type { EditorCore } from "@/core";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import type { ExportOptions, ExportResult } from "@/export";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import { buildScene } from "@/services/renderer/scene-builder";
import { createAudioContext, createTimelineAudioBuffer } from "@/media/audio";
import { formatTimecode } from "opencut-wasm";
import { downloadBlob } from "@/utils/browser";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";

function sliceAudioBuffer({
	buffer,
	startSeconds,
	endSeconds,
}: {
	buffer: AudioBuffer;
	startSeconds: number;
	endSeconds: number;
}): AudioBuffer {
	const startSample = Math.max(
		0,
		Math.min(buffer.length, Math.floor(startSeconds * buffer.sampleRate)),
	);
	const endSample = Math.max(
		startSample,
		Math.min(buffer.length, Math.ceil(endSeconds * buffer.sampleRate)),
	);
	const context = createAudioContext({ sampleRate: buffer.sampleRate });
	const sliced = context.createBuffer(
		buffer.numberOfChannels,
		endSample - startSample,
		buffer.sampleRate,
	);
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		sliced.copyToChannel(
			buffer.getChannelData(channel).slice(startSample, endSample),
			channel,
		);
	}
	return sliced;
}

type SnapshotResult =
	| { success: true; blob: Blob; filename: string }
	| { success: false; error: string };

export class RendererManager {
	private renderTree: RootNode | null = null;
	private _isDegraded = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	get isDegraded(): boolean {
		return this._isDegraded;
	}

	setDegraded(degraded: boolean): void {
		if (this._isDegraded === degraded) return;
		this._isDegraded = degraded;
		this.notify();
	}

	setRenderTree({ renderTree }: { renderTree: RootNode | null }): void {
		this.renderTree = renderTree;
		this.notify();
	}

	getRenderTree(): RootNode | null {
		return this.renderTree;
	}

	/**
	 * Render one frame at an arbitrary time, as a PNG data URL.
	 *
	 * Deliberately builds the scene with `buildScene` from the document rather
	 * than reusing `this.renderTree`: that tree is published by the preview React
	 * component, so it only exists while the preview is mounted and reflects what
	 * the preview last drew. Building from the document is what the export path
	 * does too (`exportProject` below), so a frame captured here is the same
	 * frame the export would produce — which is the whole point of using it as
	 * evidence rather than as a thumbnail.
	 *
	 * Unlike `createSnapshot`, the time is a parameter and not the playhead: a
	 * caller verifying an edit needs to look where the edit is.
	 */
	async renderFrame({ time }: { time: MediaTime }): Promise<
		| {
				success: true;
				dataUrl: string;
				width: number;
				height: number;
				time: MediaTime;
		  }
		| { success: false; error: string }
	> {
		try {
			const activeProject = this.editor.project.getActiveOrNull();
			if (!activeProject) return { success: false, error: "No active project" };

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) return { success: false, error: "Project is empty" };

			// Past the last frame there is nothing to draw, and an unclamped time
			// silently yields a blank image that looks like a failed edit.
			const lastFrame = this.editor.timeline.getLastFrameTime();
			const renderTime = (time > lastFrame ? lastFrame : time) as MediaTime;

			const { canvasSize, background, fps } = activeProject.settings;
			const scene = buildScene({
				tracks: this.editor.scenes.getActiveScene().tracks,
				mediaAssets: this.editor.media.getAssets(),
				duration,
				canvasSize,
				background,
			});

			const renderer = new CanvasRenderer({
				width: canvasSize.width,
				height: canvasSize.height,
				fps,
			});
			const canvas = document.createElement("canvas");
			canvas.width = canvasSize.width;
			canvas.height = canvasSize.height;
			await renderer.renderToCanvas({
				node: scene,
				time: renderTime,
				targetCanvas: canvas,
			});

			return {
				success: true,
				dataUrl: canvas.toDataURL("image/png"),
				width: canvasSize.width,
				height: canvasSize.height,
				time: renderTime,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async saveSnapshot(): Promise<{ success: boolean; error?: string }> {
		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		downloadBlob({ blob: snapshot.blob, filename: snapshot.filename });
		return { success: true };
	}

	async copySnapshot(): Promise<{ success: boolean; error?: string }> {
		if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
			return {
				success: false,
				error: "Clipboard image copy is not supported in this browser",
			};
		}

		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					[snapshot.blob.type || "image/png"]: snapshot.blob,
				}),
			]);
			return { success: true };
		} catch (error) {
			console.error("Copy snapshot failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private async createSnapshot(): Promise<SnapshotResult> {
		try {
			const renderTree = this.getRenderTree();
			const activeProject = this.editor.project.getActive();

			if (!renderTree || !activeProject) {
				return { success: false, error: "No project or scene to capture" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const { canvasSize, fps } = activeProject.settings;
			const renderTime = Math.min(
				this.editor.playback.getCurrentTime(),
				this.editor.timeline.getLastFrameTime(),
			);

			const renderer = new CanvasRenderer({
				width: canvasSize.width,
				height: canvasSize.height,
				fps,
			});

			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = canvasSize.width;
			tempCanvas.height = canvasSize.height;

			await renderer.renderToCanvas({
				node: renderTree,
				time: renderTime,
				targetCanvas: tempCanvas,
			});

			const blob = await new Promise<Blob | null>((resolve) => {
				tempCanvas.toBlob((result) => resolve(result), "image/png");
			});

			if (!blob) {
				return { success: false, error: "Failed to create image" };
			}

			const timecode = formatTimecode({ time: renderTime, rate: fps })!.replace(
				/:/g,
				"-",
			);
			const safeName =
				activeProject.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() ||
				"snapshot";
			const filename = `${safeName}-${timecode}.png`;

			return { success: true, blob, filename };
		} catch (error) {
			console.error("Snapshot capture failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async exportProject({
		options,
		onProgress,
		onCancel,
	}: {
		options: ExportOptions;
		onProgress?: ({ progress }: { progress: number }) => void;
		onCancel?: () => boolean;
	}): Promise<ExportResult> {
		const {
			format,
			quality,
			fps,
			includeAudio,
			width,
			height,
			videoCodec,
			videoBitrate,
			audioCodec,
			audioBitrate,
			includeAlpha,
			hardwareAcceleration,
			range,
		} = options;

		try {
			const tracks = this.editor.scenes.getActiveScene().tracks;
			const mediaAssets = this.editor.media.getAssets();
			const activeProject = this.editor.project.getActive();

			if (!activeProject) {
				return { success: false, error: "No active project" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const exportFps = fps ?? activeProject.settings.fps;
			const projectCanvasSize = activeProject.settings.canvasSize;
			const canvasSize = {
				width: width ?? projectCanvasSize.width,
				height: height ?? projectCanvasSize.height,
			};
			const totalDurationSeconds = mediaTimeToSeconds({ time: duration });
			const rangeStartSeconds = range
				? Math.max(0, Math.min(range.startSeconds, totalDurationSeconds))
				: 0;
			const rangeEndSeconds = range
				? Math.max(
						rangeStartSeconds,
						Math.min(range.endSeconds, totalDurationSeconds),
					)
				: totalDurationSeconds;
			if (rangeEndSeconds <= rangeStartSeconds) {
				return { success: false, error: "Export range is empty" };
			}
			const exportStartTime = mediaTimeFromSeconds({
				seconds: rangeStartSeconds,
			});
			const exportEndTime = mediaTimeFromSeconds({
				seconds: rangeEndSeconds,
			});

			if (
				(format === "mp4" && videoCodec && videoCodec !== "avc") ||
				(format === "webm" && videoCodec === "avc")
			) {
				return {
					success: false,
					error: "Selected video codec is incompatible with the container",
				};
			}
			if (
				includeAudio &&
				((format === "mp4" && audioCodec && audioCodec !== "aac") ||
					(format === "webm" && audioCodec && audioCodec !== "opus"))
			) {
				return {
					success: false,
					error: "Selected audio codec is incompatible with the container",
				};
			}
			if (includeAlpha && format !== "webm") {
				return {
					success: false,
					error: "Transparent video requires WebM",
				};
			}

			let audioBuffer: AudioBuffer | null = null;
			if (includeAudio) {
				onProgress?.({ progress: 0.05 });
				audioBuffer = await createTimelineAudioBuffer({
					tracks,
					mediaAssets,
					duration,
				});
				if (
					audioBuffer &&
					(rangeStartSeconds > 0 || rangeEndSeconds < totalDurationSeconds)
				) {
					audioBuffer = sliceAudioBuffer({
						buffer: audioBuffer,
						startSeconds: rangeStartSeconds,
						endSeconds: rangeEndSeconds,
					});
				}
			}

			const scene = buildScene({
				tracks,
				mediaAssets,
				duration,
				canvasSize,
				background: includeAlpha
					? { type: "color", color: "transparent" }
					: activeProject.settings.background,
			});

			const exporter = new SceneExporter({
				width: canvasSize.width,
				height: canvasSize.height,
				fps: exportFps,
				format,
				quality,
				videoCodec,
				videoBitrate,
				audioCodec,
				audioBitrate,
				includeAlpha,
				hardwareAcceleration,
				shouldIncludeAudio: !!includeAudio,
				audioBuffer: audioBuffer || undefined,
			});

			exporter.on("progress", (progress) => {
				const adjustedProgress = includeAudio
					? 0.05 + progress * 0.95
					: progress;
				onProgress?.({ progress: adjustedProgress });
			});

			let cancelled = false;
			const checkCancel = () => {
				if (onCancel?.()) {
					cancelled = true;
					exporter.cancel();
				}
			};

			const cancelInterval = setInterval(checkCancel, 100);

			try {
				const buffer = await exporter.export({
					rootNode: scene,
					startTime: exportStartTime,
					endTime: exportEndTime,
				});
				clearInterval(cancelInterval);

				if (cancelled) {
					return { success: false, cancelled: true };
				}

				if (!buffer) {
					return { success: false, error: "Export failed to produce buffer" };
				}

				return {
					success: true,
					buffer,
				};
			} finally {
				clearInterval(cancelInterval);
			}
		} catch (error) {
			console.error("Export failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown export error",
			};
		}
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
