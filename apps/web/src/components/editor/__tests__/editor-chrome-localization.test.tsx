import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { tabs } from "@/components/editor/panels/assets/assets-panel-store";
import { EmptyView } from "@/components/editor/panels/properties/empty-view";

describe("editor chrome localization", () => {
	test("uses concise Chinese names for the primary creation tools", () => {
		expect(Object.values(tabs).map((tab) => tab.label)).toEqual([
			"媒体",
			"音频",
			"文本",
			"贴纸",
			"特效",
			"转场",
			"字幕",
			"调节",
			"设置",
		]);
	});

	test("guides an empty inspector in Chinese", () => {
		const html = renderToStaticMarkup(<EmptyView />);

		expect(html).toContain("请选择时间线中的素材");
		expect(html).toContain("选中视频、图片、文字或音频后，可在这里调整参数");
	});
});
