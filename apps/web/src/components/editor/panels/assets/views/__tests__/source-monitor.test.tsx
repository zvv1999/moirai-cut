import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceMonitorView } from "@/components/editor/panels/assets/views/source-monitor";
import { Dialog } from "@/components/ui/dialog";

test("source monitor exposes playback, in/out, insert, and overwrite controls", () => {
	const markup = renderToStaticMarkup(
		<Dialog open={true}>
			<SourceMonitorView
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
				onInsert={() => {}}
				onOverwrite={() => {}}
				onClose={() => {}}
			/>
		</Dialog>,
	);

	expect(markup).toContain('aria-label="Source monitor"');
	expect(markup).toContain('aria-label="Source playhead"');
	expect(markup).toContain("Set In");
	expect(markup).toContain("Set Out");
	expect(markup).toContain("Insert range");
	expect(markup).toContain("Overwrite Main Track");
	expect(markup).toContain("原始素材不会被修改");
});
