import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relativePath: string): string {
	return readFileSync(
		fileURLToPath(new URL(relativePath, import.meta.url)),
		"utf8",
	);
}

describe("Jianying editor interaction parity", () => {
	test("uses Jianying workbench proportions and compact panel gutters", () => {
		const layoutSource = readSource(
			"../../../app/editor/[project_id]/page.tsx",
		);
		const panelConfigSource = readSource("../../../panels/layout.ts");

		expect(panelConfigSource).toContain("tools: 27");
		expect(panelConfigSource).toContain("preview: 45");
		expect(panelConfigSource).toContain("properties: 28");
		expect(panelConfigSource).toContain("mainContent: 70");
		expect(panelConfigSource).toContain("timeline: 30");
		expect(layoutSource).toContain('data-workbench-layout="jianying"');
		expect(layoutSource).toContain('className="size-full gap-1 px-1"');
		expect(layoutSource).toContain('className="min-h-0 px-1 pb-1"');
	});

	test("places creation categories in a horizontal top rail", () => {
		const assetsSource = readSource("../panels/assets/index.tsx");
		const tabBarSource = readSource("../panels/assets/tabbar.tsx");

		expect(assetsSource).toContain('data-workbench-panel="assets"');
		expect(assetsSource).toContain("flex-col");
		expect(tabBarSource).toContain('data-orientation="horizontal"');
		expect(tabBarSource).toContain("h-[56px]");
		expect(tabBarSource).toContain("overflow-x-auto");
		expect(tabBarSource).not.toContain("w-12 flex-col");
	});

	test("keeps timeline edit modes in a single compact toolbar row", () => {
		const timelineSource = readSource("../../../timeline/components/index.tsx");
		const toolbarSource = readSource(
			"../../../timeline/components/timeline-toolbar.tsx",
		);

		expect(timelineSource).toContain('data-timeline-chrome="single-row"');
		expect(timelineSource).not.toContain("<TimelineModeStatus />");
		expect(timelineSource).not.toContain("<PrecisionTrimModeSelector />");
		expect(toolbarSource).toContain("<TimelineEditModeCluster />");
	});

	test("opens AI effects from a Jianying-style capability catalog", () => {
		const registrySource = readSource("../panels/properties/registry.tsx");
		const aiEffectsSource = readSource(
			"../panels/properties/components/jianying-ai-effects-tab.tsx",
		);

		expect(registrySource).toContain("<JianyingAiEffectsTab");
		for (const label of [
			"AI特效",
			"智能工具",
			"智能跟踪",
			"智能抠像",
			"色度抠图",
			"视频防抖",
		]) {
			expect(aiEffectsSource).toContain(label);
		}
		expect(aiEffectsSource).toContain("能力待接入");
	});

	test("opens a media double-click in the central preview instead of a modal", () => {
		const assetsSource = readSource(
			"../panels/assets/views/assets.tsx",
		);
		const previewSource = readSource("../../../preview/components/index.tsx");

		expect(assetsSource).toContain("openSourcePreview");
		expect(assetsSource).not.toContain("<SourceMonitorDialog");
		expect(previewSource).toContain("<SourcePreviewPanel");
	});

	test("uses unambiguous Chinese timeline menu copy", () => {
		const timelineSource = readSource(
			"../../../timeline/components/timeline-element.tsx",
		);

		for (const label of ["创建副本", "隐藏", "显示", "删除素材"]) {
			expect(timelineSource).toContain(label);
		}
		for (const label of ['"Hide"', '"Show"', "`Delete "]) {
			expect(timelineSource).not.toContain(label);
		}
	});
});
