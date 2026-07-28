import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyframeSelectionToolbarView } from "../keyframe-selection-toolbar";

describe("KeyframeSelectionToolbarView", () => {
	test("makes selection, movement, clipboard, interpolation, and delete actions explicit", () => {
		const html = renderToStaticMarkup(
			<KeyframeSelectionToolbarView
				selectedCount={2}
				canPaste
				interpolation="linear"
				onNudgeBackward={() => {}}
				onNudgeForward={() => {}}
				onCopy={() => {}}
				onPaste={() => {}}
				onInterpolationChange={() => {}}
				onDelete={() => {}}
			/>,
		);

		expect(html).toContain("2 keyframes selected");
		expect(html).toContain(
			'aria-label="Nudge selected keyframes backward one frame"',
		);
		expect(html).toContain(
			'aria-label="Nudge selected keyframes forward one frame"',
		);
		expect(html).toContain('aria-label="Copy selected keyframes"');
		expect(html).toContain('aria-label="Paste keyframes at playhead"');
		expect(html).toContain('aria-label="Keyframe interpolation"');
		expect(html).toContain(
			'<option value="linear" selected="">Linear</option>',
		);
		expect(html).toContain('<option value="hold">Hold</option>');
		expect(html).toContain('<option value="bezier">Bezier</option>');
		expect(html).toContain('aria-label="Delete selected keyframes"');
	});
});
