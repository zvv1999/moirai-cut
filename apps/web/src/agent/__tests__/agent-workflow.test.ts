import { describe, expect, test } from "bun:test";
import type { ProjectHealthResult } from "@/project/project-health";
import {
	buildAgentQcSummary,
	buildChangeReview,
	compileSemanticEdit,
	type SemanticEditContext,
} from "../workflow";

const context = ({
	selected = [],
}: {
	selected?: Array<{ trackId: string; elementId: string }>;
} = {}): SemanticEditContext => ({
	state: {
		revision: 8,
		projectId: "project-1",
		projectName: "Demo",
		sceneId: "scene-1",
		sceneName: "Main",
		fps: { numerator: 30, denominator: 1, decimal: 30 },
		scenes: [{ id: "scene-1", name: "Main", isMain: true, isActive: true }],
		bookmarks: [],
		settings: {
			canvasSize: { width: 1920, height: 1080 },
			background: "#000000",
		},
		loadedFileRevision: 8,
		media: [],
		tracks: [
			{
				id: "main",
				type: "video",
				name: "Main",
				elementCount: 2,
				elements: [
					{
						id: "clip-a",
						type: "video",
						name: "Opening",
						startTimeSeconds: 0,
						durationSeconds: 4,
						endTimeSeconds: 4,
						trimStartSeconds: 0,
						trimEndSeconds: 0,
						params: {},
					},
					{
						id: "clip-b",
						type: "video",
						name: "Reaction",
						startTimeSeconds: 6,
						durationSeconds: 2,
						endTimeSeconds: 8,
						trimStartSeconds: 0,
						trimEndSeconds: 0,
						params: {},
					},
				],
			},
			{
				id: "captions",
				type: "text",
				name: "Captions",
				elementCount: 2,
				elements: [
					{
						id: "caption-a",
						type: "text",
						name: "Caption 1",
						startTimeSeconds: 0,
						durationSeconds: 2,
						endTimeSeconds: 2,
						trimStartSeconds: 0,
						trimEndSeconds: 0,
						params: {
							content: "First",
							"caption.enabled": true,
							fontFamily: "Inter",
							fontSize: 64,
							color: "#ffffff",
							"transform.positionY": 420,
						},
					},
					{
						id: "caption-b",
						type: "text",
						name: "Caption 2",
						startTimeSeconds: 2,
						durationSeconds: 2,
						endTimeSeconds: 4,
						trimStartSeconds: 0,
						trimEndSeconds: 0,
						params: {
							content: "Second",
							"caption.enabled": true,
							fontFamily: "Arial",
							fontSize: 48,
							color: "#ff0000",
							"transform.positionY": 360,
						},
					},
				],
			},
		],
	},
	selectedElements: selected,
});

describe("semantic edit planning", () => {
	test("tighten this section compiles selected clips into ordered, reversible moves", () => {
		const plan = compileSemanticEdit({
			request: "tighten this section",
			context: context({
				selected: [
					{ trackId: "main", elementId: "clip-a" },
					{ trackId: "main", elementId: "clip-b" },
				],
			}),
		});

		expect(plan.valid).toBe(true);
		expect(plan.baseRevision).toBe(8);
		expect(plan.assumptions).toContain(
			"Preserve clip order and remove only gaps inside each selected track.",
		);
		expect(plan.groups).toHaveLength(1);
		expect(plan.groups[0].operation).toEqual({
			type: "element.move",
			moves: [
				{
					trackId: "main",
					elementId: "clip-b",
					startTimeSeconds: 4,
				},
			],
		});
		expect(plan.groups[0].inverseOperation).toEqual({
			type: "element.move",
			moves: [
				{
					trackId: "main",
					elementId: "clip-b",
					startTimeSeconds: 6,
				},
			],
		});
		expect(plan.groups[0].affectedRange).toEqual({
			startSeconds: 4,
			endSeconds: 8,
		});
		expect(plan.expectedOutput).toContain("2.00s");
	});

	test("unify captions copies visual style without replacing caption text", () => {
		const plan = compileSemanticEdit({
			request: "unify captions",
			context: context(),
		});

		expect(plan.valid).toBe(true);
		expect(plan.groups).toHaveLength(1);
		expect(plan.groups[0].properties).toEqual([
			"fontFamily",
			"fontSize",
			"color",
			"transform.positionY",
		]);
		expect(plan.groups[0].operation).toEqual({
			type: "element.setParams",
			trackId: "captions",
			elementId: "caption-b",
			params: {
				fontFamily: "Inter",
				fontSize: 64,
				color: "#ffffff",
				"transform.positionY": 420,
			},
		});
		const operation = plan.groups[0].operation;
		if (operation.type !== "element.setParams") {
			throw new Error(`Unexpected operation ${operation.type}`);
		}
		expect(operation.params.content).toBeUndefined();
	});

	test("ambiguous requests fail closed before mutation", () => {
		const plan = compileSemanticEdit({
			request: "make it better",
			context: context(),
		});

		expect(plan.valid).toBe(false);
		expect(plan.groups).toEqual([]);
		expect(plan.errors[0]).toContain("Supported requests");
	});

	test("tighten refuses to overlap an unselected clip inside the apparent gap", () => {
		const withBlockingClip = context({
			selected: [
				{ trackId: "main", elementId: "clip-a" },
				{ trackId: "main", elementId: "clip-b" },
			],
		});
		withBlockingClip.state.tracks[0].elements.splice(1, 0, {
			id: "clip-unselected",
			type: "video",
			name: "Keep me",
			startTimeSeconds: 4,
			durationSeconds: 2,
			endTimeSeconds: 6,
			trimStartSeconds: 0,
			trimEndSeconds: 0,
			params: {},
		});
		withBlockingClip.state.tracks[0].elementCount = 3;

		const plan = compileSemanticEdit({
			request: "tighten this section",
			context: withBlockingClip,
		});
		expect(plan.valid).toBe(false);
		expect(plan.errors[0]).toContain("unselected clip Keep me");
	});
});

describe("change review", () => {
	test("reports every requested target and detects partial/no-effect groups", () => {
		const selectedElements = [
			{ trackId: "main", elementId: "clip-a" },
			{ trackId: "main", elementId: "clip-b" },
		];
		const before = context({ selected: selectedElements }).state;
		const plan = compileSemanticEdit({
			request: "tighten this section",
			context: { state: before, selectedElements },
		});
		const after = structuredClone(before);
		const moved = after.tracks[0].elements.find(
			(element) => element.id === "clip-b",
		);
		if (!moved) throw new Error("fixture");
		moved.startTimeSeconds = 4;
		moved.endTimeSeconds = 6;

		const review = buildChangeReview({ plan, before, after });
		expect(review.complete).toBe(true);
		expect(review.groups[0].effect).toBe("changed");
		expect(review.groups[0].changes).toEqual([
			expect.objectContaining({
				elementId: "clip-b",
				property: "startTimeSeconds",
				before: 6,
				after: 4,
			}),
		]);

		const noEffect = buildChangeReview({ plan, before, after: before });
		expect(noEffect.complete).toBe(false);
		expect(noEffect.groups[0].effect).toBe("no-effect");
	});
});

describe("agent preflight and visual QC", () => {
	test("combines structural, frame, audio, and export evidence into an addressable correction pass", () => {
		const health: ProjectHealthResult = {
			exportReady: false,
			timelineSeconds: 8,
			counts: { error: 1, warning: 1, note: 0 },
			findings: [
				{
					id: "missing:clip-b",
					code: "missing_media",
					severity: "error",
					message: "Reaction is offline.",
					trackId: "main",
					elementId: "clip-b",
					atSeconds: 6,
				},
			],
		};
		const summary = buildAgentQcSummary({
			revision: 8,
			health,
			render: {
				revision: 8,
				stable: true,
				frames: [
					{
						atSeconds: 0,
						renderedAtSeconds: 0,
						width: 320,
						height: 180,
						jpegBase64: "image",
						tile: {
							columns: 1,
							rows: 1,
							cells: [{ cell: "r1c1", atSeconds: 0, renderedAtSeconds: 0 }],
						},
					},
					{ atSeconds: 6, error: "offline media" },
				],
			},
			audio: {
				checkedElements: 2,
				hotElements: [{ trackId: "music", elementId: "song", gainDb: 3 }],
				mutedTracksWithContent: [],
			},
			exportVerification: {
				ready: false,
				findings: [
					{
						id: "encoding:video_codec_unavailable",
						source: "encoding",
						severity: "error",
						message: "Video encoder unavailable.",
					},
				],
				checkedSamples: 2,
			},
		});

		expect(summary.ready).toBe(false);
		expect(summary.checks.map((check) => check.id)).toEqual([
			"structural",
			"visual",
			"audio",
			"export",
		]);
		expect(summary.correctionPass).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: "structural",
					trackId: "main",
					elementId: "clip-b",
					atSeconds: 6,
				}),
				expect.objectContaining({
					source: "visual",
					atSeconds: 6,
				}),
				expect.objectContaining({
					source: "audio",
					elementId: "song",
				}),
			]),
		);
	});
});
