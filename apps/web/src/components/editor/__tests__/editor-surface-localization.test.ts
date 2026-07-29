import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relativePath: string): string {
	return readFileSync(
		fileURLToPath(new URL(relativePath, import.meta.url)),
		"utf8",
	);
}

describe("editor surface localization", () => {
	test("keeps the audio workbench fully Chinese", () => {
		const source = readSource(
			"../panels/properties/components/audio-workbench-tab.tsx",
		);

		for (const translatedLabel of [
			"音频分析",
			"综合响度",
			"安全标准化",
			"源音频",
			"处理链",
			"波形性能",
			"配音录制",
		]) {
			expect(source).toContain(translatedLabel);
		}

		for (const englishLabel of [
			"Audio analysis",
			"Analyse clip",
			"Normalize safely",
			"Source audio",
			"Processing chain",
			"Waveform performance",
			"Voice-over recording",
			"Record at playhead",
		]) {
			expect(source).not.toContain(englishLabel);
		}
	});

	test("localizes the persistent editor chrome and timeline controls", () => {
		const sources = [
			readSource("../agent-badge.tsx"),
			readSource("../../providers/editor-provider.tsx"),
			readSource("../../../timeline/components/timeline-playhead.tsx"),
			readSource("../../../timeline/components/timeline-ruler.tsx"),
			readSource("../../../timeline/components/audio-fade-handles.tsx"),
			readSource("../../../timeline/components/timeline-track.tsx"),
			readSource("../panels/assets/views/assets.tsx"),
			readSource("../panels/assets/views/media-batch-operations-dialog.tsx"),
			readSource("../panels/assets/views/media-bin-browser.tsx"),
			readSource("../panels/assets/views/media-duplicate-review-dialog.tsx"),
			readSource("../panels/assets/views/media-metadata-editor.tsx"),
			readSource("../panels/assets/views/source-monitor.tsx"),
			readSource("../../../media/missing-media-placeholder.tsx"),
			readSource("../../../media/upload-toast.ts"),
		].join("\n");

		for (const translatedLabel of [
			"智能剪辑",
			"崩溃恢复",
			"时间线播放头",
			"时间线标尺",
			'"淡入" : "淡出"}手柄',
			"选择轨道",
			"代理预览已启用",
			"在源监视器中打开",
			"批量素材操作",
			"检查重复素材",
			"编辑素材信息",
			"已选源素材范围",
			"素材已离线",
			"正在上传",
		]) {
			expect(sources).toContain(translatedLabel);
		}

		for (const englishLabel of [
			"Agent Studio",
			"Crash recovery",
			"Timeline playhead",
			"Timeline ruler",
			"Fade in handle",
			"Select ${track.name} track",
			"Proxy preview enabled",
			"素材排序：${sortBy}",
			"按 {sortBy} 排序",
			"Open in source monitor",
			"Batch media operations",
			"Review duplicate media",
			"Edit asset metadata",
			"Selected source range",
			"MEDIA OFFLINE",
			"Uploading ${getAssetLabel",
		]) {
			expect(sources).not.toContain(englishLabel);
		}
	});

	test("keeps the intelligent editing reliability tools Chinese", () => {
		const sources = [
			readSource("../agent-workbench.tsx"),
			readSource("../reliability-workbench.tsx"),
		].join("\n");

		for (const translatedLabel of [
			"工程健康",
			"性能",
			"后台任务",
			"便携工程包",
			"可寻址修正列表",
		]) {
			expect(sources).toContain(translatedLabel);
		}

		for (const englishLabel of [
			">Project health<",
			'label: "Performance"',
			">Background jobs<",
			">Portable project package<",
			">Addressable correction pass<",
			"Renders the opening",
		]) {
			expect(sources).not.toContain(englishLabel);
		}
	});

	test("localizes export, project settings, scenes, and onboarding", () => {
		const sources = [
			readSource("../advanced-export-popover.tsx"),
			readSource("../scenes-view.tsx"),
			readSource("../onboarding.tsx"),
			readSource("../mobile-gate.tsx"),
			readSource("../panels/assets/views/settings/index.tsx"),
			readSource("../panels/assets/views/settings/background.tsx"),
		].join("\n");

		for (const translatedLabel of [
			"导出工作台",
			"平台预设",
			"编码设置",
			"导出预检",
			"工程信息",
			"画布背景",
			"删除场景",
			"欢迎使用 OpenCut",
		]) {
			expect(sources).toContain(translatedLabel);
		}

		for (const englishLabel of [
			">Export workspace<",
			">Platform presets<",
			">Export preflight<",
			">Project info<",
			">Background<",
			">Delete Scenes<",
			"Welcome to OpenCut",
		]) {
			expect(sources).not.toContain(englishLabel);
		}
	});
});
