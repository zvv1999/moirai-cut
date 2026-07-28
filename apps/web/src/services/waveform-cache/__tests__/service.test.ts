import { describe, expect, test } from "bun:test";
import { WaveformCache } from "@/services/waveform-cache/service";

function fakeAudioBuffer(): AudioBuffer {
	const data = Float32Array.from([0, 0.25, -0.5, 0.75]);
	return {
		length: data.length,
		numberOfChannels: 1,
		sampleRate: 48_000,
		getChannelData: () => data,
	} as AudioBuffer;
}

describe("waveform cache diagnostics", () => {
	test("deduplicates in-flight work and reports reusable cache entries", async () => {
		const cache = new WaveformCache();
		const first = cache.getSourceSummary({
			sourceKey: "media:one",
			audioBuffer: fakeAudioBuffer(),
		});
		const second = cache.getSourceSummary({
			sourceKey: "media:one",
			audioBuffer: fakeAudioBuffer(),
		});

		expect(first).toBe(second);
		await first;
		expect(cache.getStats()).toEqual({
			entries: 1,
			hits: 1,
			misses: 1,
			errors: 0,
		});

		cache.clearSource({ sourceKey: "media:one" });
		expect(cache.getStats().entries).toBe(0);
	});
});
