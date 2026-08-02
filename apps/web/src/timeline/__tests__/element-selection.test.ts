import { describe, expect, test } from "bun:test";
import {
	applyTimelineElementClickSelection,
	getTimelineRangeSelection,
} from "@/timeline/element-selection";

const tracks = [
	{
		id: "upper",
		elements: [
			{ id: "upper-a", startTime: 20, duration: 10 },
			{ id: "upper-b", startTime: 50, duration: 10 },
		],
	},
	{
		id: "main",
		elements: [
			{ id: "main-a", startTime: 0, duration: 10 },
			{ id: "main-b", startTime: 30, duration: 10 },
		],
	},
];

describe("timeline element selection", () => {
	test("orders a shift range chronologically across tracks", () => {
		expect(
			getTimelineRangeSelection({
				tracks,
				anchor: { trackId: "main", elementId: "main-a" },
				target: { trackId: "main", elementId: "main-b" },
			}),
		).toEqual([
			{ trackId: "main", elementId: "main-a" },
			{ trackId: "upper", elementId: "upper-a" },
			{ trackId: "main", elementId: "main-b" },
		]);
	});

	test("replaces the selection and establishes a range anchor", () => {
		expect(
			applyTimelineElementClickSelection({
				tracks,
				selected: [{ trackId: "upper", elementId: "upper-a" }],
				anchor: { trackId: "upper", elementId: "upper-a" },
				target: { trackId: "main", elementId: "main-b" },
				intent: "replace",
			}),
		).toEqual({
			elements: [{ trackId: "main", elementId: "main-b" }],
			anchor: { trackId: "main", elementId: "main-b" },
		});
	});

	test("command/control toggles one target without disturbing the rest", () => {
		expect(
			applyTimelineElementClickSelection({
				tracks,
				selected: [
					{ trackId: "main", elementId: "main-a" },
					{ trackId: "upper", elementId: "upper-a" },
				],
				anchor: { trackId: "main", elementId: "main-a" },
				target: { trackId: "upper", elementId: "upper-a" },
				intent: "toggle",
			}),
		).toEqual({
			elements: [{ trackId: "main", elementId: "main-a" }],
			anchor: { trackId: "main", elementId: "main-a" },
		});
	});

	test("a stale shift anchor falls back to the clicked target", () => {
		expect(
			applyTimelineElementClickSelection({
				tracks,
				selected: [],
				anchor: { trackId: "missing", elementId: "missing" },
				target: { trackId: "upper", elementId: "upper-b" },
				intent: "range",
			}),
		).toEqual({
			elements: [{ trackId: "upper", elementId: "upper-b" }],
			anchor: { trackId: "upper", elementId: "upper-b" },
		});
	});
});
