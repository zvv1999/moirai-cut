import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	JianyingPositionSizeControls,
	buildLinkedScaleUpdates,
} from "../components/jianying-position-size";

const idleKeyframe = {
	isActive: false,
	isDisabled: false,
	keyframeCount: 0,
	canGoPrevious: false,
	canGoNext: false,
	onPrevious: () => undefined,
	onToggle: () => undefined,
	onNext: () => undefined,
};

const numberControl = (value: number) => ({
	value,
	onPreview: () => undefined,
	onCommit: () => undefined,
	keyframe: idleKeyframe,
});

describe("JianyingPositionSizeControls", () => {
	test("uses one scale slider, an equal-scale switch, paired position fields, rotation, and alignment tools", () => {
		const html = renderToStaticMarkup(
			<JianyingPositionSizeControls
				scaleX={numberControl(1)}
				scaleY={numberControl(1)}
				positionX={numberControl(0)}
				positionY={numberControl(0)}
				rotate={numberControl(0)}
				equalScale
				onEqualScaleChange={() => undefined}
				onAlign={() => undefined}
				onReset={() => undefined}
			/>,
		);

		expect(html).toContain('data-inspector-section="position-size"');
		expect(html).toContain(">位置大小<");
		expect(html).toContain(">缩放<");
		expect(html).toContain('aria-label="缩放滑杆"');
		expect(html).toContain(">等比缩放<");
		expect(html).toContain('aria-label="等比缩放"');
		expect(html).toContain('aria-label="位置 X"');
		expect(html).toContain('aria-label="位置 Y"');
		expect(html).toContain('aria-label="旋转"');
		expect(html).toContain('aria-label="左对齐"');
		expect(html).toContain('aria-label="水平居中"');
		expect(html).toContain('aria-label="右对齐"');
		expect(html).toContain('aria-label="顶部对齐"');
		expect(html).toContain('aria-label="垂直居中"');
		expect(html).toContain('aria-label="底部对齐"');
		expect((html.match(/aria-label="缩放滑杆"/g) ?? []).length).toBe(1);
	});

	test("updates both axes while equal scale is enabled", () => {
		expect(
			buildLinkedScaleUpdates({
				value: 1.25,
				equalScale: true,
			}),
		).toEqual({
			"transform.scaleX": 1.25,
			"transform.scaleY": 1.25,
		});
		expect(
			buildLinkedScaleUpdates({
				value: 0.8,
				equalScale: false,
			}),
		).toEqual({
			"transform.scaleX": 0.8,
		});
	});
});
