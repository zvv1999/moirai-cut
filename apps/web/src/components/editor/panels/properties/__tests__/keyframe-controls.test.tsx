import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyframeControls } from "../components/keyframe-controls";

describe("KeyframeControls", () => {
	test("keeps previous, add/delete, and next controls visible with current-time state", () => {
		const html = renderToStaticMarkup(
			<KeyframeControls
				label="Scale X"
				isActive
				isDisabled={false}
				keyframeCount={3}
				canGoPrevious
				canGoNext
				onPrevious={() => {}}
				onToggle={() => {}}
				onNext={() => {}}
			/>,
		);

		expect(html).toContain('aria-label="Previous scale x keyframe"');
		expect(html).toContain('aria-label="Delete scale x keyframe at playhead"');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('aria-label="Next scale x keyframe"');
		expect(html).toContain("3 keyframes");
	});

	test("explains why navigation or insertion is unavailable", () => {
		const html = renderToStaticMarkup(
			<KeyframeControls
				label="Opacity"
				isActive={false}
				isDisabled
				keyframeCount={0}
				canGoPrevious={false}
				canGoNext={false}
				onPrevious={() => {}}
				onToggle={() => {}}
				onNext={() => {}}
			/>,
		);

		expect(html).toContain('title="No previous opacity keyframe"');
		expect(html).toContain(
			'title="Move the playhead inside the clip to add a keyframe"',
		);
		expect(html).toContain('title="No next opacity keyframe"');
	});
});
