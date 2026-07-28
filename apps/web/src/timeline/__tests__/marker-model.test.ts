import { describe, expect, test } from "bun:test";
import {
	createClipMarker,
	createTimelineMarker,
	getAdjacentMarker,
	resolveMarkerAddress,
} from "@/timeline/bookmarks/marker-model";
import { mediaTime } from "@/wasm";

const markers = [
	{ id: "intro", name: "Intro", time: mediaTime({ ticks: 10 }), scope: "timeline" as const },
	{
		id: "shot",
		name: "Shot note",
		time: mediaTime({ ticks: 30 }),
		duration: mediaTime({ ticks: 20 }),
		scope: "clip" as const,
		trackId: "main",
		elementId: "clip-a",
	},
	{
		id: "outro",
		name: "Outro",
		time: mediaTime({ ticks: 80 }),
		scope: "timeline" as const,
	},
];

describe("marker model", () => {
	test("creates an addressable timeline marker at the playhead", () => {
		expect(
			createTimelineMarker({
				id: "marker-1",
				time: mediaTime({ ticks: 42 }),
				name: "Beat change",
			}),
		).toEqual({
			id: "marker-1",
			time: mediaTime({ ticks: 42 }),
			name: "Beat change",
			scope: "timeline",
		});
	});

	test("creates a ranged clip marker with a stable element address", () => {
		expect(
			createClipMarker({
				id: "marker-2",
				trackId: "main",
				element: {
					id: "clip-a",
					name: "Opening shot",
					startTime: mediaTime({ ticks: 30 }),
					duration: mediaTime({ ticks: 20 }),
				},
			}),
		).toEqual({
			id: "marker-2",
			time: mediaTime({ ticks: 30 }),
			duration: mediaTime({ ticks: 20 }),
			name: "Opening shot",
			scope: "clip",
			trackId: "main",
			elementId: "clip-a",
		});
	});

	test("navigates to strict previous and next markers", () => {
		expect(getAdjacentMarker({ markers, time: mediaTime({ ticks: 35 }), direction: "previous" })?.id).toBe(
			"shot",
		);
		expect(getAdjacentMarker({ markers, time: mediaTime({ ticks: 35 }), direction: "next" })?.id).toBe(
			"outro",
		);
		expect(
			getAdjacentMarker({
				markers,
				time: mediaTime({ ticks: 80 }),
				direction: "next",
			}),
		).toBeNull();
	});

	test("resolves an agent address by stable id before legacy time", () => {
		expect(
			resolveMarkerAddress({
				markers,
				markerId: "shot",
				time: mediaTime({ ticks: 10 }),
			})?.id,
		).toBe("shot");
		expect(
			resolveMarkerAddress({
				markers,
				markerId: null,
				time: mediaTime({ ticks: 80 }),
			})?.id,
		).toBe("outro");
	});
});
