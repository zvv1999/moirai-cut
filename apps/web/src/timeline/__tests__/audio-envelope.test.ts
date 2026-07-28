import { describe, expect, test } from "bun:test";
import {
	buildVolumeEnvelopePoints,
	getAudioFadeDurations,
	resolveAudioFadeGain,
	setAudioFadeDuration,
} from "@/timeline/audio-envelope";
import { resolveEffectiveAudioGain } from "@/timeline/audio-state";
import type { AudioElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";

function audioElement({
	params = {},
}: {
	params?: AudioElement["params"];
} = {}): AudioElement {
	return {
		id: "audio-1",
		type: "audio",
		sourceType: "upload",
		mediaId: "media-1",
		name: "Voice",
		startTime: 0,
		duration: 10 * TICKS_PER_SECOND,
		trimStart: 0,
		trimEnd: 0,
		params: { volume: 0, muted: false, ...params },
	};
}

describe("audio volume envelope", () => {
	test("maps numeric volume keys to clip-local percentage points and keeps boundaries visible", () => {
		const element: AudioElement = {
			...audioElement(),
			animations: {
				volume: {
					keys: [
						{
							id: "quiet",
							time: 2 * TICKS_PER_SECOND,
							value: -12,
							segmentToNext: "linear",
							tangentMode: "auto",
						},
						{
							id: "unity",
							time: 8 * TICKS_PER_SECOND,
							value: 0,
							segmentToNext: "linear",
							tangentMode: "auto",
						},
					],
				},
			},
		};

		const points = buildVolumeEnvelopePoints({ element });

		expect(points.map((point) => point.kind)).toEqual([
			"boundary",
			"keyframe",
			"keyframe",
			"boundary",
		]);
		expect(points.map((point) => point.xPercent)).toEqual([0, 20, 80, 100]);
		expect(points[1]).toMatchObject({
			keyframeId: "quiet",
			valueDb: -12,
		});
		expect(points[2]).toMatchObject({
			keyframeId: "unity",
			valueDb: 0,
		});
	});
});

describe("audio fades", () => {
	test("keeps inspector and handle values within the clip and each other", () => {
		const withFadeIn = setAudioFadeDuration({
			element: audioElement({ params: { audioFadeOut: 3 } }),
			side: "in",
			seconds: 9,
		});
		expect(getAudioFadeDurations({ element: withFadeIn })).toEqual({
			fadeInSeconds: 7,
			fadeOutSeconds: 3,
		});

		const withFadeOut = setAudioFadeDuration({
			element: withFadeIn,
			side: "out",
			seconds: -1,
		});
		expect(getAudioFadeDurations({ element: withFadeOut })).toEqual({
			fadeInSeconds: 7,
			fadeOutSeconds: 0,
		});
	});

	test("applies linear fades non-destructively on top of the volume envelope", () => {
		const element = audioElement({
			params: {
				volume: -6,
				audioFadeIn: 2,
				audioFadeOut: 2,
			},
		});

		expect(
			resolveAudioFadeGain({
				durationSeconds: 10,
				localTimeSeconds: 1,
				fadeInSeconds: 2,
				fadeOutSeconds: 2,
			}),
		).toBeCloseTo(0.5);
		expect(
			resolveEffectiveAudioGain({
				element,
				localTime: 1,
			}),
		).toBeCloseTo(10 ** (-6 / 20) * 0.5);
		expect(
			resolveEffectiveAudioGain({
				element,
				localTime: 5,
			}),
		).toBeCloseTo(10 ** (-6 / 20));
		expect(
			resolveEffectiveAudioGain({
				element,
				localTime: 9,
			}),
		).toBeCloseTo(10 ** (-6 / 20) * 0.5);
	});
});
