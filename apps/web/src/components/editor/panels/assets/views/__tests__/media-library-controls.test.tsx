import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaLibraryControlsView } from "@/components/editor/panels/assets/views/media-library-controls";

test("advanced media filters expose their active state and clear path", () => {
	const markup = renderToStaticMarkup(
		<MediaLibraryControlsView
			query="reed"
			type="video"
			filters={{
				duration: "under-10",
				resolution: "hd",
				usage: "used",
				availability: "available",
				tag: "select",
				favorite: "favorite",
			}}
			availableTags={["select", "interview"]}
			resultCount={1}
			totalCount={44}
			onQueryChange={() => {}}
			onTypeChange={() => {}}
			onFiltersChange={() => {}}
			onClearAll={() => {}}
		/>,
	);

	expect(markup).toContain('aria-label="按文件名搜索素材"');
	expect(markup).toContain('aria-label="高级素材筛选：已启用 7 项"');
	expect(markup).toContain('aria-label="清除全部素材筛选"');
	expect(markup).toContain("1 / 44 个素材");
	expect(markup).toContain("7 项筛选");
});
