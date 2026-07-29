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
		expect(html).toContain("基础信息");
		expect(html).toContain("Interview.mov");
		expect(html).toContain("视频");
		expect(html).toContain("00:05.25");
		expect(html).toContain("Main Video");
		expect(html).toContain("时长");
		expect(html).toContain("轨道");
		expect(html).toContain('data-inspector-context="selected-clip"');
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
					{ id: "visual", label: "画面", icon: <span>V</span> },
					{ id: "audio", label: "音频", icon: <span>A</span> },
					{ id: "speed", label: "变速", icon: <span>S</span> },
					{ id: "effects", label: "特效", icon: <span>E</span> },
				]}
				activeTabId="audio"
				onSelect={() => undefined}
			/>,
		);

		expect(html).toContain('role="tablist"');
		expect(html).toContain('aria-label="属性分类"');
		expect(html).toContain('data-inspector-tabs="clip-properties"');
		expect(html).toContain(">画面<");
		expect(html).toContain(">音频<");
		expect(html).toContain(">变速<");
		expect(html).toContain(">特效<");
		expect(html).toContain('aria-selected="true"');
		expect(html).toContain('data-active="true"');
		expect(html).toContain('aria-controls="inspector-panel-audio"');
	});
});
