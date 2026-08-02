import { describe, expect, test } from "bun:test";
import {
	compareProjectRevisions,
	decideProjectVersion,
	hasVersionableProjectChanges,
	summarizeProjectRevision,
} from "@/project/revision-diff";

function project({
	revision,
	elements,
}: {
	revision: number;
	elements: Array<Record<string, unknown>>;
}) {
	return {
		revision,
		metadata: {
			id: "project-1",
			name: "Cut",
			updatedAt: `2026-07-28T00:00:0${revision}.000Z`,
			duration: 1_200_000,
		},
		currentSceneId: "scene-1",
		settings: {
			canvasSize: { width: 1920, height: 1080 },
			fps: { numerator: 30, denominator: 1 },
		},
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				tracks: {
					overlay: [],
					main: {
						id: "main",
						name: "Main",
						type: "video",
						elements,
					},
					audio: [],
				},
				bookmarks: [],
			},
		],
	};
}

const before = project({
	revision: 4,
	elements: [
		{
			id: "clip-a",
			name: "Arrival",
			type: "video",
			startTime: 0,
			duration: 240_000,
		},
		{
			id: "clip-b",
			name: "Bottle",
			type: "image",
			startTime: 240_000,
			duration: 180_000,
		},
	],
});

describe("project revision diffs", () => {
	test("does not create versions for autosaved view state and generated metadata", () => {
		const current = {
			...before,
			revision: 91,
			metadata: {
				...before.metadata,
				thumbnail: "data:image/png;base64,old",
				updatedAt: "2026-08-01T15:00:00.000Z",
			},
			timelineViewState: {
				zoomLevel: 3.65,
				scrollLeft: 8_031,
				playheadTime: 5_752_000,
			},
		};
		const autosave = {
			...current,
			revision: 4,
			metadata: {
				...current.metadata,
				thumbnail: "data:image/png;base64,new",
				updatedAt: "2026-08-01T15:01:00.000Z",
			},
			timelineViewState: {
				zoomLevel: 3.65,
				scrollLeft: 8_700.5,
				playheadTime: 6_192_000,
			},
		};

		expect(
			hasVersionableProjectChanges({ current, incoming: autosave }),
		).toBe(false);
		expect(decideProjectVersion({ current, incoming: autosave })).toEqual({
			revision: 91,
			versionCreated: false,
		});
	});

	test("creates a version when editorial content or project settings change", () => {
		const current = { ...before, revision: 91 };
		const changedClip = structuredClone(current);
		changedClip.scenes[0].tracks.main.elements[0].duration = 120_000;
		const changedSettings = structuredClone(current);
		changedSettings.settings.canvasSize.width = 1080;

		expect(
			hasVersionableProjectChanges({ current, incoming: changedClip }),
		).toBe(true);
		expect(
			hasVersionableProjectChanges({ current, incoming: changedSettings }),
		).toBe(true);
		expect(decideProjectVersion({ current, incoming: changedClip })).toEqual({
			revision: 92,
			versionCreated: true,
		});
	});

	test("creates revision one for the first persisted document", () => {
		expect(decideProjectVersion({ current: null, incoming: before })).toEqual({
			revision: 1,
			versionCreated: true,
		});
	});

	test("summarizes timeline structure without copying media payloads", () => {
		expect(summarizeProjectRevision({ document: before })).toEqual({
			revision: 4,
			sceneCount: 1,
			trackCount: 1,
			elementCount: 2,
			durationTicks: 1_200_000,
		});
	});

	test("ignores revision and timestamp-only changes", () => {
		expect(
			compareProjectRevisions({
				current: project({ revision: 5, elements: before.scenes[0].tracks.main.elements }),
				target: before,
			}),
		).toMatchObject({
			summary: {
				added: 0,
				removed: 0,
				moved: 0,
				renamed: 0,
				changed: 0,
			},
			changes: [],
		});
	});

	test("reports added, removed, moved, renamed, and property changes by stable id", () => {
		const current = project({
			revision: 8,
			elements: [
				{
					id: "clip-a",
					name: "Arrival tighter",
					type: "video",
					startTime: 120_000,
					duration: 120_000,
				},
				{
					id: "clip-c",
					name: "Hands",
					type: "image",
					startTime: 240_000,
					duration: 180_000,
				},
			],
		});
		const result = compareProjectRevisions({ current, target: before });

		expect(result.summary).toEqual({
			added: 1,
			removed: 1,
			moved: 1,
			renamed: 1,
			changed: 1,
		});
		expect(result.changes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "added", elementId: "clip-b" }),
				expect.objectContaining({ kind: "removed", elementId: "clip-c" }),
				expect.objectContaining({ kind: "moved", elementId: "clip-a" }),
				expect.objectContaining({ kind: "renamed", elementId: "clip-a" }),
				expect.objectContaining({ kind: "changed", elementId: "clip-a" }),
			]),
		);
	});

	test("labels the comparison direction as current to selected snapshot", () => {
		expect(compareProjectRevisions({ current: project({ revision: 9, elements: [] }), target: before }))
			.toMatchObject({
				fromRevision: 9,
				toRevision: 4,
			});
	});
});
