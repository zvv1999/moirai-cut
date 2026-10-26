/** Wire types for the Rust interchange planner. No timeline rules live in the UI. */
export const PROJECT_EXPORT_TARGETS = {
	premiere: "Premiere Pro / DaVinci Resolve（XML）",
	fcpxml: "Final Cut Pro（FCPXML）",
	jianying: "剪映专业版（草稿）",
	capcut: "CapCut（草稿）",
} as const;
export type ProjectExportTarget = keyof typeof PROJECT_EXPORT_TARGETS;
export interface InterchangeSource {
	id: string;
	name: string;
	path: string;
	url: string;
	width: number;
	height: number;
	durationSeconds: number;
	audioChannels: number;
	sampleRate: number;
	still: boolean;
	requiresBake?: boolean;
	fps?: number;
}
export interface InterchangeBake {
	id: string;
	kind: "video" | "still" | "audio" | "scene" | "mix" | "background";
	trackId: string;
	elementId: string;
	start: number;
	end: number;
}
export interface InterchangePlan {
	id: string;
	name: string;
	target: ProjectExportTarget;
	folder: string;
	numerator: number;
	denominator: number;
	width: number;
	height: number;
	duration: number;
	files: InterchangeSource[];
	bakes: InterchangeBake[];
	warnings: string[];
}
export interface ProjectExportResult {
	id: string;
	createdAt: string;
	target: ProjectExportTarget;
	folder: string;
	entryPath: string;
	archiveName: string;
	warnings: string[];
}
