import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	mkdir,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
	normalizeFfprobe,
	type NormalizedMediaProbe,
	type RawFfprobeOutput,
} from "@/media/codec-capabilities";
import {
	runNativeTranscode,
	type NativeTranscodeRunner,
} from "@/server/media-jobs";
import { runFfprobe } from "@/server/media-probe";

const SAFE_PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_EXPORT_NAME = /^[\p{L}\p{N}_.-]{1,160}$/u;

export const DELIVERY_PRESET_NAMES = [
	"h264-mp4",
	"hevc-mp4",
	"hevc10-mp4",
	"h264-mov",
	"hevc-mov",
	"hevc10-mov",
	"h264-mov-pcm",
	"hevc10-mov-pcm",
	"vp9-webm",
	"av1-webm",
	"wav-pcm",
	"m4a-aac",
	"mp3",
	"flac",
	"ogg-opus",
] as const;

export type DeliveryPresetName =
	(typeof DELIVERY_PRESET_NAMES)[number];

interface DeliveryPreset {
	extension: string;
	suffix: string;
	encoder: string;
	hardwareAcceleration: "software";
	args: string[];
	expectedVideoCodec?: string;
	expectedAudioCodec?: string;
	expectedBitDepth?: number;
}

const DELIVERY_PRESETS: Record<
	DeliveryPresetName,
	DeliveryPreset
> = {
	"h264-mp4": {
		extension: "mp4",
		suffix: "h264",
		encoder: "libx264",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"16",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"256k",
			"-movflags",
			"+faststart",
		],
		expectedVideoCodec: "h264",
		expectedAudioCodec: "aac",
		expectedBitDepth: 8,
	},
	"hevc-mp4": {
		extension: "mp4",
		suffix: "hevc",
		encoder: "libx265",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx265",
			"-preset",
			"medium",
			"-crf",
			"19",
			"-pix_fmt",
			"yuv420p",
			"-tag:v",
			"hvc1",
			"-c:a",
			"aac",
			"-b:a",
			"256k",
			"-movflags",
			"+faststart",
		],
		expectedVideoCodec: "hevc",
		expectedAudioCodec: "aac",
		expectedBitDepth: 8,
	},
	"hevc10-mp4": {
		extension: "mp4",
		suffix: "hevc10",
		encoder: "libx265",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx265",
			"-preset",
			"medium",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p10le",
			"-tag:v",
			"hvc1",
			"-c:a",
			"aac",
			"-b:a",
			"256k",
			"-movflags",
			"+faststart",
		],
		expectedVideoCodec: "hevc",
		expectedAudioCodec: "aac",
		expectedBitDepth: 10,
	},
	"h264-mov": {
		extension: "mov",
		suffix: "h264",
		encoder: "libx264",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"16",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"256k",
			"-movflags",
			"+faststart",
		],
		expectedVideoCodec: "h264",
		expectedAudioCodec: "aac",
		expectedBitDepth: 8,
	},
	"hevc-mov": {
		extension: "mov",
		suffix: "hevc",
		encoder: "libx265",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx265",
			"-preset",
			"medium",
			"-crf",
			"19",
			"-pix_fmt",
			"yuv420p",
			"-tag:v",
			"hvc1",
			"-c:a",
			"aac",
			"-b:a",
			"256k",
		],
		expectedVideoCodec: "hevc",
		expectedAudioCodec: "aac",
		expectedBitDepth: 8,
	},
	"hevc10-mov": {
		extension: "mov",
		suffix: "hevc10",
		encoder: "libx265",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx265",
			"-preset",
			"medium",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p10le",
			"-tag:v",
			"hvc1",
			"-c:a",
			"aac",
			"-b:a",
			"256k",
		],
		expectedVideoCodec: "hevc",
		expectedAudioCodec: "aac",
		expectedBitDepth: 10,
	},
	"h264-mov-pcm": {
		extension: "mov",
		suffix: "h264-pcm",
		encoder: "libx264",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"16",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"pcm_s24le",
		],
		expectedVideoCodec: "h264",
		expectedAudioCodec: "pcm_s24le",
		expectedBitDepth: 8,
	},
	"hevc10-mov-pcm": {
		extension: "mov",
		suffix: "hevc10-pcm",
		encoder: "libx265",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx265",
			"-preset",
			"medium",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p10le",
			"-tag:v",
			"hvc1",
			"-c:a",
			"pcm_s24le",
		],
		expectedVideoCodec: "hevc",
		expectedAudioCodec: "pcm_s24le",
		expectedBitDepth: 10,
	},
	"vp9-webm": {
		extension: "webm",
		suffix: "vp9",
		encoder: "libvpx-vp9",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libvpx-vp9",
			"-crf",
			"20",
			"-b:v",
			"0",
			"-pix_fmt",
			"yuv420p",
			"-row-mt",
			"1",
			"-c:a",
			"libopus",
			"-b:a",
			"192k",
		],
		expectedVideoCodec: "vp9",
		expectedAudioCodec: "opus",
		expectedBitDepth: 8,
	},
	"av1-webm": {
		extension: "webm",
		suffix: "av1",
		encoder: "libaom-av1",
		hardwareAcceleration: "software",
		args: [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libaom-av1",
			"-cpu-used",
			"6",
			"-crf",
			"24",
			"-b:v",
			"0",
			"-pix_fmt",
			"yuv420p",
			"-row-mt",
			"1",
			"-c:a",
			"libopus",
			"-b:a",
			"192k",
		],
		expectedVideoCodec: "av1",
		expectedAudioCodec: "opus",
		expectedBitDepth: 8,
	},
	"wav-pcm": {
		extension: "wav",
		suffix: "pcm24",
		encoder: "pcm_s24le",
		hardwareAcceleration: "software",
		args: ["-vn", "-map", "0:a:0", "-c:a", "pcm_s24le"],
		expectedAudioCodec: "pcm_s24le",
	},
	"m4a-aac": {
		extension: "m4a",
		suffix: "aac",
		encoder: "aac",
		hardwareAcceleration: "software",
		args: [
			"-vn",
			"-map",
			"0:a:0",
			"-c:a",
			"aac",
			"-b:a",
			"256k",
			"-movflags",
			"+faststart",
		],
		expectedAudioCodec: "aac",
	},
	mp3: {
		extension: "mp3",
		suffix: "audio",
		encoder: "libmp3lame",
		hardwareAcceleration: "software",
		args: ["-vn", "-map", "0:a:0", "-c:a", "libmp3lame", "-q:a", "1"],
		expectedAudioCodec: "mp3",
	},
	flac: {
		extension: "flac",
		suffix: "audio",
		encoder: "flac",
		hardwareAcceleration: "software",
		args: ["-vn", "-map", "0:a:0", "-c:a", "flac"],
		expectedAudioCodec: "flac",
	},
	"ogg-opus": {
		extension: "ogg",
		suffix: "opus",
		encoder: "libopus",
		hardwareAcceleration: "software",
		args: [
			"-vn",
			"-map",
			"0:a:0",
			"-c:a",
			"libopus",
			"-b:a",
			"192k",
		],
		expectedAudioCodec: "opus",
	},
};

export type DeliveryRunner = NativeTranscodeRunner;
export type DeliveryProbe = ({
	filePath,
}: {
	filePath: string;
}) => Promise<RawFfprobeOutput>;
export type DeliveryDecode = ({
	filePath,
}: {
	filePath: string;
}) => Promise<void>;

export interface NativeDeliveryResult {
	projectId: string;
	sourceName: string;
	outputName: string;
	outputPath: string;
	preset: DeliveryPresetName;
	encoder: string;
	hardwareAcceleration: "software";
	sizeBytes: number;
	probe: NormalizedMediaProbe;
	validated: true;
}

function validateSafeProjectId({ projectId }: { projectId: string }): void {
	if (!SAFE_PROJECT_ID.test(projectId)) {
		throw new Error(`Unsafe project id: ${JSON.stringify(projectId)}`);
	}
}

function validateSafeExportName({ name }: { name: string }): void {
	if (!SAFE_EXPORT_NAME.test(name) || /^\.+$/.test(name)) {
		throw new Error(`Unsafe export name: ${JSON.stringify(name)}`);
	}
}

function defaultProjectsRoot(): string {
	return (
		process.env.OPENCUT_PROJECTS_DIR ??
		path.join(homedir(), "OpenCutProjects")
	);
}

function outputNameForPreset({
	sourceName,
	preset,
}: {
	sourceName: string;
	preset: DeliveryPresetName;
}): string {
	const settings = DELIVERY_PRESETS[preset];
	const sourceBase = path.parse(sourceName).name;
	return `${sourceBase}.${settings.suffix}.${settings.extension}`;
}

export function buildDeliveryFfmpegArgs({
	inputPath,
	outputPath,
	preset,
}: {
	inputPath: string;
	outputPath: string;
	preset: DeliveryPresetName;
}): string[] {
	const settings = DELIVERY_PRESETS[preset];
	if (!settings) {
		throw new Error(`Unknown delivery preset: ${preset}`);
	}
	return [
		"-hide_banner",
		"-nostdin",
		"-y",
		"-i",
		inputPath,
		"-map_metadata",
		"0",
		...settings.args,
		"-progress",
		"pipe:1",
		"-nostats",
		outputPath,
	];
}

export const decodeDelivery: DeliveryDecode = async ({ filePath }) => {
	await new Promise<void>((resolve, reject) => {
		execFile(
			process.env.FFMPEG_BIN ?? "ffmpeg",
			[
				"-v",
				"error",
				"-i",
				filePath,
				"-map",
				"0:v:0?",
				"-map",
				"0:a:0?",
				"-f",
				"null",
				"-",
			],
			{
				encoding: "utf8",
				maxBuffer: 8 * 1024 * 1024,
				timeout: 120_000,
			},
			(error, _stdout, stderr) => {
				if (error) {
					reject(
						new Error(
							`Delivery decode validation failed: ${stderr.trim() || error.message}`,
							{ cause: error },
						),
					);
				} else {
					resolve();
				}
			},
		);
	});
};

function validateDeliveryProbe({
	preset,
	probe,
}: {
	preset: DeliveryPresetName;
	probe: NormalizedMediaProbe;
}): void {
	const expected = DELIVERY_PRESETS[preset];
	const video = probe.videoStreams[0];
	const audio = probe.audioStreams[0];
	if (
		expected.expectedVideoCodec &&
		video?.codec !== expected.expectedVideoCodec
	) {
		throw new Error(
			`Delivery codec mismatch: expected ${expected.expectedVideoCodec}, got ${video?.codec ?? "none"}`,
		);
	}
	if (
		expected.expectedAudioCodec &&
		audio?.codec !== expected.expectedAudioCodec
	) {
		throw new Error(
			`Delivery audio mismatch: expected ${expected.expectedAudioCodec}, got ${audio?.codec ?? "none"}`,
		);
	}
	if (
		expected.expectedBitDepth &&
		video?.bitDepth !== expected.expectedBitDepth
	) {
		throw new Error(
			`Delivery bit depth mismatch: expected ${expected.expectedBitDepth}, got ${video?.bitDepth ?? "unknown"}`,
		);
	}
}

export async function transcodeProjectExport({
	projectId,
	sourceName,
	preset,
	outputName = outputNameForPreset({ sourceName, preset }),
	projectsRoot = defaultProjectsRoot(),
	runner = runNativeTranscode,
	probe = ({ filePath }) => runFfprobe({ filePath }),
	decode = decodeDelivery,
	signal = new AbortController().signal,
	onProgress = () => undefined,
}: {
	projectId: string;
	sourceName: string;
	preset: DeliveryPresetName;
	outputName?: string;
	projectsRoot?: string;
	runner?: DeliveryRunner;
	probe?: DeliveryProbe;
	decode?: DeliveryDecode;
	signal?: AbortSignal;
	onProgress?: (update: {
		progress: number;
		processedSeconds: number;
	}) => void;
}): Promise<NativeDeliveryResult> {
	validateSafeProjectId({ projectId });
	validateSafeExportName({ name: sourceName });
	validateSafeExportName({ name: outputName });
	const exportsDirectory = path.join(
		path.resolve(projectsRoot),
		projectId,
		"exports",
	);
	const inputPath = path.join(exportsDirectory, sourceName);
	await stat(inputPath);
	await mkdir(exportsDirectory, { recursive: true });
	const outputPath = path.join(exportsDirectory, outputName);
	const temporaryOutputPath = path.join(
		exportsDirectory,
		`.${path.parse(outputName).name}.${randomUUID()}.tmp.${path.parse(outputName).ext.slice(1)}`,
	);
	const settings = DELIVERY_PRESETS[preset];
	try {
		await runner({
			args: buildDeliveryFfmpegArgs({
				inputPath,
				outputPath: temporaryOutputPath,
				preset,
			}),
			inputPath,
			temporaryOutputPath,
			signal,
			durationSeconds: null,
			onProgress,
		});
		if (signal.aborted) {
			throw new DOMException("Delivery cancelled", "AbortError");
		}
		const [rawProbe] = await Promise.all([
			probe({ filePath: temporaryOutputPath }),
			decode({ filePath: temporaryOutputPath }),
		]);
		const normalizedProbe = normalizeFfprobe(rawProbe);
		validateDeliveryProbe({ preset, probe: normalizedProbe });
		await rename(temporaryOutputPath, outputPath);
		const outputStat = await stat(outputPath);
		return {
			projectId,
			sourceName,
			outputName,
			outputPath,
			preset,
			encoder: settings.encoder,
			hardwareAcceleration: settings.hardwareAcceleration,
			sizeBytes: outputStat.size,
			probe: normalizedProbe,
			validated: true,
		};
	} catch (error) {
		await rm(temporaryOutputPath, { force: true }).catch(
			() => undefined,
		);
		throw error;
	}
}
