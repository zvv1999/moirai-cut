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

	expect(markup).toContain('aria-label="Search assets by filename"');
	expect(markup).toContain('aria-label="Advanced asset filters: 7 active"');
	expect(markup).toContain('aria-label="Clear all asset filters"');
	expect(markup).toContain("1 of 44 assets");
	expect(markup).toContain("7 filters");
});
