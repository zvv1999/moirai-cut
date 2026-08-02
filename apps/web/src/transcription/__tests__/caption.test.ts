import { describe, expect, test } from "bun:test";
import { buildCaptionChunks } from "@/transcription/caption";

describe("speaker-aware caption chunking", () => {
	test("preserves speaker and editable word timings through deterministic chunks", () => {
		const chunks = buildCaptionChunks({
			segments: [
				{
					text: "Welcome back everyone",
					start: 1,
					end: 2.5,
					speaker: "Host",
					words: [
						{ word: "Welcome", start: 1, end: 1.4 },
						{ word: "back", start: 1.4, end: 1.8 },
						{ word: "everyone", start: 1.8, end: 2.5 },
					],
				},
			],
			wordsPerChunk: 2,
		});

		expect(chunks).toEqual([
			{
				text: "Welcome back",
				startTime: 1,
				duration: 0.8,
				speaker: "Host",
				wordTimings: [
					{ word: "Welcome", start: 1, end: 1.4 },
					{ word: "back", start: 1.4, end: 1.8 },
				],
			},
			{
				text: "everyone",
				startTime: 1.8,
				duration: 0.7,
				speaker: "Host",
				wordTimings: [{ word: "everyone", start: 1.8, end: 2.5 }],
			},
		]);
	});
});
