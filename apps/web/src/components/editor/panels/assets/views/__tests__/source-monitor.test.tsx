import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceMonitorDialog } from "@/components/editor/panels/assets/views/source-monitor";

test("source monitor exposes playback, in/out, insert, and overwrite controls", () => {
	const markup = renderToStaticMarkup(
		<SourceMonitorDialog
			open={true}
			asset={{
				id: "source",
				name: "Source.mov",
				type: "video",
				duration: 12,
				file: new File([], "Source.mov"),
				url: "blob:source",
			}}
			overwriteTargetLabel="Main Track"
			overwriteDisabledReason={null}
			onOpenChange={() => {}}
			onInsert={() => {}}
			onOverwrite={() => {}}
		/>,
	);

	expect(markup).toContain('aria-label="Source monitor"');
	expect(markup).toContain('aria-label="Source playhead"');
	expect(markup).toContain("Set In");
	expect(markup).toContain("Set Out");
	expect(markup).toContain("Insert range");
	expect(markup).toContain("Overwrite Main Track");
	expect(markup).toContain("Source files remain unchanged");
});
