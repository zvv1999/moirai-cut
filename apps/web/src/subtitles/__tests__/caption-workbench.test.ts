import { describe, expect, test } from "bun:test";
import {
	applyCaptionBulkEdit,
	buildCaptionElementPatch,
	collectCaptionCues,
	createCaptionWordTimings,
} from "@/subtitles/caption-model";
import { auditCaptionCues } from "@/subtitles/caption-quality";
import {
	createCaptionStyle,
	detachCaptionStyle,
	duplicateCaptionStyle,
	updateCaptionStyle,
} from "@/subtitles/styles";
import type { SceneTracks, TextElement } from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	ZERO_MEDIA_TIME,
} from "@/wasm";

function captionElement({
	id,
	text,
	start,
	duration,
	secondaryText = "",
	speaker = "",
	styleId = "",
	positionY = 0,
}: {
	id: string;
	text: string;
	start: number;
	duration: number;
	secondaryText?: string;
	speaker?: string;
	styleId?: string;
	positionY?: number;
}): TextElement {
	return {
		id,
		type: "text",
		name: `Caption ${id}`,
		startTime: mediaTimeFromSeconds({ seconds: start }),
		duration: mediaTimeFromSeconds({ seconds: duration }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {
			content: text,
			"caption.enabled": true,
			"caption.primaryText": text,
			"caption.secondaryText": secondaryText,
			"caption.speaker": speaker,
			"caption.wordTimings": JSON.stringify([
				{ word: text.split(/\s+/)[0], start, end: start + 0.4 },
			]),
			"caption.styleId": styleId,
			"transform.positionY": positionY,
		},
	};
}

function tracks(elements: TextElement[]): SceneTracks {
	return {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			elements: [],
			muted: false,
			hidden: false,
		},
		overlay: [
			{
				id: "captions",
				type: "text",
				name: "Captions",
				elements,
				hidden: false,
			},
		],
		audio: [],
	};
}

describe("caption data model", () => {
	test("collects caption clips in timeline order and preserves editable metadata", () => {
		const result = collectCaptionCues({
			tracks: tracks([
				captionElement({
					id: "later",
					text: "Welcome back",
					start: 4,
					duration: 1.5,
					secondaryText: "欢迎回来",
					speaker: "Host",
					styleId: "primary",
				}),
				captionElement({
					id: "first",
					text: "Hello",
					start: 1,
					duration: 1,
				}),
			]),
		});

		expect(result.map((cue) => cue.id)).toEqual(["first", "later"]);
		expect(result[1]).toMatchObject({
			primaryText: "Welcome back",
			secondaryText: "欢迎回来",
			speaker: "Host",
			styleId: "primary",
		});
		expect(result[1].wordTimings).toEqual([
			{ word: "Welcome", start: 4, end: 4.4 },
		]);
	});

	test("bulk search, replace, and timing offset preserve ordering and clamp at zero", () => {
		const cues = collectCaptionCues({
			tracks: tracks([
				captionElement({
					id: "a",
					text: "teh first line",
					start: 0.1,
					duration: 1,
				}),
				captionElement({
					id: "b",
					text: "teh second line",
					start: 1.2,
					duration: 1,
				}),
			]),
		});

		const result = applyCaptionBulkEdit({
			cues,
			search: "teh",
			replace: "the",
			timingOffsetSeconds: -0.5,
		});

		expect(result.changedCueCount).toBe(2);
		expect(result.cues.map((cue) => cue.primaryText)).toEqual([
			"the first line",
			"the second line",
		]);
		expect(result.cues.map((cue) => cue.startTime)).toEqual([0, 0.7]);

		const patches = result.cues.map((cue) => buildCaptionElementPatch({ cue }));
		expect(patches[0].params).toMatchObject({
			content: "the first line",
			"caption.primaryText": "the first line",
		});
		expect(mediaTimeToSeconds({ time: patches[0].startTime! })).toBe(0);
		expect(mediaTimeToSeconds({ time: patches[1].startTime! })).toBe(0.7);
	});

	test("renders paired bilingual content while keeping timing linked", () => {
		const [cue] = collectCaptionCues({
			tracks: tracks([
				captionElement({
					id: "a",
					text: "Follow the light",
					secondaryText: "循光而行",
					start: 2,
					duration: 1.2,
				}),
			]),
		});
		const patch = buildCaptionElementPatch({
			cue: {
				...cue,
				secondaryStyle: {
					color: "#ffd27d",
					fontSize: 30,
					fontWeight: "normal",
				},
			},
		});

		expect(patch.params?.content).toBe("Follow the light\n循光而行");
		expect(patch.params?.["caption.secondaryText"]).toBe("循光而行");
		expect(patch.params?.["caption.secondaryStyle"]).toBe(
			JSON.stringify({
				color: "#ffd27d",
				fontSize: 30,
				fontWeight: "normal",
			}),
		);
		expect(patch.duration).toBe(mediaTimeFromSeconds({ seconds: 1.2 }));
	});

	test("creates editable word timing when an imported cue has cue-level timing only", () => {
		expect(
			createCaptionWordTimings({
				text: "Follow the light",
				startTime: 2,
				duration: 1.5,
			}),
		).toEqual([
			{ word: "Follow", start: 2, end: 2.5 },
			{ word: "the", start: 2.5, end: 3 },
			{ word: "light", start: 3, end: 3.5 },
		]);
	});
});

describe("caption style library", () => {
	test("creates, updates, duplicates, and detaches reusable styles", () => {
		const original = createCaptionStyle({
			id: "style-a",
			name: "Documentary",
			style: { color: "#ffffff", fontSize: 44 },
		});
		const updated = updateCaptionStyle({
			style: original,
			updates: { name: "Documentary Bold", style: { fontWeight: "bold" } },
		});
		const duplicate = duplicateCaptionStyle({
			style: updated,
			id: "style-b",
		});
		const detached = detachCaptionStyle({
			style: duplicate,
			cueStyle: { textAlign: "left" },
		});

		expect(updated).toMatchObject({
			id: "style-a",
			name: "Documentary Bold",
			style: { color: "#ffffff", fontSize: 44, fontWeight: "bold" },
		});
		expect(duplicate).toMatchObject({
			id: "style-b",
			name: "Documentary Bold copy",
		});
		expect(detached).toEqual({
			styleId: null,
			styleDetached: true,
			style: {
				color: "#ffffff",
				fontSize: 44,
				fontWeight: "bold",
				textAlign: "left",
			},
		});
	});
});

describe("caption quality checks", () => {
	test("detects line length, unsafe placement, overlap, gap, unreadable duration, and bounds", () => {
		const cues = collectCaptionCues({
			tracks: tracks([
				captionElement({
					id: "long",
					text: "This caption line is deliberately much too long for a safe subtitle",
					start: 0,
					duration: 0.25,
					positionY: 500,
				}),
				captionElement({
					id: "overlap",
					text: "Overlap",
					start: 0.1,
					duration: 0.8,
				}),
				captionElement({
					id: "gap",
					text: "After a gap",
					start: 6,
					duration: 5,
				}),
			]),
		});

		const issueKinds = new Set(
			auditCaptionCues({
				cues,
				timelineDurationSeconds: 10,
				canvasHeight: 1080,
				maxLineCharacters: 42,
				maxGapSeconds: 3,
				minDurationSeconds: 0.7,
			}).map((issue) => issue.kind),
		);

		expect(issueKinds).toEqual(
			new Set([
				"line-length",
				"unsafe-placement",
				"overlap",
				"gap",
				"unreadable-duration",
				"out-of-bounds",
			]),
		);
	});
});
