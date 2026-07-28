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

		const clipButtonStart = html.indexOf("<button");
		const clipButtonEnd = html.indexOf("</button>", clipButtonStart);
		const keyframeButtonStart = html.indexOf(
			'<button type="button" aria-label="Select keyframe"',
		);

		expect(clipButtonStart).toBeGreaterThanOrEqual(0);
		expect(clipButtonEnd).toBeGreaterThan(clipButtonStart);
		expect(keyframeButtonStart).toBeGreaterThan(clipButtonEnd);
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

		expect(html).toContain(
			'class="absolute inset-x-0 bottom-0 z-20"',
		);
		expect(html).toContain(
			'class="absolute inset-x-0 top-0 flex overflow-hidden rounded-sm"',
		);
	});
});
