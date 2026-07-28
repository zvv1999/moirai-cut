import { describe, expect, test } from "bun:test";
import type { SceneTracks, TimelineElement, VideoElement } from "@/timeline";
import { applyElementUpdate } from "@/timeline/update-pipeline";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";

function expectVideoElement(element: TimelineElement): VideoElement {
	expect(element.type).toBe("video");
	if (element.type !== "video") {
		throw new Error(`Expected a video element, received ${element.type}`);
	}
	return element;
}

function buildVideoElement(
	overrides: Partial<VideoElement> = {},
): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "Video 1",
		startTime: ZERO_MEDIA_TIME,
		duration: mediaTime({ ticks: 10 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		mediaId: "media-1",
		params: {
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
		},
		...overrides,
	};
}

function buildTracks(element: VideoElement): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main-track",
			type: "video",
			name: "Main",
			muted: false,
			hidden: false,
			elements: [element],
		},
		audio: [],
	};
}

describe("applyElementUpdate", () => {
	test("rounds retimed durations back to integer media time", () => {
		const element = buildVideoElement();
		const tracks = buildTracks(element);

		const updatedElement = applyElementUpdate({
			element,
			patch: {
				retime: { rate: 1.5 },
			},
			context: {
				tracks,
				trackId: tracks.main.id,
			},
		});

		expect(updatedElement.duration).toBe(mediaTime({ ticks: 7 }));
		expect(Number.isInteger(updatedElement.duration)).toBe(true);
	});

	test("preserves duration and captures a stable source duration for advanced retime", () => {
		const element = buildVideoElement({
			duration: mediaTime({ ticks: 100 }),
			trimStart: mediaTime({ ticks: 10 }),
			trimEnd: mediaTime({ ticks: 20 }),
		});
		const tracks = buildTracks(element);
		const curved = expectVideoElement(
			applyElementUpdate({
				element,
				patch: {
					retime: {
						rate: 0.6,
						curve: {
							points: [
								{ time: ZERO_MEDIA_TIME, rate: 0.6 },
								{ time: mediaTime({ ticks: 45 }), rate: 2.2 },
								{ time: mediaTime({ ticks: 100 }), rate: 0.8 },
							],
						},
					},
				},
				context: { tracks, trackId: tracks.main.id },
			}),
		);

		expect(curved.duration).toBe(mediaTime({ ticks: 100 }));
		expect(curved.sourceDuration).toBe(mediaTime({ ticks: 130 }));

		const reversed = expectVideoElement(
			applyElementUpdate({
				element: curved,
				patch: {
					retime: { ...curved.retime!, reverse: true },
				},
				context: { tracks: buildTracks(curved), trackId: tracks.main.id },
			}),
		);
		const frozen = expectVideoElement(
			applyElementUpdate({
				element: reversed,
				patch: {
					retime: {
						...reversed.retime!,
						freezeFrameAt: mediaTime({ ticks: 42 }),
					},
				},
				context: { tracks: buildTracks(reversed), trackId: tracks.main.id },
			}),
		);

		expect(reversed.duration).toBe(mediaTime({ ticks: 100 }));
		expect(frozen.duration).toBe(mediaTime({ ticks: 100 }));
		expect(frozen.sourceDuration).toBe(mediaTime({ ticks: 130 }));
	});
});
