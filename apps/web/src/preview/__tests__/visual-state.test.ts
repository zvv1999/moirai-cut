import { describe, expect, test } from "bun:test";
import { getPreviewVisualState } from "@/preview/visual-state";
import type { TimelineTrack } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";

const at = (seconds: number) => mediaTimeFromSeconds({ seconds });

function visualTrack({
	hidden = false,
	ranges,
}: {
	hidden?: boolean;
	ranges: Array<[number, number]>;
}): TimelineTrack {
	return {
		id: "video-track",
		name: "主轨道",
		type: "video",
		muted: false,
		hidden,
		elements: ranges.map(([start, end], index) => ({
			id: `video-${index}`,
			name: `镜头 ${index + 1}`,
			type: "video",
			mediaId: `media-${index}`,
			startTime: at(start),
			duration: at(end - start),
			trimStart: at(0),
			trimEnd: at(end - start),
			params: {},
			animations: {},
		})),
	} as TimelineTrack;
}

describe("getPreviewVisualState", () => {
	test("reports a visible frame while a visual element is active", () => {
		expect(
			getPreviewVisualState({
				tracks: [visualTrack({ ranges: [[0, 2]] })],
				time: at(1),
			}),
		).toEqual({ kind: "visible", firstVisualTime: at(0), lastVisualTime: at(2) });
	});

	test("distinguishes an internal gap from the empty tail after the last visual", () => {
		const tracks = [visualTrack({ ranges: [[0, 2], [4, 6]] })];

		expect(getPreviewVisualState({ tracks, time: at(3) }).kind).toBe("gap");
		expect(getPreviewVisualState({ tracks, time: at(7) }).kind).toBe("after");
	});

	test("ignores hidden tracks and explains a project with no visible content", () => {
		expect(
			getPreviewVisualState({
				tracks: [visualTrack({ hidden: true, ranges: [[0, 2]] })],
				time: at(1),
			}),
		).toEqual({
			kind: "no-visuals",
			firstVisualTime: null,
			lastVisualTime: null,
		});
	});
});
