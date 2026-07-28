import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PropertyParamField } from "../components/property-param-field";

describe("PropertyParamField", () => {
	test("gives every editable parameter a discoverable reset action", () => {
		const html = renderToStaticMarkup(
			<PropertyParamField
				param={{
					key: "muted",
					label: "Muted",
					type: "boolean",
					default: false,
					keyframable: false,
				}}
				value={true}
				onPreview={() => undefined}
				onCommit={() => undefined}
			/>,
		);

		expect(html).toContain('aria-label="Reset muted"');
		expect(html).not.toContain('aria-disabled="true"');
	});

	test("disables reset at the default while retaining keyframe affordance", () => {
		const html = renderToStaticMarkup(
			<PropertyParamField
				param={{
					key: "opacity",
					label: "Opacity",
					type: "number",
					default: 1,
					min: 0,
					max: 1,
					step: 0.01,
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

		expect(html).toContain('aria-label="Reset opacity"');
		expect(html).toContain("disabled");
		expect(html).toContain('title="Toggle opacity keyframe"');
	});
});
