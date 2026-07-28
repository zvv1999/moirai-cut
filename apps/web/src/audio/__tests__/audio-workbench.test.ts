import { describe, expect, test } from "bun:test";
import {
	analyzePcmChannels,
	buildNormalizationPatch,
} from "@/audio/analysis";
import {
	applyAudioProcessingFrame,
	getAudioProcessingSettings,
} from "@/audio/processing";
import {
	advanceVoiceOverState,
	buildVoiceOverFilename,
	createVoiceOverState,
} from "@/audio/voice-over";
import type { AudioElement } from "@/timeline";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";

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
		name: "Dialogue",
		startTime: ZERO_MEDIA_TIME,
		duration: mediaTimeFromSeconds({ seconds: 4 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: { volume: 0, muted: false, ...params },
	};
}

describe("audio loudness analysis", () => {
	test("reports loudness, clipping, and a bounded non-destructive normalization patch", () => {
		const result = analyzePcmChannels({
			channels: [
				Float32Array.from([0, 0.1, -0.1, 1.04]),
				Float32Array.from([0, 0.1, -0.1, 0.8]),
			],
			sampleRate: 48_000,
			targetLufs: -14,
		});

		expect(result.peakDbfs).toBeGreaterThanOrEqual(0);
		expect(result.clippedSampleCount).toBe(1);
		expect(result.clippingDetected).toBe(true);
		expect(Number.isFinite(result.integratedLufs)).toBe(true);
		expect(result.normalizationGainDb).toBeLessThanOrEqual(24);
		expect(result.normalizationGainDb).toBeGreaterThanOrEqual(-24);

		expect(
			buildNormalizationPatch({
				element: audioElement({ params: { volume: -3 } }),
				analysis: { ...result, normalizationGainDb: 4.5 },
			}),
		).toEqual({ params: { volume: 1.5 } });
	});
});

describe("reversible audio processing", () => {
	test("reads defaults and applies gain, channel balance, voice, and denoise without mutating PCM", () => {
		const source = [0.25, -0.25] as const;
		const settings = getAudioProcessingSettings({
			element: audioElement({
				params: {
					audioNoiseReduction: true,
					audioVoiceEnhance: true,
					audioChannelBalance: 0.5,
					audioProcessingGainDb: 6,
				},
			}),
		});
		const result = applyAudioProcessingFrame({
			frame: source,
			settings,
		});

		expect(settings).toEqual({
			noiseReduction: true,
			voiceEnhance: true,
			channelBalance: 0.5,
			gainDb: 6,
		});
		expect(source).toEqual([0.25, -0.25]);
		expect(result[0]).not.toBe(source[0]);
		expect(Math.abs(result[1])).toBeGreaterThan(Math.abs(result[0]));
	});
});

describe("voice-over state", () => {
	test("counts in, records levels, and produces deterministic take names", () => {
		let state = createVoiceOverState({ countInSeconds: 2 });
		expect(state.phase).toBe("ready");

		state = advanceVoiceOverState({ state, event: { type: "arm" } });
		expect(state).toMatchObject({ phase: "counting", countInRemaining: 2 });

		state = advanceVoiceOverState({ state, event: { type: "tick" } });
		state = advanceVoiceOverState({ state, event: { type: "tick" } });
		expect(state.phase).toBe("recording");

		state = advanceVoiceOverState({
			state,
			event: { type: "level", value: 0.7 },
		});
		expect(state.level).toBe(0.7);

		state = advanceVoiceOverState({ state, event: { type: "stop" } });
		expect(state.phase).toBe("processing");
		expect(
			buildVoiceOverFilename({
				takeNumber: 12,
				mimeType: "audio/webm;codecs=opus",
			}),
		).toBe("Voice-over Take 012.webm");
	});
});
