import type { NormalizedMediaProbe } from "@/media/codec-capabilities";

/**
 * Browser/server contract for FFmpeg delivery jobs.
 *
 * Keep this module free of Node imports so editor UI and Agent clients can use
 * the same preset/result types without pulling the server transcoder into the
 * browser bundle.
 */
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
