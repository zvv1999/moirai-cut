import { describe, expect, test } from "bun:test";
import { runProjectHealthCheck } from "@/project/project-health";
import { TICKS_PER_SECOND } from "@/wasm";

const S = TICKS_PER_SECOND;

describe("project health checks", () => {
	test("finds structural, media, audio, caption, and export hazards with addresses", () => {
		const result = runProjectHealthCheck({
			project: {
				canvasSize: { width: 1920, height: 1080 },
				tracks: [
					{
						id: "main",
						name: "Main",
						type: "video",
						role: "main",
						elements: [
							{
								id: "clip-a",
								name: "Opening",
								type: "video",
								startTime: 0,
								duration: S / 4,
								mediaId: "missing-video",
								trimStart: 0,
								params: {},
							},
							{
								id: "clip-b",
								name: "Overrun",
								type: "video",
								startTime: S,
								duration: S * 2,
								mediaId: "short-video",
								trimStart: S,
								params: {},
							},
						],
					},
					{
						id: "captions",
						name: "Captions",
						type: "text",
						hidden: true,
						elements: [
							{
								id: "caption-1",
								name: "Caption 1",
								type: "text",
								startTime: 0,
								duration: S / 4,
								trimStart: 0,
								params: {
									content:
										"This caption line is deliberately much longer than forty two characters",
									"caption.enabled": true,
									"transform.positionY": 900,
								},
							},
						],
					},
					{
						id: "music",
						name: "Music",
						type: "audio",
						muted: true,
						elements: [
							{
								id: "audio-1",
								name: "Hot mix",
								type: "audio",
								startTime: 0,
								duration: S * 3,
								mediaId: "music",
								trimStart: 0,
								params: { volume: 4 },
							},
						],
					},
				],
			},
			media: [
				{ id: "short-video", durationSeconds: 1.5 },
				{ id: "music", durationSeconds: 60 },
			],
		});

		expect(new Set(result.findings.map((finding) => finding.code))).toEqual(
			new Set([
				"sliver_clip",
				"missing_media",
				"main_track_gap",
				"trim_past_source",
				"hidden_with_content",
				"muted_with_content",
				"audio_headroom",
				"caption_line_length",
				"caption_unsafe_placement",
			]),
		);
		expect(
			result.findings.every(
				(finding) =>
					finding.trackId !== undefined ||
					finding.atSeconds !== undefined ||
					finding.severity === "note",
			),
		).toBe(true);
		expect(result.counts.error).toBe(2);
		expect(result.exportReady).toBe(false);
	});

	test("keeps a healthy project export-ready", () => {
		const result = runProjectHealthCheck({
			project: {
				canvasSize: { width: 1080, height: 1920 },
				tracks: [
					{
						id: "main",
						name: "Main",
						type: "video",
						role: "main",
						elements: [
							{
								id: "clip",
								name: "Full shot",
								type: "video",
								startTime: 0,
								duration: S * 2,
								mediaId: "video",
								trimStart: 0,
								params: {},
							},
						],
					},
				],
			},
			media: [{ id: "video", durationSeconds: 5 }],
		});

		expect(result.findings).toEqual([]);
		expect(result.exportReady).toBe(true);
	});
});
