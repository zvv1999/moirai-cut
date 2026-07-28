import { describe, expect, test } from "bun:test";
import {
	getFrameStepTarget,
	getPreviewFrameStep,
	resolvePlaybackAdvance,
} from "@/playback/transport";
import { mediaTimeFromSeconds } from "@/wasm";

const FPS_30 = { numerator: 30, denominator: 1 };

describe("playback transport timing", () => {
	test("steps from a non-frame-aligned playhead to the adjacent frame", () => {
		const duration = mediaTimeFromSeconds({ seconds: 10 });

		expect(
			getFrameStepTarget({
				currentTime: mediaTimeFromSeconds({ seconds: 1.014 }),
				direction: 1,
				duration,
				fps: FPS_30,
			}),
		).toBe(mediaTimeFromSeconds({ seconds: 1 + 1 / 30 }));

		expect(
			getFrameStepTarget({
				currentTime: mediaTimeFromSeconds({ seconds: 1.014 }),
				direction: -1,
				duration,
				fps: FPS_30,
			}),
		).toBe(mediaTimeFromSeconds({ seconds: 1 - 1 / 30 }));
	});

	test("applies playback speed before frame rounding", () => {
		expect(
			resolvePlaybackAdvance({
				startTime: mediaTimeFromSeconds({ seconds: 1 }),
				elapsedMilliseconds: 500,
				playbackRate: 2,
				duration: mediaTimeFromSeconds({ seconds: 10 }),
				fps: FPS_30,
				loopEnabled: false,
			}),
		).toEqual({
			time: mediaTimeFromSeconds({ seconds: 2 }),
			ended: false,
			wrapped: false,
		});
	});

	test("wraps at the project end when looping and stops exactly at the end otherwise", () => {
		const input = {
			startTime: mediaTimeFromSeconds({ seconds: 1.8 }),
			elapsedMilliseconds: 200,
			playbackRate: 2,
			duration: mediaTimeFromSeconds({ seconds: 2 }),
			fps: FPS_30,
		};

		expect(resolvePlaybackAdvance({ ...input, loopEnabled: true })).toEqual({
			time: mediaTimeFromSeconds({ seconds: 0.2 }),
			ended: false,
			wrapped: true,
		});
		expect(resolvePlaybackAdvance({ ...input, loopEnabled: false })).toEqual({
			time: mediaTimeFromSeconds({ seconds: 2 }),
			ended: true,
			wrapped: false,
		});
	});
});

describe("preview quality cadence", () => {
	test("maps quality modes to explicit render-frame density", () => {
		expect(getPreviewFrameStep({ quality: "full" })).toBe(1);
		expect(getPreviewFrameStep({ quality: "balanced" })).toBe(2);
		expect(getPreviewFrameStep({ quality: "performance" })).toBe(4);
	});
});
