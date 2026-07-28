import { describe, expect, test } from "bun:test";
import { parseSubtitleFile } from "@/subtitles/parse";
import { serializeSubtitles } from "@/subtitles/interchange";
import type { SubtitleCue } from "@/subtitles/types";

const cues: SubtitleCue[] = [
	{
		text: "Welcome back",
		secondaryText: "欢迎回来",
		speaker: "Host",
		startTime: 1.25,
		duration: 1.5,
		style: { color: "#ffcc00", textAlign: "center" },
	},
	{
		text: "Let us begin",
		startTime: 3.1,
		duration: 1.2,
	},
];

describe("WebVTT import", () => {
	test("parses cue identifiers, voice tags, speaker names, and timestamps", () => {
		const result = parseSubtitleFile({
			fileName: "interview.vtt",
			input: [
				"WEBVTT",
				"",
				"intro",
				"00:00:01.250 --> 00:00:02.750 position:50%",
				"<v Host>Welcome <b>back</b>",
			].join("\n"),
		});

		expect(result.skippedCueCount).toBe(0);
		expect(result.captions).toEqual([
			{
				text: "Welcome back",
				speaker: "Host",
				startTime: 1.25,
				duration: 1.5,
			},
		]);
		expect(result.warnings).toContain(
			"Ignored unsupported WebVTT cue settings and inline styling.",
		);
	});
});

describe("subtitle export", () => {
	test("serializes deterministic SRT with linked bilingual text", () => {
		const result = serializeSubtitles({ format: "srt", captions: cues });

		expect(result.fileExtension).toBe("srt");
		expect(result.content).toContain("00:00:01,250 --> 00:00:02,750");
		expect(result.content).toContain("Welcome back\n欢迎回来");
		expect(result.content).toContain("2\n00:00:03,100 --> 00:00:04,300");
		expect(result.warnings).toContain(
			"SRT cannot preserve speaker or reusable style metadata.",
		);
	});

	test("serializes VTT speaker tags and reports unsupported reusable styling", () => {
		const result = serializeSubtitles({ format: "vtt", captions: cues });

		expect(result.content).toStartWith("WEBVTT\n\n");
		expect(result.content).toContain("<v Host>Welcome back\n欢迎回来</v>");
		expect(result.warnings).toContain(
			"WebVTT export omits reusable style details that cannot be represented safely.",
		);
	});

	test("serializes ASS dialogue and maps supported style while warning about bilingual metadata", () => {
		const result = serializeSubtitles({
			format: "ass",
			captions: cues,
			canvasSize: { width: 1920, height: 1080 },
		});

		expect(result.content).toContain("[V4+ Styles]");
		expect(result.content).toContain(
			"Dialogue: 0,0:00:01.25,0:00:02.75,Caption",
		);
		expect(result.content).toContain("Welcome back\\N欢迎回来");
		expect(result.warnings).toContain(
			"ASS export flattens speaker labels and detached per-cue styling.",
		);
	});
});
