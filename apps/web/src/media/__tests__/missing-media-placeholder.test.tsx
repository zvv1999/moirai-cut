import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MissingMediaPlaceholder } from "@/media/missing-media-placeholder";

describe("MissingMediaPlaceholder", () => {
	test("renders a labelled library recovery card", () => {
		const html = renderToStaticMarkup(
			<MissingMediaPlaceholder
				surface="library"
				mediaId="missing-video"
				name="Interview.mov"
				type="video"
				usageCount={2}
				onRelink={() => undefined}
			/>,
		);

		expect(html).toContain('data-missing-media="missing-video"');
		expect(html).toContain('role="status"');
		expect(html).toContain("素材丢失");
		expect(html).toContain("Interview.mov");
		expect(html).toContain("视频 · 时间线使用 2 次");
		expect(html).toContain('aria-label="重新链接 Interview.mov"');
	});

	test("renders compact timeline feedback without nesting an action", () => {
		const html = renderToStaticMarkup(
			<MissingMediaPlaceholder
				surface="timeline"
				mediaId="missing-image"
				name="Poster.png"
				type="image"
			/>,
		);

		expect(html).toContain('data-missing-media="missing-image"');
		expect(html).toContain("素材丢失 · Poster.png");
		expect(html).not.toContain("<button");
	});

	test("renders a canvas-safe recovery message", () => {
		const html = renderToStaticMarkup(
			<MissingMediaPlaceholder
				surface="canvas"
				mediaId="missing-video"
				name="Interview.mov"
				type="video"
			/>,
		);

		expect(html).toContain('aria-live="polite"');
		expect(html).toContain("素材已离线");
		expect(html).toContain("请在素材面板中重新链接此文件");
	});
});
