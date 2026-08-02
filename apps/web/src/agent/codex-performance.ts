export type CodexPerformanceMode = "fast" | "balanced" | "director";
export type CodexToolProfile = "edit" | "verify" | "full";
export type CodexVisualMode = "off" | "auto";
export type CodexVerificationMode = "off" | "basic" | "full";

export interface CodexPerformancePreset {
	id: CodexPerformanceMode;
	label: string;
	description: string;
	effort: "low" | "medium" | "xhigh";
	toolProfile: CodexToolProfile;
	visualMode: CodexVisualMode;
	verificationMode: CodexVerificationMode;
}

export const DEFAULT_CODEX_PERFORMANCE_MODE: CodexPerformanceMode = "balanced";

export const CODEX_PERFORMANCE_PRESETS: readonly CodexPerformancePreset[] = [
	{
		id: "fast",
		label: "快速",
		description: "更快响应，关闭自动画面识别和结果复核。",
		effort: "low",
		toolProfile: "edit",
		visualMode: "off",
		verificationMode: "off",
	},
	{
		id: "balanced",
		label: "均衡",
		description: "日常剪辑默认档，只做轻量工程变更复核。",
		effort: "medium",
		toolProfile: "edit",
		visualMode: "off",
		verificationMode: "basic",
	},
	{
		id: "director",
		label: "导演",
		description: "自动理解选区画面，并在修改后生成完整验收证据。",
		effort: "xhigh",
		toolProfile: "verify",
		visualMode: "auto",
		verificationMode: "full",
	},
] as const;

export function getCodexPerformancePreset(
	mode: CodexPerformanceMode,
): CodexPerformancePreset {
	return (
		CODEX_PERFORMANCE_PRESETS.find((preset) => preset.id === mode) ??
		CODEX_PERFORMANCE_PRESETS[1]
	);
}
