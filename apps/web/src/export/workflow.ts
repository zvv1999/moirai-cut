import type { FrameRate } from "opencut-wasm";
import { canEncodeVideo } from "mediabunny";
import type {
	ExportAudioCodec,
	ExportFormat,
	ExportHardwareAcceleration,
	ExportOptions,
	ExportQuality,
	ExportRange,
	ExportVideoCodec,
} from "@/export";
import type { DeliveryPresetName } from "@/export/native-delivery-contract";
import type {
	ProjectHealthFinding,
	ProjectHealthResult,
} from "@/project/project-health";

export type ExportPresetId =
	| "source"
	| "landscape-hd"
	| "vertical-social"
	| "square-social"
	| "youtube-4k"
	| "transparent-webm";

export interface ExportSourceSettings {
	width: number;
	height: number;
	fps: FrameRate;
}

export interface ExportDraft {
	presetId: ExportPresetId;
	format: ExportFormat;
	quality: ExportQuality;
	width: number;
	height: number;
	fps: FrameRate;
	videoCodec: ExportVideoCodec;
	videoBitrate: number;
	includeAudio: boolean;
	audioCodec: ExportAudioCodec;
	audioBitrate: number;
	includeAlpha: boolean;
	hardwareAcceleration: ExportHardwareAcceleration;
	range?: ExportRange | undefined;
}

export interface ExportPlatformPreset {
	id: ExportPresetId;
	name: string;
	description: string;
	platform: string;
}

export const EXPORT_PLATFORM_PRESETS: ExportPlatformPreset[] = [
	{
		id: "source",
		name: "Match project",
		description: "Project canvas and frame rate",
		platform: "Source",
	},
	{
		id: "landscape-hd",
		name: "Landscape HD",
		description: "1920×1080 · H.264",
		platform: "16:9",
	},
	{
		id: "vertical-social",
		name: "Vertical social",
		description: "1080×1920 · Reels / TikTok / Shorts",
		platform: "9:16",
	},
	{
		id: "square-social",
		name: "Square social",
		description: "1080×1080 · Feed",
		platform: "1:1",
	},
	{
		id: "youtube-4k",
		name: "YouTube 4K",
		description: "3840×2160 · high bitrate",
		platform: "YouTube",
	},
	{
		id: "transparent-webm",
		name: "Transparent WebM",
		description: "VP9 alpha · overlay delivery",
		platform: "Alpha",
	},
];

function defaultDraft({
	source,
}: {
	source: ExportSourceSettings;
}): ExportDraft {
	return {
		presetId: "source",
		format: "mp4",
		quality: "high",
		width: source.width,
		height: source.height,
		fps: { ...source.fps },
		videoCodec: "avc",
		videoBitrate: 12_000_000,
		includeAudio: true,
		audioCodec: "aac",
		audioBitrate: 192_000,
		includeAlpha: false,
		hardwareAcceleration: "prefer-hardware",
	};
}

export function createExportDraftFromPreset({
	presetId,
	source,
}: {
	presetId: ExportPresetId;
	source: ExportSourceSettings;
}): ExportDraft {
	const base = defaultDraft({ source });
	switch (presetId) {
		case "source":
			return base;
		case "landscape-hd":
			return {
				...base,
				presetId,
				width: 1920,
				height: 1080,
				videoBitrate: 8_000_000,
			};
		case "vertical-social":
			return {
				...base,
				presetId,
				width: 1080,
				height: 1920,
				videoBitrate: 10_000_000,
			};
		case "square-social":
			return {
				...base,
				presetId,
				width: 1080,
				height: 1080,
				videoBitrate: 8_000_000,
			};
		case "youtube-4k":
			return {
				...base,
				presetId,
				width: 3840,
				height: 2160,
				videoBitrate: 35_000_000,
				quality: "very_high",
			};
		case "transparent-webm":
			return {
				...base,
				presetId,
				format: "webm",
				videoCodec: "vp9",
				videoBitrate: 12_000_000,
				audioCodec: "opus",
				includeAlpha: true,
			};
	}
}

export function exportDraftToOptions({
	draft,
}: {
	draft: ExportDraft;
}): ExportOptions {
	return {
		format: draft.format,
		quality: draft.quality,
		fps: { ...draft.fps },
		includeAudio: draft.includeAudio,
		width: draft.width,
		height: draft.height,
		videoCodec: draft.videoCodec,
		videoBitrate: draft.videoBitrate,
		audioCodec: draft.audioCodec,
		audioBitrate: draft.audioBitrate,
		includeAlpha: draft.includeAlpha,
		hardwareAcceleration: draft.hardwareAcceleration,
		...(draft.range ? { range: { ...draft.range } } : {}),
	};
}

export interface ExportCapabilitySummary {
	videoCodecSupported: boolean;
	audioCodecSupported: boolean;
	hardwareAccelerationAvailable: boolean;
}

export type ExportProgressPhase =
	"preparing" | "rendering" | "saving" | "transcoding" | "downloading";

export interface ActiveExportUiState {
	jobId: string | null;
	progress: number;
	step: string;
	startedAtMs: number;
}

export function createActiveExportUiState({
	startedAtMs,
}: {
	startedAtMs: number;
}): ActiveExportUiState {
	return {
		jobId: null,
		progress: 0,
		step: "正在准备导出",
		startedAtMs,
	};
}

export function mergeActiveExportUiState({
	current,
	progress,
	step,
	jobId,
}: {
	current: ActiveExportUiState;
	progress: number;
	step: string;
	jobId?: string;
}): ActiveExportUiState {
	return {
		...current,
		...(jobId ? { jobId } : {}),
		progress: Math.max(current.progress, Math.max(0, Math.min(1, progress))),
		step,
	};
}

const EXPORT_PROGRESS_RANGES: Record<
	ExportProgressPhase,
	{ start: number; end: number }
> = {
	preparing: { start: 0, end: 0.04 },
	rendering: { start: 0.04, end: 0.88 },
	saving: { start: 0.88, end: 0.91 },
	transcoding: { start: 0.91, end: 0.98 },
	downloading: { start: 0.98, end: 0.995 },
};

export function mapExportPhaseProgress({
	phase,
	progress,
}: {
	phase: ExportProgressPhase;
	progress: number;
}): number {
	const range = EXPORT_PROGRESS_RANGES[phase];
	const bounded = Math.max(0, Math.min(1, progress));
	return (
		Math.round((range.start + (range.end - range.start) * bounded) * 1000) /
		1000
	);
}

export function advanceIndeterminateExportProgress({
	current,
	ceiling = EXPORT_PROGRESS_RANGES.transcoding.end,
}: {
	current: number;
	ceiling?: number;
}): number {
	if (current >= ceiling) return ceiling;
	const remaining = ceiling - current;
	return Math.min(
		ceiling - 0.0001,
		current + Math.max(0.001, remaining * 0.08),
	);
}

export type ExportDeliverySelection = "browser" | DeliveryPresetName;

export interface ExportRenderPlan {
	renderDraft: ExportDraft;
	delivery: ExportDeliverySelection;
	usesFfmpegFallback: boolean;
}

function capabilitiesSupportDraft({
	draft,
	capabilities,
}: {
	draft: ExportDraft;
	capabilities: ExportCapabilitySummary;
}): boolean {
	return (
		capabilities.videoCodecSupported &&
		(!draft.includeAudio || capabilities.audioCodecSupported)
	);
}

export function createFfmpegIntermediateDraft({
	draft,
}: {
	draft: ExportDraft;
}): ExportDraft {
	return {
		...draft,
		format: "webm",
		videoCodec: "vp9",
		audioCodec: "opus",
		includeAlpha: false,
		hardwareAcceleration: "no-preference",
	};
}

/**
 * Keep canvas rendering in the browser, but route an unsupported MP4 encode
 * through a browser-compatible VP9 intermediate and the local FFmpeg delivery
 * service. This preserves every rendered caption/MG frame while avoiding a
 * hard dependency on Chrome's optional AVC encoder.
 */
export function resolveExportRenderPlan({
	draft,
	requestedDelivery,
	directCapabilities,
	fallbackCapabilities,
}: {
	draft: ExportDraft;
	requestedDelivery: ExportDeliverySelection;
	directCapabilities: ExportCapabilitySummary;
	fallbackCapabilities?: ExportCapabilitySummary;
}): ExportRenderPlan {
	if (capabilitiesSupportDraft({ draft, capabilities: directCapabilities })) {
		return {
			renderDraft: draft,
			delivery: requestedDelivery,
			usesFfmpegFallback: false,
		};
	}

	const canFallback =
		draft.format === "mp4" &&
		draft.videoCodec === "avc" &&
		draft.audioCodec === "aac" &&
		!draft.includeAlpha;
	const renderDraft = createFfmpegIntermediateDraft({ draft });
	if (
		canFallback &&
		fallbackCapabilities &&
		capabilitiesSupportDraft({
			draft: renderDraft,
			capabilities: fallbackCapabilities,
		})
	) {
		return {
			renderDraft,
			delivery:
				requestedDelivery === "browser" ? "h264-mp4" : requestedDelivery,
			usesFfmpegFallback: true,
		};
	}

	return {
		renderDraft: draft,
		delivery: requestedDelivery,
		usesFfmpegFallback: false,
	};
}

export type ExportValidationCode =
	| "invalid_resolution"
	| "invalid_frame_rate"
	| "invalid_video_bitrate"
	| "invalid_audio_bitrate"
	| "invalid_range"
	| "container_video_codec"
	| "container_audio_codec"
	| "alpha_container"
	| "video_codec_unavailable"
	| "audio_codec_unavailable"
	| "hardware_unavailable";

export interface ExportValidationIssue {
	code: ExportValidationCode;
	severity: "error" | "warning";
	message: string;
}

export function validateExportDraft({
	draft,
	capabilities,
	timelineDurationSeconds,
}: {
	draft: ExportDraft;
	capabilities?: ExportCapabilitySummary;
	timelineDurationSeconds?: number;
}): ExportValidationIssue[] {
	const issues: ExportValidationIssue[] = [];
	if (
		!Number.isInteger(draft.width) ||
		!Number.isInteger(draft.height) ||
		draft.width < 16 ||
		draft.height < 16 ||
		draft.width > 8192 ||
		draft.height > 8192
	) {
		issues.push({
			code: "invalid_resolution",
			severity: "error",
			message: "Resolution must be whole pixels between 16 and 8192.",
		});
	}
	if (
		!Number.isFinite(draft.fps.numerator) ||
		!Number.isFinite(draft.fps.denominator) ||
		draft.fps.numerator <= 0 ||
		draft.fps.denominator <= 0
	) {
		issues.push({
			code: "invalid_frame_rate",
			severity: "error",
			message: "Frame rate must be positive.",
		});
	}
	if (
		!Number.isFinite(draft.videoBitrate) ||
		draft.videoBitrate < 250_000 ||
		draft.videoBitrate > 200_000_000
	) {
		issues.push({
			code: "invalid_video_bitrate",
			severity: "error",
			message: "Video bitrate must be between 0.25 and 200 Mbps.",
		});
	}
	if (
		draft.includeAudio &&
		(!Number.isFinite(draft.audioBitrate) ||
			draft.audioBitrate < 32_000 ||
			draft.audioBitrate > 512_000)
	) {
		issues.push({
			code: "invalid_audio_bitrate",
			severity: "error",
			message: "Audio bitrate must be between 32 and 512 Kbps.",
		});
	}
	if (
		draft.range &&
		(!Number.isFinite(draft.range.startSeconds) ||
			!Number.isFinite(draft.range.endSeconds) ||
			draft.range.startSeconds < 0 ||
			draft.range.endSeconds <= draft.range.startSeconds)
	) {
		issues.push({
			code: "invalid_range",
			severity: "error",
			message: "Export range must end after a non-negative start.",
		});
	} else if (
		draft.range &&
		timelineDurationSeconds !== undefined &&
		(draft.range.startSeconds >= timelineDurationSeconds ||
			draft.range.endSeconds > timelineDurationSeconds)
	) {
		issues.push({
			code: "invalid_range",
			severity: "error",
			message: `Export range must stay within the ${timelineDurationSeconds.toFixed(2)}s timeline.`,
		});
	}
	const supportedVideo =
		draft.format === "mp4"
			? new Set<ExportVideoCodec>(["avc"])
			: new Set<ExportVideoCodec>(["vp9", "av1"]);
	if (!supportedVideo.has(draft.videoCodec)) {
		issues.push({
			code: "container_video_codec",
			severity: "error",
			message: `${draft.videoCodec.toUpperCase()} is not supported in ${draft.format.toUpperCase()}.`,
		});
	}
	const expectedAudio: ExportAudioCodec =
		draft.format === "mp4" ? "aac" : "opus";
	if (draft.includeAudio && draft.audioCodec !== expectedAudio) {
		issues.push({
			code: "container_audio_codec",
			severity: "error",
			message: `${draft.format.toUpperCase()} requires ${expectedAudio.toUpperCase()} audio in OpenCut.`,
		});
	}
	if (draft.includeAlpha && draft.format !== "webm") {
		issues.push({
			code: "alpha_container",
			severity: "error",
			message: "Transparent video requires WebM.",
		});
	}
	if (capabilities && !capabilities.videoCodecSupported) {
		issues.push({
			code: "video_codec_unavailable",
			severity: "error",
			message: "The selected video codec is unavailable in this browser.",
		});
	}
	if (capabilities && draft.includeAudio && !capabilities.audioCodecSupported) {
		issues.push({
			code: "audio_codec_unavailable",
			severity: "error",
			message: "The selected audio codec is unavailable in this browser.",
		});
	}
	if (
		capabilities &&
		draft.hardwareAcceleration === "prefer-hardware" &&
		!capabilities.hardwareAccelerationAvailable
	) {
		issues.push({
			code: "hardware_unavailable",
			severity: "warning",
			message:
				"Hardware encoding was not confirmed; software fallback may be used.",
		});
	}
	return issues;
}

const exportCapabilityCache = new Map<
	string,
	Promise<ExportCapabilitySummary>
>();

export async function detectExportCapabilities({
	draft,
}: {
	draft: ExportDraft;
}): Promise<ExportCapabilitySummary> {
	const cacheKey = JSON.stringify({
		format: draft.format,
		width: draft.width,
		height: draft.height,
		videoCodec: draft.videoCodec,
		videoBitrate: draft.videoBitrate,
		includeAudio: draft.includeAudio,
		audioCodec: draft.audioCodec,
		audioBitrate: draft.audioBitrate,
		hardwareAcceleration: draft.hardwareAcceleration,
	});
	const cached = exportCapabilityCache.get(cacheKey);
	if (cached) return cached;

	const probe = (async (): Promise<ExportCapabilitySummary> => {
		let videoCodecSupported = false;
		try {
			videoCodecSupported = await canEncodeVideo(draft.videoCodec, {
				width: draft.width,
				height: draft.height,
				bitrate: draft.videoBitrate,
				hardwareAcceleration: draft.hardwareAcceleration,
				alpha: draft.includeAlpha ? "keep" : "discard",
			});
		} catch {
			videoCodecSupported = false;
		}
		const hardwareAccelerationAvailable =
			videoCodecSupported && draft.hardwareAcceleration === "prefer-hardware";
		let audioCodecSupported =
			!draft.includeAudio || typeof AudioEncoder !== "undefined";
		if (audioCodecSupported && draft.includeAudio) {
			try {
				const result = await AudioEncoder.isConfigSupported({
					codec: draft.audioCodec === "aac" ? "mp4a.40.2" : "opus",
					sampleRate: 44_100,
					numberOfChannels: 2,
					bitrate: draft.audioBitrate,
				});
				audioCodecSupported = result.supported === true;
			} catch {
				audioCodecSupported = false;
			}
		}
		return {
			videoCodecSupported,
			audioCodecSupported,
			hardwareAccelerationAvailable,
		};
	})();
	exportCapabilityCache.set(cacheKey, probe);
	void probe.catch(() => exportCapabilityCache.delete(cacheKey));
	return probe;
}

export interface ExportEstimate {
	durationSeconds: number;
	estimatedBytes: number;
	estimatedRenderSeconds: number;
	frameCount: number;
	label: string;
}

export function buildExportEstimate({
	draft,
	durationSeconds,
	hardwarePixelsPerSecond = 90_000_000,
}: {
	draft: ExportDraft;
	durationSeconds: number;
	hardwarePixelsPerSecond?: number;
}): ExportEstimate {
	const selectedDuration = draft.range
		? Math.max(0, draft.range.endSeconds - draft.range.startSeconds)
		: Math.max(0, durationSeconds);
	const fps = draft.fps.numerator / draft.fps.denominator;
	const frameCount = Math.ceil(selectedDuration * fps);
	const bitsPerSecond =
		draft.videoBitrate + (draft.includeAudio ? draft.audioBitrate : 0);
	const estimatedBytes = Math.ceil(
		(selectedDuration * bitsPerSecond * 1.03) / 8,
	);
	const pixels = draft.width * draft.height * frameCount;
	const estimatedRenderSeconds = Math.max(
		1,
		pixels / Math.max(1, hardwarePixelsPerSecond),
	);
	return {
		durationSeconds: selectedDuration,
		estimatedBytes,
		estimatedRenderSeconds,
		frameCount,
		label:
			"Planning estimate based on configured bitrates and pixel throughput",
	};
}

export function estimateRemainingSeconds({
	elapsedSeconds,
	progress,
}: {
	elapsedSeconds: number;
	progress: number;
}): number | null {
	if (progress <= 0 || progress >= 1 || elapsedSeconds < 0) return null;
	return Math.max(0, (elapsedSeconds * (1 - progress)) / progress);
}

export interface ExportRenderSample {
	atSeconds: number;
	success: boolean;
	error?: string;
}

export interface ExportPreflightFinding {
	id: string;
	source: "health" | "render" | "encoding";
	severity: "error" | "warning" | "note";
	message: string;
	atSeconds?: number;
	trackId?: string;
	elementId?: string;
}

export interface ExportPreflightResult {
	ready: boolean;
	findings: ExportPreflightFinding[];
	checkedSamples: number;
}

function healthFindingToPreflight(
	finding: ProjectHealthFinding,
): ExportPreflightFinding {
	return {
		id: `health:${finding.id}`,
		source: "health",
		severity: finding.severity,
		message: finding.message,
		...(finding.atSeconds === undefined
			? {}
			: { atSeconds: finding.atSeconds }),
		...(finding.trackId === undefined ? {} : { trackId: finding.trackId }),
		...(finding.elementId === undefined
			? {}
			: { elementId: finding.elementId }),
	};
}

export function buildExportPreflight({
	health,
	renderSamples,
	encodingIssues,
}: {
	health: ProjectHealthResult;
	renderSamples: ExportRenderSample[];
	encodingIssues: ExportValidationIssue[];
}): ExportPreflightResult {
	const findings = health.findings.map(healthFindingToPreflight);
	for (const sample of renderSamples) {
		if (sample.success) continue;
		findings.push({
			id: `render:${sample.atSeconds}`,
			source: "render",
			severity: "error",
			message: sample.error || "Representative frame did not render.",
			atSeconds: sample.atSeconds,
		});
	}
	for (const issue of encodingIssues) {
		findings.push({
			id: `encoding:${issue.code}`,
			source: "encoding",
			severity: issue.severity,
			message: issue.message,
		});
	}
	return {
		ready: !findings.some((finding) => finding.severity === "error"),
		findings,
		checkedSamples: renderSamples.length,
	};
}

export type ComponentExportKind =
	| "audio-mix"
	| "audio-stem"
	| "captions"
	| "still"
	| "alpha-video"
	| "range-video";

export interface ComponentExportPlanItem {
	id: string;
	kind: ComponentExportKind;
	label: string;
	available: boolean;
	reason: string | null;
	trackId?: string;
}

export function buildComponentExportPlan({
	captionCount,
	audioTracks,
	range,
	alphaAvailable,
}: {
	captionCount: number;
	audioTracks: Array<{ id: string; name: string }>;
	range?: ExportRange;
	alphaAvailable: boolean;
}): ComponentExportPlanItem[] {
	const validRange =
		range !== undefined &&
		range.startSeconds >= 0 &&
		range.endSeconds > range.startSeconds;
	return [
		{
			id: "audio-mix",
			kind: "audio-mix",
			label: "Full audio mix (WAV)",
			available: audioTracks.length > 0,
			reason: audioTracks.length > 0 ? null : "No audible tracks",
		},
		...audioTracks.map((track) => ({
			id: `stem:${track.id}`,
			kind: "audio-stem" as const,
			label: `${track.name} stem (WAV)`,
			available: true,
			reason: null,
			trackId: track.id,
		})),
		{
			id: "captions",
			kind: "captions",
			label: "Captions (WebVTT)",
			available: captionCount > 0,
			reason: captionCount > 0 ? null : "No caption cues",
		},
		{
			id: "still",
			kind: "still",
			label: "Still at playhead (PNG)",
			available: true,
			reason: null,
		},
		{
			id: "alpha-video",
			kind: "alpha-video",
			label: "Transparent video (WebM)",
			available: alphaAvailable,
			reason: alphaAvailable ? null : "VP9 alpha unavailable",
		},
		{
			id: "range-video",
			kind: "range-video",
			label: "Selected range video",
			available: validRange,
			reason: validRange ? null : "Set a valid In and Out range",
		},
	];
}
