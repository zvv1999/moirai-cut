import { describe, expect, test } from "bun:test";
import type { WrappedCanvas } from "mediabunny";
import { VideoCache } from "./service";

function fixture() {
	const cache = new VideoCache();
	const decoded: number[] = [];
	const sinkData = {
		input: { dispose() {} },
		sink: {
			async *canvases(time: number) {
				decoded.push(time);
				yield {
					canvas: { width: 16, height: 16 },
					timestamp: time,
					duration: 1 / 30,
				} as WrappedCanvas;
			},
		},
		iterator: null,
		currentFrame: null,
		nextFrame: null,
		lastTime: -1,
		prefetching: false,
		prefetchPromise: null,
	};
	// Inject a decoded source so this concurrency test needs no browser codec.
	const internals = cache as unknown as {
		sinks: Map<string, typeof sinkData>;
	};
	internals.sinks.set("source", sinkData);
	const file = new File([], "source.mp4");
	const frame = (time: number) =>
		cache.getFrameAt({ mediaId: "source", file, time });
	return { cache, decoded, frame };
}

describe("video frame request isolation", () => {
	test("concurrent captures preserve every requested source time", async () => {
		const { cache, decoded, frame } = fixture();
		await frame(0);
		const times = [2.8, 10.62, 0.5, 11];
		const frames = await Promise.all(times.map(frame));
		expect(frames.map((value) => value?.timestamp)).toEqual(times);
		expect(decoded).toEqual([0, ...times]);
		cache.clearAll();
	});

	test("concurrent first requests never return a missing cached frame", async () => {
		const { cache, frame } = fixture();
		const frames = await Promise.all([frame(2.5), frame(10.42)]);
		expect(frames.map((value) => value?.timestamp)).toEqual([2.5, 10.42]);
		cache.clearAll();
	});
});
