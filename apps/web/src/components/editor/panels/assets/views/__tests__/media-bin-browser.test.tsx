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

	expect(markup).toContain('aria-label="Media bins"');
	expect(markup).toContain('aria-label="Create root bin"');
	expect(markup).toContain('aria-label="View all assets"');
	expect(markup).toContain('aria-label="View unfiled assets"');
	expect(markup).toContain('aria-label="View bin Story"');
	expect(markup).toContain('aria-label="Manage bin Story"');
	expect(markup).toContain('aria-level="2"');
	expect(markup).toContain('aria-current="page"');
	expect(markup).toContain(">3<");
	expect(markup).toContain(">1<");
});
