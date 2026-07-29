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

	test("keeps AI tracking and effect workflows fully Chinese", () => {
		const sources = [
			readSource("../../../motion-tracking/components/motion-tracking-tab.tsx"),
			readSource("../../../effects/components/effects-tab.tsx"),
			readSource("../../../effects/components/assets-view.tsx"),
			readSource("../../../effects/definitions/background-removal.ts"),
			readSource("../../../effects/definitions/blur.ts"),
			readSource("../../../effects/definitions/chroma-key.ts"),
			readSource("../../../effects/definitions/color-grade.ts"),
		].join("\n");

		for (const translatedLabel of [
			"智能跟踪",
			"跟踪区域",
			"分析质量",
			"置信度",
			"应用结果",
			"防抖",
			"自动裁切边缘",
			"特效预设",
			"暂无特效",
			"去除背景",
			"色度抠图",
			"色彩与影调",
		]) {
			expect(sources).toContain(translatedLabel);
		}

		for (const englishLabel of [
			"<SectionTitle>Motion</SectionTitle>",
			"<SectionTitle>Track region</SectionTitle>",
			">Analysis quality<",
			">Bind result<",
			"<SectionTitle>Stabilization</SectionTitle>",
			">Auto crop edges<",
			"<SectionTitle>Effects</SectionTitle>",
			"<SectionTitle>Effect presets</SectionTitle>",
			">No effects<",
			'title="Effects"',
			'name: "Background Removal"',
			'name: "Chroma Key"',
			'name: "Color & Tone"',
			'label: "Intensity"',
		]) {
			expect(sources).not.toContain(englishLabel);
		}
	});

	test("keeps mask and text creation workflows fully Chinese", () => {
		const sources = [
			readSource("../../../masks/components/masks-tab.tsx"),
			readSource("../../../text/components/assets-view.tsx"),
		].join("\n");

		for (const translatedLabel of [
			"蒙版",
			"添加蒙版",
			"混合方式",
			"基础蒙版",
			"位置",
			"大小",
			"羽化",
			"描边",
			"暂无蒙版",
			"默认文本",
		]) {
			expect(sources).toContain(translatedLabel);
		}

		for (const englishLabel of [
			"<SectionTitle>Masks</SectionTitle>",
			'aria-label="Add mask"',
			'label="Combine"',
			">Base mask<",
			'label="Position"',
			'label="Feather"',
			'label="Stroke"',
			">No masks<",
			'title="Text"',
			">Default text<",
		]) {
			expect(sources).not.toContain(englishLabel);
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
			"在播放器中预览",
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

	test("localizes shared close controls and project information", () => {
		const sources = [
			readSource("../../ui/dialog.tsx"),
			readSource("../../ui/sheet.tsx"),
			readSource("../../ui/toast.tsx"),
			readSource("../../ui/number-field.tsx"),
			readSource("../../header.tsx"),
			readSource("../../../project/components/project-info-dialog.tsx"),
			readSource("../../../utils/date.ts"),
			readSource("../../../agent/workflow.ts"),
		].join("\n");

		for (const translatedLabel of [
			'<span className="sr-only">关闭</span>',
			'aria-label="重置为默认值"',
			'aria-label="关闭菜单"',
			'label="时长"',
			'label="创建时间"',
			'label="修改时间"',
			'label="工程 ID"',
			">完成</Button>",
			'"zh-CN"',
			"`关闭 ${trackGap.toFixed(2)} 秒空隙",
		]) {
			expect(sources).toContain(translatedLabel);
		}

		for (const englishLabel of [
			'<span className="sr-only">Close</span>',
			'aria-label="Reset to default"',
			'aria-label="Close menu"',
			'label="Duration"',
			'label="Created"',
			'label="Modified"',
			'label="Project ID"',
			">Done</Button>",
			'"en-US"',
			"`Close ${trackGap.toFixed(2)}s gap",
		]) {
			expect(sources).not.toContain(englishLabel);
		}
	});

	test("keeps the keyboard shortcut manager Chinese", () => {
		const sources = [
			readSource("../../../actions/components/shortcuts-dialog.tsx"),
			readSource("../../../actions/definitions.ts"),
		].join("\n");

		for (const translatedLabel of [
			">快捷键</DialogTitle>",
			"条命令",
			"自定义配置",
			"默认配置",
			"导入快捷键配置",
			"搜索命令、分类、操作或按键",
			"未分配",
			"恢复默认设置",
			'description: "播放/暂停"',
			'description: "在播放头处分割素材"',
			'description: "将所选关键帧向前移动一帧"',
		]) {
			expect(sources).toContain(translatedLabel);
		}

		for (const englishLabel of [
			">Keyboard shortcuts</DialogTitle>",
			"commands",
			"Custom configuration",
			"Import shortcut configuration",
			"Search commands, categories, actions, or keys",
			"Unassigned",
			"Reset defaults",
			'description: "Play/Pause"',
			'description: "Split elements at playhead"',
			'description: "Nudge selected keyframes forward one frame"',
		]) {
			expect(sources).not.toContain(englishLabel);
		}
	});
});
