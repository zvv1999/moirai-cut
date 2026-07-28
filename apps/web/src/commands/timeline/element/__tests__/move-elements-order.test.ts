import { describe, expect, test } from "bun:test";
import { sortTimelineElements } from "../move-elements";

describe("move element ordering", () => {
	test("a move and its inverse recover canonical document order", () => {
		const original = [
			{ id: "a", startTime: 0 },
			{ id: "b", startTime: 10 },
			{ id: "c", startTime: 20 },
		];
		const moved = sortTimelineElements([
			original[0],
			original[2],
			{ ...original[1], startTime: 4 },
		]);
		expect(moved.map((element) => element.id)).toEqual(["a", "b", "c"]);

		const restored = sortTimelineElements(
			moved.map((element) =>
				element.id === "b" ? { ...element, startTime: 10 } : element,
			),
		);
		expect(restored).toEqual(original);
	});
});
