import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineElementInteractionShell } from "../timeline-element-interaction-shell";

describe("TimelineElementInteractionShell", () => {
	test("renders expanded keyframe controls outside the clip button", () => {
		const html = renderToStaticMarkup(
			<TimelineElementInteractionShell
				baseTrackHeight={48}
				clipContent={<span>Clip</span>}
				expandedContent={
					<button type="button" aria-label="Select keyframe">
						Keyframe
					</button>
				}
				onClick={() => undefined}
				onMouseDown={() => undefined}
			/>,
		);

		const clipSurfaceStart = html.indexOf('<div role="button"');
		const clipSurfaceEnd = html.indexOf("</div>", clipSurfaceStart);
		const keyframeButtonStart = html.indexOf(
			'<button type="button" aria-label="Select keyframe"',
		);

		expect(clipSurfaceStart).toBeGreaterThanOrEqual(0);
		expect(clipSurfaceEnd).toBeGreaterThan(clipSurfaceStart);
		expect(keyframeButtonStart).toBeGreaterThan(clipSurfaceEnd);
	});

	test("keeps expanded keyframe controls above resize handles and adjacent clips", () => {
		const html = renderToStaticMarkup(
			<TimelineElementInteractionShell
				baseTrackHeight={48}
				clipContent={<span>Clip</span>}
				expandedContent={
					<button type="button" aria-label="Select keyframe">
						Keyframe
					</button>
				}
				onClick={() => undefined}
				onMouseDown={() => undefined}
			/>,
		);

		expect(html).toContain('class="absolute inset-x-0 bottom-0 z-20"');
		expect(html).toContain(
			'class="absolute inset-x-0 top-0 flex overflow-hidden rounded-sm"',
		);
	});

	test("allows dedicated clip actions without nesting interactive buttons", () => {
		const html = renderToStaticMarkup(
			<TimelineElementInteractionShell
				baseTrackHeight={48}
				clipContent={
					<button type="button" aria-label="打开素材效果">
						效果
					</button>
				}
				expandedContent={null}
				onClick={() => undefined}
				onMouseDown={() => undefined}
			/>,
		);

		expect(html).toContain('<div role="button"');
		expect(html).toContain('<button type="button" aria-label="打开素材效果">');
		expect(html).not.toContain("<button><button");
	});
});
