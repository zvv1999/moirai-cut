import { describe, expect, test } from "bun:test";
import { getPropertiesConfig } from "../registry";
import { getElementParams } from "@/params/registry";
import type { VideoElement } from "@/timeline";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";

function buildVideo(): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "采访",
		mediaId: "media-1",
		startTime: ZERO_MEDIA_TIME,
		duration: mediaTime({ ticks: 100 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

describe("Jianying-style properties registry", () => {
	test("uses concise Chinese top-level categories and keeps blending inside visual", () => {
		const config = getPropertiesConfig({
			element: buildVideo(),
			mediaAssets: [],
		});

		expect(
			config.tabs.map(({ id, label }) => ({ id, label })),
		).toEqual([
			{ id: "visual", label: "画面" },
			{ id: "audio", label: "音频" },
			{ id: "speed", label: "变速" },
			{ id: "motion", label: "跟踪" },
			{ id: "masks", label: "蒙版" },
			{ id: "effects", label: "特效" },
		]);
		expect(config.defaultTab).toBe("visual");
	});

	test("presents visual values in editor-friendly Chinese display units", () => {
		const params = getElementParams({ element: buildVideo() });
		const byKey = Object.fromEntries(params.map((param) => [param.key, param]));

		expect(byKey["transform.positionX"]).toMatchObject({
			label: "位置 X",
			shortLabel: "X",
		});
		expect(byKey["transform.positionY"]).toMatchObject({
			label: "位置 Y",
			shortLabel: "Y",
		});
		expect(byKey["transform.scaleX"]).toMatchObject({
			label: "缩放 X",
			displayMultiplier: 100,
			min: 1,
			step: 1,
		});
		expect(byKey["transform.scaleY"]).toMatchObject({
			label: "缩放 Y",
			displayMultiplier: 100,
			min: 1,
			step: 1,
		});
		expect(byKey["transform.rotate"]).toMatchObject({
			label: "旋转",
			shortLabel: "°",
		});
		expect(byKey.opacity).toMatchObject({
			label: "不透明度",
			displayMultiplier: 100,
			min: 0,
			max: 100,
			step: 1,
		});
		expect(byKey.blendMode).toMatchObject({ label: "混合模式" });
	});
});
