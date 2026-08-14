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
			title: "移动 1 个素材 · 00:02.00",
			detail: "Main Track · 吸附到素材起点",
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
			detail: "将新建 1 条兼容轨道以避免重叠",
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
			title: "无法放置素材",
			detail: "松开后取消本次移动",
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
			title: "联动修剪右边缘 · −00:01.00",
			detail: "受素材范围或相邻素材限制 · 联动移动后续 2 个素材",
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
			detail: "吸附到播放头",
		});
	});
});
