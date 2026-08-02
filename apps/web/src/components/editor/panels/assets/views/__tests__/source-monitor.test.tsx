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

	expect(markup).toContain('aria-label="源监视器"');
	expect(markup).toContain('aria-label="源素材播放头"');
	expect(markup).toContain("设置入点");
	expect(markup).toContain("设置出点");
	expect(markup).toContain("插入范围");
	expect(markup).toContain("覆盖到 Main Track");
	expect(markup).toContain("原始素材不会被修改");
});
