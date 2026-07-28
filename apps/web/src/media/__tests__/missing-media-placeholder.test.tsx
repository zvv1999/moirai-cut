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
		expect(html).toContain("Media missing");
		expect(html).toContain("Interview.mov");
		expect(html).toContain("Video · 2 timeline uses");
		expect(html).toContain('aria-label="Relink Interview.mov"');
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
		expect(html).toContain("Missing · Poster.png");
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
		expect(html).toContain("MEDIA OFFLINE");
		expect(html).toContain("Relink this file from the Assets panel");
	});
});
