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
		].join("\n");

		for (const translatedLabel of [
			"智能剪辑",
			"崩溃恢复",
			"时间线播放头",
			"时间线标尺",
			'"淡入" : "淡出"}手柄',
			"选择轨道",
			"代理预览已启用",
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
			"Project health",
			"Performance",
			"Background jobs",
			"Portable project package",
			"Addressable correction pass",
			"Renders the opening",
		]) {
			expect(sources).not.toContain(englishLabel);
		}
	});
});
