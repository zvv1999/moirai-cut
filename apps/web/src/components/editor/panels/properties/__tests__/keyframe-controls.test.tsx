import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyframeControls } from "../components/keyframe-controls";

describe("KeyframeControls", () => {
	test("keeps previous, add/delete, and next controls visible with current-time state", () => {
		const html = renderToStaticMarkup(
			<KeyframeControls
				label="缩放 X"
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

		expect(html).toContain('aria-label="上一个缩放 X关键帧"');
		expect(html).toContain('aria-label="删除播放头处的缩放 X关键帧"');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('aria-label="下一个缩放 X关键帧"');
		expect(html).toContain("3 个关键帧");
	});

	test("explains why navigation or insertion is unavailable", () => {
		const html = renderToStaticMarkup(
			<KeyframeControls
				label="不透明度"
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

		expect(html).toContain('title="没有上一个不透明度关键帧"');
		expect(html).toContain(
			'title="请将播放头移到素材范围内再添加关键帧"',
		);
		expect(html).toContain('title="没有下一个不透明度关键帧"');
	});
});
