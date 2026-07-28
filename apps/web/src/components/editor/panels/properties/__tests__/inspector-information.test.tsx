import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	InspectorSelectionHeader,
	InspectorTabNavigation,
	formatInspectorDuration,
} from "../components/inspector-chrome";
import { mediaTimeFromSeconds } from "@/wasm";

describe("InspectorSelectionHeader", () => {
	test("keeps selected item identity, type, duration, and track visible", () => {
		const html = renderToStaticMarkup(
			<InspectorSelectionHeader
				name="Interview.mov"
				type="video"
				duration={mediaTimeFromSeconds({ seconds: 5.25 })}
				trackName="Main Video"
			/>,
		);

		expect(html).toContain('aria-label="Selected video: Interview.mov"');
		expect(html).toContain("Basic");
		expect(html).toContain("Interview.mov");
		expect(html).toContain("Video clip");
		expect(html).toContain("00:05.25");
		expect(html).toContain("Main Video");
	});

	test("formats long durations without dropping the hour", () => {
		expect(
			formatInspectorDuration({
				duration: mediaTimeFromSeconds({ seconds: 3723.5 }),
			}),
		).toBe("01:02:03.50");
	});
});

describe("InspectorTabNavigation", () => {
	test("renders named tabs with an explicit selected state", () => {
		const html = renderToStaticMarkup(
			<InspectorTabNavigation
				tabs={[
					{ id: "transform", label: "Transform", icon: <span>T</span> },
					{ id: "blending", label: "Blend", icon: <span>B</span> },
					{ id: "masks", label: "Mask", icon: <span>M</span> },
					{ id: "effects", label: "Effect", icon: <span>E</span> },
				]}
				activeTabId="blending"
				onSelect={() => undefined}
			/>,
		);

		expect(html).toContain('role="tablist"');
		expect(html).toContain(">Transform<");
		expect(html).toContain(">Blend<");
		expect(html).toContain(">Mask<");
		expect(html).toContain(">Effect<");
		expect(html).toContain('aria-selected="true"');
		expect(html).toContain('aria-controls="inspector-panel-blending"');
	});
});
