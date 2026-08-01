import { describe, expect, test } from "bun:test";
import {
	buildComponentExportPlan,
	buildExportEstimate,
	buildExportPreflight,
	createExportDraftFromPreset,
	resolveExportRenderPlan,
	validateExportDraft,
	type ExportDraft,
} from "@/export/workflow";
import { ExportQueue } from "@/export/queue";
import { ExportHistoryStore } from "@/export/history";

const SOURCE = {
	width: 2560,
	height: 1440,
	fps: { numerator: 30, denominator: 1 },
};

describe("advanced export workflow", () => {
	test("platform presets cover source, horizontal, vertical, square, and delivery starts without locking edits", () => {
		const source = createExportDraftFromPreset({
			presetId: "source",
			source: SOURCE,
		});
		const vertical = createExportDraftFromPreset({
			presetId: "vertical-social",
			source: SOURCE,
		});

		expect(source).toMatchObject({
			width: 2560,
			height: 1440,
			fps: SOURCE.fps,
		});
		expect(vertical).toMatchObject({
			width: 1080,
			height: 1920,
			format: "mp4",
			videoCodec: "avc",
		});
		vertical.width = 720;
		expect(
			createExportDraftFromPreset({
				presetId: "vertical-social",
				source: SOURCE,
			}).width,
		).toBe(1080);
	});

	test("advanced encoding validation names container, codec, alpha, and hardware failures", () => {
		const draft: ExportDraft = {
			...createExportDraftFromPreset({
				presetId: "transparent-webm",
				source: SOURCE,
			}),
			format: "mp4",
			videoCodec: "vp9",
			audioCodec: "opus",
		};
		const issues = validateExportDraft({
			draft,
			capabilities: {
				videoCodecSupported: false,
				audioCodecSupported: true,
				hardwareAccelerationAvailable: false,
			},
		});

		expect(issues.map((issue) => issue.code)).toEqual([
			"container_video_codec",
			"container_audio_codec",
			"alpha_container",
			"video_codec_unavailable",
			"hardware_unavailable",
		]);
	});

	test("falls back from unavailable browser AVC to a VP9 intermediate and FFmpeg H.264 delivery", () => {
		const draft = createExportDraftFromPreset({
			presetId: "source",
			source: { width: 1080, height: 1440, fps: SOURCE.fps },
		});
		const plan = resolveExportRenderPlan({
			draft,
			requestedDelivery: "browser",
			directCapabilities: {
				videoCodecSupported: false,
				audioCodecSupported: true,
				hardwareAccelerationAvailable: false,
			},
			fallbackCapabilities: {
				videoCodecSupported: true,
				audioCodecSupported: true,
				hardwareAccelerationAvailable: false,
			},
		});

		expect(plan).toMatchObject({
			delivery: "h264-mp4",
			usesFfmpegFallback: true,
			renderDraft: {
				format: "webm",
				videoCodec: "vp9",
				audioCodec: "opus",
				width: 1080,
				height: 1440,
				fps: SOURCE.fps,
			},
		});
	});

	test("keeps browser MP4 when AVC is available and fails closed when VP9 is also unavailable", () => {
		const draft = createExportDraftFromPreset({
			presetId: "source",
			source: SOURCE,
		});
		const supported = {
			videoCodecSupported: true,
			audioCodecSupported: true,
			hardwareAccelerationAvailable: true,
		};

		expect(
			resolveExportRenderPlan({
				draft,
				requestedDelivery: "browser",
				directCapabilities: supported,
			}),
		).toMatchObject({
			delivery: "browser",
			usesFfmpegFallback: false,
			renderDraft: { format: "mp4", videoCodec: "avc" },
		});
		expect(
			resolveExportRenderPlan({
				draft,
				requestedDelivery: "browser",
				directCapabilities: {
					...supported,
					videoCodecSupported: false,
				},
				fallbackCapabilities: {
					...supported,
					videoCodecSupported: false,
				},
			}),
		).toMatchObject({
			delivery: "browser",
			usesFfmpegFallback: false,
			renderDraft: { format: "mp4", videoCodec: "avc" },
		});
	});

	test("size and render estimates are evidence-based and explicitly approximate", () => {
		const draft = createExportDraftFromPreset({
			presetId: "landscape-hd",
			source: SOURCE,
		});
		const estimate = buildExportEstimate({
			draft,
			durationSeconds: 120,
			hardwarePixelsPerSecond: 180_000_000,
		});

		expect(estimate.durationSeconds).toBe(120);
		expect(estimate.estimatedBytes).toBeGreaterThan(120_000_000);
		expect(estimate.estimatedRenderSeconds).toBeGreaterThan(1);
		expect(estimate.label).toContain("estimate");
		expect(
			validateExportDraft({
				draft: {
					...draft,
					range: { startSeconds: 119, endSeconds: 121 },
				},
				timelineDurationSeconds: 120,
			}).map((issue) => issue.code),
		).toContain("invalid_range");
	});

	test("preflight combines addressable health, render samples, and encoding checks", () => {
		const preflight = buildExportPreflight({
			health: {
				findings: [
					{
						id: "missing",
						code: "missing_media",
						severity: "error",
						message: "Missing source",
						trackId: "main",
						elementId: "clip-1",
						atSeconds: 3,
					},
				],
				counts: { error: 1, warning: 0, note: 0 },
				exportReady: false,
				timelineSeconds: 12,
			},
			renderSamples: [
				{ atSeconds: 0, success: true },
				{ atSeconds: 6, success: false, error: "Frame render failed" },
			],
			encodingIssues: [],
		});

		expect(preflight.ready).toBe(false);
		expect(preflight.findings.map((finding) => finding.atSeconds)).toEqual([
			3, 6,
		]);
	});

	test("component export plan includes stems, captions, stills, alpha, and a selected range", () => {
		const plan = buildComponentExportPlan({
			captionCount: 12,
			audioTracks: [
				{ id: "main", name: "Camera audio" },
				{ id: "music", name: "Music" },
			],
			range: { startSeconds: 4, endSeconds: 9 },
			alphaAvailable: true,
		});

		expect(plan.filter((item) => item.kind === "audio-stem")).toHaveLength(2);
		expect(new Set(plan.map((item) => item.kind))).toEqual(
			new Set([
				"audio-mix",
				"audio-stem",
				"captions",
				"still",
				"alpha-video",
				"range-video",
			]),
		);
		expect(plan.every((item) => item.available)).toBe(true);
	});

	test("batch queue keeps independent preset, range, version, failure, and retry state", () => {
		let nextId = 0;
		const queue = new ExportQueue({
			createId: () => `queue-${++nextId}`,
			now: () => "2026-07-28T00:00:00.000Z",
		});
		const first = queue.enqueue({
			label: "YouTube",
			options: createExportDraftFromPreset({
				presetId: "youtube-4k",
				source: SOURCE,
			}),
			projectRevision: 12,
		});
		const second = queue.enqueue({
			label: "Vertical selection",
			options: {
				...createExportDraftFromPreset({
					presetId: "vertical-social",
					source: SOURCE,
				}),
				range: { startSeconds: 5, endSeconds: 15 },
			},
			projectRevision: 12,
		});

		queue.start({ id: first.id });
		queue.complete({
			id: first.id,
			outputName: "youtube.mp4",
			sizeBytes: 100,
		});
		queue.start({ id: second.id });
		queue.fail({ id: second.id, error: "encoder unavailable" });
		queue.retry({ id: second.id });

		expect(queue.list()[0]).toMatchObject({
			status: "completed",
			outputName: "youtube.mp4",
		});
		expect(queue.list()[1]).toMatchObject({
			status: "pending",
			attempts: 2,
			projectRevision: 12,
			options: { range: { startSeconds: 5, endSeconds: 15 } },
		});
	});

	test("history preserves settings and reruns only metadata while hiding missing outputs", () => {
		let nextId = 0;
		const history = new ExportHistoryStore({
			createId: () => `history-${++nextId}`,
			now: () => "2026-07-28T00:00:00.000Z",
		});
		const entry = history.record({
			projectId: "project-1",
			projectRevision: 9,
			label: "Vertical social",
			options: createExportDraftFromPreset({
				presetId: "vertical-social",
				source: SOURCE,
			}),
			status: "completed",
			destinationName: "vertical.mp4",
			sizeBytes: 1234,
			error: null,
		});
		expect(entry.available).toBe(false);
		history.reconcileAvailability({
			availableNames: new Set(["vertical.mp4"]),
		});
		expect(history.list()[0]?.available).toBe(true);
		history.reconcileAvailability({
			availableNames: new Set<string>(),
		});

		expect(history.list()[0]).toMatchObject({
			id: entry.id,
			available: false,
			destinationName: "vertical.mp4",
		});
		expect(history.rerun({ id: entry.id })).toEqual({
			label: "Vertical social",
			options: entry.options,
		});
	});
});
