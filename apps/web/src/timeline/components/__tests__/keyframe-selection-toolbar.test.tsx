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

		expect(html).toContain("已选 2 个关键帧");
		expect(html).toContain(
			'aria-label="将所选关键帧向前移动一帧"',
		);
		expect(html).toContain(
			'aria-label="将所选关键帧向后移动一帧"',
		);
		expect(html).toContain('aria-label="复制所选关键帧"');
		expect(html).toContain('aria-label="在播放头处粘贴关键帧"');
		expect(html).toContain('aria-label="关键帧插值"');
		expect(html).toContain(
			'<option value="linear" selected="">线性</option>',
		);
		expect(html).toContain('<option value="hold">定格</option>');
		expect(html).toContain('<option value="bezier">贝塞尔</option>');
		expect(html).toContain('aria-label="删除所选关键帧"');
	});
});
