import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PropertyParamField } from "../components/property-param-field";

describe("PropertyParamField", () => {
	test("gives every editable parameter a discoverable reset action", () => {
		const html = renderToStaticMarkup(
			<PropertyParamField
				param={{
					key: "muted",
					label: "静音",
					type: "boolean",
					default: false,
					keyframable: false,
				}}
				value={true}
				onPreview={() => undefined}
				onCommit={() => undefined}
			/>,
		);

		expect(html).toContain('aria-label="重置 静音"');
		expect(html).toContain('data-inspector-field="row"');
		expect(html).not.toContain('aria-disabled="true"');
	});

	test("disables reset at the default while retaining keyframe affordance", () => {
		const html = renderToStaticMarkup(
			<PropertyParamField
				param={{
					key: "opacity",
					label: "不透明度",
					type: "number",
					default: 1,
					min: 0,
					max: 100,
					step: 1,
					displayMultiplier: 100,
				}}
				value={1}
				onPreview={() => undefined}
				onCommit={() => undefined}
				keyframe={{
					isActive: false,
					isDisabled: false,
					onToggle: () => undefined,
				}}
			/>,
		);

		expect(html).toContain('aria-label="重置 不透明度"');
		expect(html).toContain("disabled");
		expect(html).toContain('title="在播放头处切换不透明度关键帧"');
		expect(html).toContain('aria-label="不透明度滑杆"');
		expect(html).toContain('value="100"');
		expect(html).toContain("%");
	});

	test("keeps a soft scale slider without limiting typed scale values", () => {
		const html = renderToStaticMarkup(
			<PropertyParamField
				param={{
					key: "transform.scaleX",
					label: "缩放 X",
					type: "number",
					default: 1,
					min: 1,
					step: 1,
					displayMultiplier: 100,
					shortLabel: "X",
				}}
				value={1.04}
				onPreview={() => undefined}
				onCommit={() => undefined}
			/>,
		);

		expect(html).toContain('aria-label="缩放 X滑杆"');
		expect(html).toContain('max="500"');
		expect(html).toContain('value="104"');
	});
});
