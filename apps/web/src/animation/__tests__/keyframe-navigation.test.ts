import { describe, expect, test } from "bun:test";
import { getAdjacentKeyframeTimes } from "../keyframe-navigation";
import { mediaTime } from "@/wasm";

describe("getAdjacentKeyframeTimes", () => {
	test("finds strict previous and next keyframes at an in-range playhead", () => {
		expect(
			getAdjacentKeyframeTimes({
				times: [
					mediaTime({ ticks: 300 }),
					mediaTime({ ticks: 100 }),
					mediaTime({ ticks: 200 }),
					mediaTime({ ticks: 200 }),
				],
				localTime: mediaTime({ ticks: 200 }),
				position: "inside",
			}),
		).toEqual({
			previous: mediaTime({ ticks: 100 }),
			next: mediaTime({ ticks: 300 }),
			count: 3,
		});
	});

	test("includes the clip boundary when the playhead is outside the element", () => {
		expect(
			getAdjacentKeyframeTimes({
				times: [mediaTime({ ticks: 0 }), mediaTime({ ticks: 400 })],
				localTime: mediaTime({ ticks: 0 }),
				position: "before",
			}),
		).toEqual({
			previous: null,
			next: mediaTime({ ticks: 0 }),
			count: 2,
		});

		expect(
			getAdjacentKeyframeTimes({
				times: [mediaTime({ ticks: 0 }), mediaTime({ ticks: 400 })],
				localTime: mediaTime({ ticks: 400 }),
				position: "after",
			}),
		).toEqual({
			previous: mediaTime({ ticks: 400 }),
			next: null,
			count: 2,
		});
	});
});
