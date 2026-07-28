import type { FrameRate } from "opencut-wasm";
import { EXPORT_MIME_TYPES } from "./mime-types";

export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

/** Agent-only review preset; deliberately excluded from the human export UI. */
export const AGENT_EXPORT_QUALITY_VALUES = [
	...EXPORT_QUALITY_VALUES,
	"draft",
] as const;

export const EXPORT_FORMAT_VALUES = ["mp4", "webm"] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];
export type AgentExportQuality = (typeof AGENT_EXPORT_QUALITY_VALUES)[number];

export type ExportVideoCodec = "avc" | "vp9" | "av1";
export type ExportAudioCodec = "aac" | "opus";
export type ExportHardwareAcceleration =
	| "no-preference"
	| "prefer-hardware"
	| "prefer-software";

export interface ExportRange {
	startSeconds: number;
	endSeconds: number;
}

export interface ExportOptions {
	format: ExportFormat;
	quality: AgentExportQuality;
	fps?: FrameRate;
	includeAudio?: boolean;
	width?: number;
	height?: number;
	videoCodec?: ExportVideoCodec;
	videoBitrate?: number;
	audioCodec?: ExportAudioCodec;
	audioBitrate?: number;
	includeAlpha?: boolean;
	hardwareAcceleration?: ExportHardwareAcceleration;
	range?: ExportRange;
	destinationName?: string;
}

export interface ExportResult {
	success: boolean;
	buffer?: ArrayBuffer;
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function downloadBuffer({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): void {
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(url);
}
