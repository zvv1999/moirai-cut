import { describe, expect, test } from "bun:test";
import type { ProjectStateSummary } from "../agent-manager";
import {
	buildAgentContextSnapshot,
	buildElementContextReferences,
	buildMediaContextReferences,
	buildTimelineRangeReference,
	parseAgentContextUri,
	resolveAgentContextTarget,
	serializeAgentContext,
} from "../context-references";

const state = (): ProjectStateSummary => ({
	revision: 12,
	projectId: "project / reed",
	projectName: "Reed cut",
	sceneId: "scene/main",
	sceneName: "Main",
	fps: { numerator: 30, denominator: 1, decimal: 30 },
	scenes: [
		{ id: "scene/main", name: "Main", isMain: true, isActive: true },
	],
	bookmarks: [],
	settings: {
		canvasSize: { width: 1080, height: 1920 },
		background: "#000000",
	},
	loadedFileRevision: 12,
	media: [
		{
			id: "media/hero",
			name: "主角源素材.mov",
			type: "video",
			durationSeconds: 8,
		},
	],
	tracks: [
		{
			id: "video 1",
			type: "video",
			name: "主轨",
			elementCount: 3,
			elements: [
				{
					id: "clip/a",
					type: "video",
					name: "开场",
					startTimeSeconds: 0,
					durationSeconds: 4,
					endTimeSeconds: 4,
					trimStartSeconds: 0,
					trimEndSeconds: 0,
				},
				{
					id: "clip-b",
					type: "video",
					name: "调酒",
					startTimeSeconds: 5,
					durationSeconds: 3,
					endTimeSeconds: 8,
					trimStartSeconds: 0,
					trimEndSeconds: 0,
				},
				{
					id: "clip-c",
					type: "video",
					name: "结尾",
					startTimeSeconds: 10,
					durationSeconds: 2,
					endTimeSeconds: 12,
					trimStartSeconds: 0,
					trimEndSeconds: 0,
				},
			],
		},
		{
			id: "captions",
			type: "text",
			name: "字幕",
			elementCount: 1,
			elements: [
				{
					id: "caption-1",
					type: "text",
					name: "第一句",
					startTimeSeconds: 3.5,
					durationSeconds: 2,
					endTimeSeconds: 5.5,
					trimStartSeconds: 0,
					trimEndSeconds: 0,
				},
			],
		},
	],
});

describe("Codex context references", () => {
	test("builds stable, encoded element paths and ignores duplicate or stale selections", () => {
		const references = buildElementContextReferences({
			state: state(),
			selectedElements: [
				{ trackId: "video 1", elementId: "clip/a" },
				{ trackId: "video 1", elementId: "clip/a" },
				{ trackId: "missing", elementId: "stale" },
			],
		});

		expect(references).toHaveLength(1);
		expect(references[0]).toEqual(
			expect.objectContaining({
				kind: "element",
				label: "开场",
				trackId: "video 1",
				elementId: "clip/a",
				startSeconds: 0,
				endSeconds: 4,
				uri: "opencut://project/project%20%2F%20reed/scene/scene%2Fmain/track/video%201/element/clip%2Fa",
			}),
		);
	});

	test("a time-range path captures every intersecting element without pulling in later clips", () => {
		const reference = buildTimelineRangeReference({
			state: state(),
			startSeconds: 3,
			endSeconds: 6,
		});

		expect(reference.uri).toBe(
			"opencut://project/project%20%2F%20reed/scene/scene%2Fmain/timeline/range?start=3.000&end=6.000",
		);
		expect(reference.elements).toEqual([
			{ trackId: "video 1", elementId: "clip/a" },
			{ trackId: "video 1", elementId: "clip-b" },
			{ trackId: "captions", elementId: "caption-1" },
		]);
	});

	test("builds Codex paths for assets picked directly from the media library", () => {
		const references = buildMediaContextReferences({
			state: state(),
			mediaIds: ["media/hero", "missing", "media/hero"],
		});

		expect(references).toEqual([
			expect.objectContaining({
				kind: "media",
				mediaId: "media/hero",
				label: "主角源素材.mov",
				mediaType: "video",
				durationSeconds: 8,
				uri: "opencut://project/project%20%2F%20reed/scene/scene%2Fmain/media/media%2Fhero",
			}),
		]);
		expect(parseAgentContextUri(references[0].uri)).toEqual({
			kind: "media",
			projectId: "project / reed",
			sceneId: "scene/main",
			mediaId: "media/hero",
		});
		expect(
			serializeAgentContext({
				state: state(),
				references,
				playheadSeconds: 0,
			}),
		).toContain('<media path="');
	});

	test("serializes compact Codex-ready context instead of the whole project", () => {
		const project = state();
		const elements = buildElementContextReferences({
			state: project,
			selectedElements: [{ trackId: "video 1", elementId: "clip/a" }],
		});
		const range = buildTimelineRangeReference({
			state: project,
			startSeconds: 3,
			endSeconds: 6,
		});
		const context = serializeAgentContext({
			state: project,
			references: [...elements, range],
			playheadSeconds: 3.25,
		});

		expect(context).toContain("<opencut-context");
		expect(context).toContain('playhead="3.250s"');
		expect(context).toContain(elements[0].uri);
		expect(context).toContain(range.uri);
		expect(context).not.toContain("canvasSize");
		expect(context.length).toBeLessThan(1200);
	});

	test("parses a path and resolves it to an exact seek and selection target", () => {
		const project = state();
		const range = buildTimelineRangeReference({
			state: project,
			startSeconds: 3,
			endSeconds: 6,
		});

		expect(parseAgentContextUri(range.uri)).toEqual({
			kind: "range",
			projectId: "project / reed",
			sceneId: "scene/main",
			startSeconds: 3,
			endSeconds: 6,
		});
		expect(
			resolveAgentContextTarget({ state: project, uri: range.uri }),
		).toEqual({
			kind: "range",
			seekSeconds: 3,
			selectedElements: [
				{ trackId: "video 1", elementId: "clip/a" },
				{ trackId: "video 1", elementId: "clip-b" },
				{ trackId: "captions", elementId: "caption-1" },
			],
		});
	});

	test("snapshot prefers pinned references but still exposes the live selection", () => {
		const project = state();
		const pinned = buildTimelineRangeReference({
			state: project,
			startSeconds: 3,
			endSeconds: 6,
		});
		const snapshot = buildAgentContextSnapshot({
			state: project,
			pinnedReferences: [pinned],
			selectedElements: [{ trackId: "video 1", elementId: "clip-c" }],
			playheadSeconds: 10.5,
		});

		expect(snapshot.source).toBe("pinned");
		expect(snapshot.references).toEqual([pinned]);
		expect(snapshot.liveSelection[0]).toEqual(
			expect.objectContaining({ elementId: "clip-c" }),
		);
		expect(snapshot.promptContext).toContain(pinned.uri);
		expect(snapshot.promptContext).not.toContain(snapshot.liveSelection[0].uri);
	});

	test("rejects a path aimed at another project instead of revealing the wrong clip", () => {
		expect(() =>
			resolveAgentContextTarget({
				state: state(),
				uri: "opencut://project/other/scene/scene%2Fmain/track/video%201/element/clip%2Fa",
			}),
		).toThrow("另一个工程");
	});
});
