import { describe, expect, test } from "bun:test";
import {
	buildMoveFeedback,
	buildResizeFeedback,
	buildRippleResizePreview,
} from "@/timeline/direct-manipulation-feedback";
import type {
	GroupMoveResult,
	GroupResizeResult,
	GroupResizeUpdate,
} from "@/timeline";
import type { SceneTracks } from "@/timeline";
import { mediaTime } from "@/wasm";

const mt = (ticks: number) => mediaTime({ ticks });
const SECOND = 120_000;

function makeTracks(): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main",
			name: "Main Track",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "a",
					name: "Arrival",
					type: "image",
					mediaId: "media-a",
					startTime: mt(0),
					duration: mt(2 * SECOND),
					trimStart: mt(0),
					trimEnd: mt(0),
					params: {},
				},
				{
					id: "b",
					name: "Detail",
					type: "image",
					mediaId: "media-b",
					startTime: mt(2 * SECOND),
					duration: mt(2 * SECOND),
					trimStart: mt(0),
					trimEnd: mt(0),
					params: {},
				},
				{
					id: "c",
					name: "Reaction",
					type: "image",
					mediaId: "media-c",
					startTime: mt(4 * SECOND),
					duration: mt(2 * SECOND),
					trimStart: mt(0),
					trimEnd: mt(0),
					params: {},
				},
			],
		},
		audio: [],
	};
}

describe("direct manipulation feedback", () => {
	test("describes a valid snapped move before commit", () => {
		const result: GroupMoveResult = {
			moves: [
				{
					sourceTrackId: "main",
					targetTrackId: "main",
					elementId: "a",
					newStartTime: mt(2 * SECOND),
				},
			],
			createTracks: [],
			targetSelection: [{ trackId: "main", elementId: "a" }],
		};

		expect(
			buildMoveFeedback({
				anchorTime: mt(2 * SECOND),
				elementCount: 1,
				result,
				tracks: makeTracks(),
				snapPoint: {
					time: mt(2 * SECOND),
					type: "element-start",
					elementId: "b",
					trackId: "main",
				},
			}),
		).toMatchObject({
			kind: "move",
			tone: "positive",
			title: "Move 1 clip · 00:02.00",
			detail: "Main Track · Snapped to clip start",
		});
	});

	test("explains automatic track creation and invalid drops", () => {
		expect(
			buildMoveFeedback({
				anchorTime: mt(SECOND),
				elementCount: 2,
				result: {
					moves: [],
					createTracks: [{ id: "new", type: "video", index: 0 }],
					targetSelection: [],
				},
				tracks: makeTracks(),
				snapPoint: null,
			}),
		).toMatchObject({
			tone: "warning",
			detail: "Creates 1 compatible track to avoid an overlap",
		});

		expect(
			buildMoveFeedback({
				anchorTime: mt(SECOND),
				elementCount: 1,
				result: null,
				tracks: makeTracks(),
				snapPoint: null,
			}),
		).toMatchObject({
			tone: "negative",
			title: "Cannot place clip",
			detail: "Release cancels this move",
		});
	});

	test("previews the same downstream ripple shift that commit will apply", () => {
		const updates: GroupResizeUpdate[] = [
			{
				trackId: "main",
				elementId: "a",
				patch: {
					startTime: mt(0),
					duration: mt(SECOND),
					trimStart: mt(0),
					trimEnd: mt(SECOND),
				},
			},
		];

		expect(
			buildRippleResizePreview({
				tracks: makeTracks(),
				updates,
			}),
		).toEqual({
			updates: [
				...updates,
				{
					trackId: "main",
					elementId: "b",
					patch: { startTime: mt(SECOND) },
				},
				{
					trackId: "main",
					elementId: "c",
					patch: { startTime: mt(3 * SECOND) },
				},
			],
			shiftedElementCount: 2,
			totalShift: mt(SECOND),
		});
	});

	test("reports trim constraints, snapping, and ripple consequences", () => {
		const result: GroupResizeResult = {
			deltaTime: mt(-SECOND),
			updates: [],
		};
		expect(
			buildResizeFeedback({
				mode: "ripple",
				side: "right",
				requestedDeltaTime: mt(-2 * SECOND),
				result,
				snapPoint: null,
				rippleShiftedElementCount: 2,
			}),
		).toMatchObject({
			kind: "trim",
			tone: "warning",
			title: "Ripple right edge · −00:01.00",
			detail:
				"Limited by source or neighbour · Ripple shifts 2 following clips",
		});

		expect(
			buildResizeFeedback({
				mode: "standard",
				side: "left",
				requestedDeltaTime: mt(SECOND),
				result: { ...result, deltaTime: mt(SECOND) },
				snapPoint: { time: mt(SECOND), type: "playhead" },
				rippleShiftedElementCount: 0,
			}),
		).toMatchObject({
			tone: "positive",
			detail: "Snapped to playhead",
		});
	});
});
