import { describe, expect, test } from "bun:test";
import type { Bookmark, SceneTracks } from "@/timeline";
import { getBookmarkSnapPoints } from "@/timeline/bookmarks";
import { snapGroupEdges, type MoveGroup } from "@/timeline/group-move";
import {
	ResizeController,
	type ResizeConfig,
} from "@/timeline/controllers/resize-controller";
import type { GroupResizeMember } from "@/timeline/group-resize";
import type { SnapPoint } from "@/timeline/snapping";
import { mediaTime, type MediaTime } from "@/wasm";

const tracks: SceneTracks = {
	overlay: [],
	main: {
		id: "main",
		name: "Main",
		type: "video",
		elements: [],
		muted: false,
		hidden: false,
	},
	audio: [],
};

const bookmarks: Bookmark[] = [
	{
		id: "bookmark-2s",
		time: mediaTime({ ticks: 240_000 }),
		name: "Beat",
	},
];

describe("bookmark snapping during direct edits", () => {
	test("excludes only clip markers owned by the active edit selection", () => {
		const snapPoints = getBookmarkSnapPoints({
			bookmarks: [
				{
					id: "own-clip",
					time: mediaTime({ ticks: 10 }),
					scope: "clip",
					elementId: "moving",
				},
				{
					id: "same-id-timeline",
					time: mediaTime({ ticks: 20 }),
					scope: "timeline",
					elementId: "moving",
				},
				{
					id: "other-clip",
					time: mediaTime({ ticks: 30 }),
					scope: "clip",
					elementId: "other",
				},
				{ id: "legacy", time: mediaTime({ ticks: 40 }) },
			],
			excludeClipElementIds: new Set(["moving"]),
		});

		expect(snapPoints.map(({ time }) => time)).toEqual([20, 30, 40]);
	});

	test("snaps a moved group edge to an active-scene bookmark", () => {
		const member: MoveGroup["members"][number] = {
			trackId: "main",
			elementId: "moving",
			elementType: "video",
			duration: mediaTime({ ticks: 120_000 }),
			timeOffset: mediaTime({ ticks: 0 }),
			trackSection: "main",
			sectionIndex: 0,
			displayIndex: 0,
		};
		const group: MoveGroup = { anchor: member, members: [member] };
		const args = {
			group,
			anchorStartTime: mediaTime({ ticks: 119_000 }),
			tracks,
			bookmarks,
			playheadTime: mediaTime({ ticks: 900_000 }),
			zoomLevel: 1,
		};

		const result = snapGroupEdges(args);

		expect(result.snappedAnchorStartTime).toBe(mediaTime({ ticks: 120_000 }));
		expect(result.snapPoint).toEqual({
			time: mediaTime({ ticks: 240_000 }),
			type: "bookmark",
		});
	});

	test("does not snap a moved clip back to its own clip marker", () => {
		const member: MoveGroup["members"][number] = {
			trackId: "main",
			elementId: "moving",
			elementType: "video",
			duration: mediaTime({ ticks: 120_000 }),
			timeOffset: mediaTime({ ticks: 0 }),
			trackSection: "main",
			sectionIndex: 0,
			displayIndex: 0,
		};
		const result = snapGroupEdges({
			group: { anchor: member, members: [member] },
			anchorStartTime: mediaTime({ ticks: 2_400 }),
			tracks,
			bookmarks: [
				{
					id: "moving-marker",
					time: mediaTime({ ticks: 0 }),
					scope: "clip",
					elementId: "moving",
				},
			],
			playheadTime: mediaTime({ ticks: 900_000 }),
			zoomLevel: 1,
		});

		expect(result).toEqual({
			snappedAnchorStartTime: mediaTime({ ticks: 2_400 }),
			snapPoint: null,
		});
	});

	test("snaps a resized edge to an active-scene bookmark", () => {
		const snapState: { current: SnapPoint | null } = { current: null };
		const config: ResizeConfig = {
			zoomLevel: 1,
			snappingEnabled: true,
			isShiftHeld: () => false,
			getSceneTracks: () => tracks,
			getSceneBookmarks: () => bookmarks,
			getCurrentPlayheadTime: () => mediaTime({ ticks: 900_000 }),
			getActiveProjectFps: () => ({ numerator: 30, denominator: 1 }),
			getTrimMode: () => "standard",
			selectedElements: [],
			discardPreview: () => {},
			previewElements: () => {},
			commitElements: () => {},
			onSnapPointChange: (snapPoint) => {
				snapState.current = snapPoint;
			},
		};
		const controller = new ResizeController({
			configRef: { current: config },
		});
		const member: GroupResizeMember = {
			trackId: "main",
			elementId: "resizing",
			startTime: mediaTime({ ticks: 0 }),
			duration: mediaTime({ ticks: 120_000 }),
			trimStart: mediaTime({ ticks: 0 }),
			trimEnd: mediaTime({ ticks: 240_000 }),
			sourceDuration: mediaTime({ ticks: 360_000 }),
			leftNeighborBound: null,
			rightNeighborBound: null,
		};
		const session = {
			side: "right" as const,
			members: [member],
			snapPoint: null as SnapPoint | null,
		};
		const resizeController = controller as unknown as {
			snappedDelta: (args: {
				session: typeof session;
				rawDeltaTime: MediaTime;
			}) => MediaTime;
		};

		const delta = resizeController.snappedDelta({
			session,
			rawDeltaTime: mediaTime({ ticks: 119_000 }),
		});

		expect(delta).toBe(mediaTime({ ticks: 120_000 }));
		expect(snapState.current).toEqual({
			time: mediaTime({ ticks: 240_000 }),
			type: "bookmark",
		});
	});

	test("does not snap a trimmed clip back to its own clip marker", () => {
		const snapState: { current: SnapPoint | null } = { current: null };
		const config: ResizeConfig = {
			zoomLevel: 1,
			snappingEnabled: true,
			isShiftHeld: () => false,
			getSceneTracks: () => tracks,
			getSceneBookmarks: () => [
				{
					id: "resizing-marker",
					time: mediaTime({ ticks: 0 }),
					scope: "clip",
					elementId: "resizing",
				},
			],
			getCurrentPlayheadTime: () => mediaTime({ ticks: 900_000 }),
			getActiveProjectFps: () => ({ numerator: 30, denominator: 1 }),
			getTrimMode: () => "standard",
			selectedElements: [],
			discardPreview: () => {},
			previewElements: () => {},
			commitElements: () => {},
			onSnapPointChange: (snapPoint) => {
				snapState.current = snapPoint;
			},
		};
		const controller = new ResizeController({ configRef: { current: config } });
		const session = {
			side: "left" as const,
			members: [
				{
					trackId: "main",
					elementId: "resizing",
					startTime: mediaTime({ ticks: 0 }),
					duration: mediaTime({ ticks: 120_000 }),
					trimStart: mediaTime({ ticks: 0 }),
					trimEnd: mediaTime({ ticks: 240_000 }),
					sourceDuration: mediaTime({ ticks: 360_000 }),
					leftNeighborBound: null,
					rightNeighborBound: null,
				},
			],
			snapPoint: null as SnapPoint | null,
		};
		const resizeController = controller as unknown as {
			snappedDelta: (args: {
				session: typeof session;
				rawDeltaTime: MediaTime;
			}) => MediaTime;
		};

		expect(
			resizeController.snappedDelta({
				session,
				rawDeltaTime: mediaTime({ ticks: 2_400 }),
			}),
		).toBe(mediaTime({ ticks: 2_400 }));
		expect(snapState.current).toBeNull();
	});

	test("clears the controller snap guide when source bounds change the applied resize", () => {
		const snapEvents: Array<SnapPoint | null> = [];
		const config: ResizeConfig = {
			zoomLevel: 1,
			snappingEnabled: true,
			isShiftHeld: () => false,
			getSceneTracks: () => tracks,
			getSceneBookmarks: () => bookmarks,
			getCurrentPlayheadTime: () => mediaTime({ ticks: 900_000 }),
			getActiveProjectFps: () => ({ numerator: 30, denominator: 1 }),
			getTrimMode: () => "standard",
			selectedElements: [],
			discardPreview: () => {},
			previewElements: () => {},
			commitElements: () => {},
			onSnapPointChange: (snapPoint) => snapEvents.push(snapPoint),
		};
		const controller = new ResizeController({ configRef: { current: config } });
		const member: GroupResizeMember = {
			trackId: "main",
			elementId: "resizing",
			startTime: mediaTime({ ticks: 0 }),
			duration: mediaTime({ ticks: 120_000 }),
			trimStart: mediaTime({ ticks: 0 }),
			trimEnd: mediaTime({ ticks: 80_000 }),
			sourceDuration: mediaTime({ ticks: 200_000 }),
			leftNeighborBound: null,
			rightNeighborBound: null,
		};
		const resizeController = controller as unknown as {
			session: {
				kind: "active";
				side: "right";
				startX: number;
				fps: { numerator: number; denominator: number };
				mode: "standard";
				trackId: string;
				elementId: string;
				members: GroupResizeMember[];
				result: null;
				requestedDeltaTime: MediaTime;
				snapPoint: SnapPoint | null;
				rippleShiftedElementCount: number;
			};
			handleMouseMove: (event: { clientX: number }) => void;
		};
		resizeController.session = {
			kind: "active",
			side: "right",
			startX: 0,
			fps: { numerator: 30, denominator: 1 },
			mode: "standard",
			trackId: "main",
			elementId: "resizing",
			members: [member],
			result: null,
			requestedDeltaTime: mediaTime({ ticks: 0 }),
			snapPoint: null,
			rippleShiftedElementCount: 0,
		};

		// 50px requests +120,000 ticks and hits the 240,000 bookmark, but the
		// source has only 80,000 ticks left to reveal.
		resizeController.handleMouseMove({ clientX: 50 });

		expect(snapEvents).toEqual([
			{ time: mediaTime({ ticks: 240_000 }), type: "bookmark" },
			null,
		]);
		expect(controller.view).toMatchObject({
			kind: "resizing",
			feedback: {
				detail: "受素材范围或相邻素材限制",
			},
		});
	});
});
