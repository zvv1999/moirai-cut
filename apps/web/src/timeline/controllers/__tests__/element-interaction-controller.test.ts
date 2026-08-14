import { describe, expect, test } from "bun:test";
import { resolveAppliedGroupMovePreview } from "@/timeline/controllers/element-interaction-controller";
import type { GroupMoveResult, MoveGroup } from "@/timeline/group-move";
import type { SnapPoint } from "@/timeline/snapping";
import { mediaTime } from "@/wasm";

describe("element drag preview", () => {
	test("uses the clamped anchor and clears a snap point the move cannot reach", () => {
		const anchor: MoveGroup["anchor"] = {
			trackId: "main",
			elementId: "anchor",
			elementType: "video",
			duration: mediaTime({ ticks: 120_000 }),
			timeOffset: mediaTime({ ticks: 0 }),
			trackSection: "main",
			sectionIndex: 0,
			displayIndex: 0,
		};
		const group: MoveGroup = { anchor, members: [anchor] };
		const result: GroupMoveResult = {
			moves: [
				{
					sourceTrackId: "main",
					targetTrackId: "main",
					elementId: "anchor",
					newStartTime: mediaTime({ ticks: 120_000 }),
				},
			],
			createTracks: [],
			targetSelection: [{ trackId: "main", elementId: "anchor" }],
		};
		const snapPoint: SnapPoint = {
			time: mediaTime({ ticks: 100_000 }),
			type: "bookmark",
		};

		expect(
			resolveAppliedGroupMovePreview({
				group,
				result,
				candidateAnchorStartTime: mediaTime({ ticks: 100_000 }),
				snapPoint,
			}),
		).toEqual({
			anchorStartTime: mediaTime({ ticks: 120_000 }),
			snapPoint: null,
		});
	});
});
