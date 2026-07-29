export interface RawFfprobeFormat {
	format_name?: unknown;
	duration?: unknown;
	size?: unknown;
	bit_rate?: unknown;
	start_time?: unknown;
	tags?: Record<string, unknown>;
}

export interface RawFfprobeSideData {
	rotation?: unknown;
	[key: string]: unknown;
}

export interface RawFfprobeStream {
	index?: unknown;
	codec_type?: unknown;
	codec_name?: unknown;
	codec_long_name?: unknown;
	profile?: unknown;
	level?: unknown;
	pix_fmt?: unknown;
	bits_per_raw_sample?: unknown;
	width?: unknown;
	height?: unknown;
	avg_frame_rate?: unknown;
	r_frame_rate?: unknown;
	sample_aspect_ratio?: unknown;
	display_aspect_ratio?: unknown;
	duration?: unknown;
	bit_rate?: unknown;
	color_range?: unknown;
	color_space?: unknown;
	color_transfer?: unknown;
	color_primaries?: unknown;
	chroma_location?: unknown;
	sample_rate?: unknown;
	channels?: unknown;
	channel_layout?: unknown;
	tags?: Record<string, unknown>;
	side_data_list?: RawFfprobeSideData[];
	[key: string]: unknown;
}

export interface RawFfprobeOutput {
	format?: RawFfprobeFormat;
	streams?: RawFfprobeStream[];
}

export interface NormalizedContainer {
	formatNames: string[];
	durationSeconds: number | null;
	sizeBytes: number | null;
	bitrate: number | null;
	startTimeSeconds: number | null;
}

export interface NormalizedColorMetadata {
	range: string | null;
	space: string | null;
	transfer: string | null;
	primaries: string | null;
	chromaLocation: string | null;
}

export interface NormalizedVideoStream {
	index: number | null;
	codec: string | null;
	codecLongName: string | null;
	profile: string | null;
	level: number | null;
	pixelFormat: string | null;
	bitDepth: number | null;
	width: number | null;
	height: number | null;
	sampleAspectRatio: string | null;
	displayAspectRatio: string | null;
	rotationDegrees: number;
	averageFrameRate: number | null;
	nominalFrameRate: number | null;
	frameRateMode: "constant" | "variable" | "unknown";
	durationSeconds: number | null;
	bitrate: number | null;
	color: NormalizedColorMetadata;
	hdr: boolean;
}

export interface NormalizedAudioStream {
	index: number | null;
	codec: string | null;
	codecLongName: string | null;
	profile: string | null;
	sampleRate: number | null;
	channels: number | null;
	channelLayout: string | null;
	durationSeconds: number | null;
	bitrate: number | null;
}

export interface NormalizedMediaProbe {
	container: NormalizedContainer;
	videoStreams: NormalizedVideoStream[];
	audioStreams: NormalizedAudioStream[];
	subtitleStreamCount: number;
}

export type PlaybackStrategyKind =
	| "direct"
	| "proxy-recommended"
	| "proxy-required"
	| "audio-only"
	| "unsupported";

export interface PlaybackStrategy {
	kind: PlaybackStrategyKind;
	reasonCodes: string[];
}

function finiteNumber(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value !== "string" || value.trim() === "") {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function finiteInteger(value: unknown): number | null {
	const parsed = finiteNumber(value);
	return parsed === null ? null : Math.trunc(parsed);
}

function textValue(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== ""
		? value.trim()
		: null;
}

function frameRate(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) && value > 0 ? value : null;
	}
	if (typeof value !== "string") {
		return null;
	}
	const parts = value.trim().split("/");
	if (parts.length === 2) {
		const numerator = Number(parts[0]);
		const denominator = Number(parts[1]);
		if (
			Number.isFinite(numerator) &&
			Number.isFinite(denominator) &&
			numerator > 0 &&
			denominator > 0
		) {
			return numerator / denominator;
		}
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function inferBitDepth({
	pixelFormat,
	bitsPerRawSample,
}: {
	pixelFormat: string | null;
	bitsPerRawSample: unknown;
}): number | null {
	const explicit = finiteInteger(bitsPerRawSample);
	if (explicit !== null && explicit > 0) {
		return explicit;
	}
	if (!pixelFormat) {
		return null;
	}
	const explicitFormatDepth = pixelFormat.match(/p(\d{2})(?:le|be)?$/i);
	if (explicitFormatDepth) {
		return Number(explicitFormatDepth[1]);
	}
	if (
		/^(?:yuv|yuva|gbr|gbrp|gray|nv|p0|rgb|bgr)/i.test(pixelFormat)
	) {
		return 8;
	}
	return null;
}

function rotationDegrees(stream: RawFfprobeStream): number {
	for (const sideData of stream.side_data_list ?? []) {
		const rotation = finiteNumber(sideData.rotation);
		if (rotation !== null) {
			return rotation;
		}
	}
	return finiteNumber(stream.tags?.rotate) ?? 0;
}

function normalizedFrameRateMode({
	average,
	nominal,
}: {
	average: number | null;
	nominal: number | null;
}): "constant" | "variable" | "unknown" {
	if (average === null && nominal === null) {
		return "unknown";
	}
	if (average === null || nominal === null) {
		return "unknown";
	}
	const tolerance = Math.max(0.001, nominal * 0.0001);
	return Math.abs(average - nominal) > tolerance ? "variable" : "constant";
}

function isHdr(color: NormalizedColorMetadata): boolean {
	return (
		color.transfer === "smpte2084" ||
		color.transfer === "arib-std-b67" ||
		color.primaries === "bt2020"
	);
}

function normalizeVideoStream(
	stream: RawFfprobeStream,
): NormalizedVideoStream {
	const averageFrameRate = frameRate(stream.avg_frame_rate);
	const nominalFrameRate = frameRate(stream.r_frame_rate);
	const pixelFormat = textValue(stream.pix_fmt);
	const color: NormalizedColorMetadata = {
		range: textValue(stream.color_range),
		space: textValue(stream.color_space),
		transfer: textValue(stream.color_transfer),
		primaries: textValue(stream.color_primaries),
		chromaLocation: textValue(stream.chroma_location),
	};

	return {
		index: finiteInteger(stream.index),
		codec: textValue(stream.codec_name),
		codecLongName: textValue(stream.codec_long_name),
		profile: textValue(stream.profile),
		level: finiteNumber(stream.level),
		pixelFormat,
		bitDepth: inferBitDepth({
			pixelFormat,
			bitsPerRawSample: stream.bits_per_raw_sample,
		}),
		width: finiteInteger(stream.width),
		height: finiteInteger(stream.height),
		sampleAspectRatio: textValue(stream.sample_aspect_ratio),
		displayAspectRatio: textValue(stream.display_aspect_ratio),
		rotationDegrees: rotationDegrees(stream),
		averageFrameRate,
		nominalFrameRate,
		frameRateMode: normalizedFrameRateMode({
			average: averageFrameRate,
			nominal: nominalFrameRate,
		}),
		durationSeconds: finiteNumber(stream.duration),
		bitrate: finiteNumber(stream.bit_rate),
		color,
		hdr: isHdr(color),
	};
}

function normalizeAudioStream(
	stream: RawFfprobeStream,
): NormalizedAudioStream {
	return {
		index: finiteInteger(stream.index),
		codec: textValue(stream.codec_name),
		codecLongName: textValue(stream.codec_long_name),
		profile: textValue(stream.profile),
		sampleRate: finiteInteger(stream.sample_rate),
		channels: finiteInteger(stream.channels),
		channelLayout: textValue(stream.channel_layout),
		durationSeconds: finiteNumber(stream.duration),
		bitrate: finiteNumber(stream.bit_rate),
	};
}

export function normalizeFfprobe(
	raw: RawFfprobeOutput,
): NormalizedMediaProbe {
	const streams = Array.isArray(raw.streams) ? raw.streams : [];
	const formatName = textValue(raw.format?.format_name);

	return {
		container: {
			formatNames: formatName
				? formatName
						.split(",")
						.map((name) => name.trim())
						.filter(Boolean)
				: [],
			durationSeconds: finiteNumber(raw.format?.duration),
			sizeBytes: finiteNumber(raw.format?.size),
			bitrate: finiteNumber(raw.format?.bit_rate),
			startTimeSeconds: finiteNumber(raw.format?.start_time),
		},
		videoStreams: streams
			.filter((stream) => stream.codec_type === "video")
			.map(normalizeVideoStream),
		audioStreams: streams
			.filter((stream) => stream.codec_type === "audio")
			.map(normalizeAudioStream),
		subtitleStreamCount: streams.filter(
			(stream) => stream.codec_type === "subtitle",
		).length,
	};
}

export function decidePlaybackStrategy({
	probe,
	browserCanDecode,
	nativeTranscodeAvailable,
}: {
	probe: NormalizedMediaProbe;
	browserCanDecode: boolean | null;
	nativeTranscodeAvailable: boolean;
}): PlaybackStrategy {
	if (probe.videoStreams.length === 0) {
		if (probe.audioStreams.length > 0) {
			return { kind: "audio-only", reasonCodes: ["audio-only"] };
		}
		return { kind: "unsupported", reasonCodes: ["no-supported-streams"] };
	}

	if (browserCanDecode !== true) {
		if (nativeTranscodeAvailable) {
			return {
				kind: "proxy-required",
				reasonCodes: ["browser-codec-unsupported"],
			};
		}
		return {
			kind: "unsupported",
			reasonCodes: [
				"browser-codec-unsupported",
				"native-transcode-unavailable",
			],
		};
	}

	const reasonCodes: string[] = [];
	if (probe.videoStreams.some((stream) => (stream.bitDepth ?? 0) > 8)) {
		reasonCodes.push("high-bit-depth");
	}
	if (probe.videoStreams.some((stream) => stream.hdr)) {
		reasonCodes.push("hdr-source");
	}

	if (reasonCodes.length > 0) {
		return { kind: "proxy-recommended", reasonCodes };
	}
	return { kind: "direct", reasonCodes: ["browser-decodable"] };
}
