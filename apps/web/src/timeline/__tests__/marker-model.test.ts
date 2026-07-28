import { describe, expect, test } from "bun:test";
import {
	createClipMarker,
	createTimelineMarker,
	getAdjacentMarker,
	resolveMarkerAddress,
} from "@/timeline/bookmarks/marker-model";

const markers = [
	{ id: "intro", name: "Intro", time: 10, scope: "timeline" as const },
	{
		id: "shot",
		name: "Shot note",
		time: 30,
		duration: 20,
		scope: "clip" as const,
		trackId: "main",
		elementId: "clip-a",
	},
	{ id: "outro", name: "Outro", time: 80, scope: "timeline" as const },
];

describe("marker model", () => {
	test("creates an addressable timeline marker at the playhead", () => {
		expect(
			createTimelineMarker({
				id: "marker-1",
				time: 42,
				name: "Beat change",
			}),
		).toEqual({
			id: "marker-1",
			time: 42,
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
					startTime: 30,
					duration: 20,
				},
			}),
		).toEqual({
			id: "marker-2",
			time: 30,
			duration: 20,
			name: "Opening shot",
			scope: "clip",
			trackId: "main",
			elementId: "clip-a",
		});
	});

	test("navigates to strict previous and next markers", () => {
		expect(getAdjacentMarker({ markers, time: 35, direction: "previous" })?.id).toBe(
			"shot",
		);
		expect(getAdjacentMarker({ markers, time: 35, direction: "next" })?.id).toBe(
			"outro",
		);
		expect(getAdjacentMarker({ markers, time: 80, direction: "next" })).toBeNull();
	});

	test("resolves an agent address by stable id before legacy time", () => {
		expect(
			resolveMarkerAddress({
				markers,
				markerId: "shot",
				time: 10,
			})?.id,
		).toBe("shot");
		expect(
			resolveMarkerAddress({
				markers,
				markerId: null,
				time: 80,
			})?.id,
		).toBe("outro");
	});
});
