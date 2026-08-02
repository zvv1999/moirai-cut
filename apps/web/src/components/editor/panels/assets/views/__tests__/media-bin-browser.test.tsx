import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaBinBrowserView } from "@/components/editor/panels/assets/views/media-bin-browser";

test("media bins remain visible, nested, counted, and directly manageable", () => {
	const markup = renderToStaticMarkup(
		<MediaBinBrowserView
			bins={[
				{ id: "story", name: "Story", parentId: null, order: 0 },
				{ id: "interviews", name: "Interviews", parentId: "story", order: 0 },
			]}
			assetBinIds={{ a: "story", b: "interviews" }}
			assetIds={["a", "b", "c"]}
			activeBinId="story"
			onSelect={() => {}}
			onCreate={() => {}}
			onRename={() => {}}
			onMove={() => {}}
			onDelete={() => {}}
		/>,
	);

	expect(markup).toContain('aria-label="素材文件夹"');
	expect(markup).toContain('aria-label="新建素材文件夹"');
	expect(markup).toContain('aria-label="查看全部素材"');
	expect(markup).toContain('aria-label="查看未分类素材"');
	expect(markup).toContain('aria-label="查看素材文件夹 Story"');
	expect(markup).toContain('aria-label="管理素材文件夹 Story"');
	expect(markup).toContain('aria-level="2"');
	expect(markup).toContain('aria-current="page"');
	expect(markup).toContain(">3<");
	expect(markup).toContain(">1<");
});

test("unfiled is hidden until the first media folder exists", () => {
	const markup = renderToStaticMarkup(
		<MediaBinBrowserView
			bins={[]}
			assetBinIds={{}}
			assetIds={["a", "b"]}
			activeBinId="all"
			onSelect={() => {}}
			onCreate={() => {}}
			onRename={() => {}}
			onMove={() => {}}
			onDelete={() => {}}
		/>,
	);

	expect(markup).toContain('aria-label="查看全部素材"');
	expect(markup).not.toContain('aria-label="查看未分类素材"');
});
