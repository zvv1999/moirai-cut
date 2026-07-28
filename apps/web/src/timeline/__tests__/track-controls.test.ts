import { describe, expect, test } from "bun:test";
import {
	applyTrackControlPatch,
	getTrackCompatibilityLabel,
	getTrackDisplayHeight,
	getNextTrackDisplayHeight,
	isTrackAudible,
	isTrackLocked,
	normalizeTrackName,
	TRACK_HEIGHT_MAX_PX,
	TRACK_HEIGHT_MIN_PX,
} from "@/timeline/track-controls";
import { buildEmptyTrack } from "@/timeline/placement/track-factory";

describe("timeline track controls", () => {
	test("describes the media each track type accepts", () => {
		expect(getTrackCompatibilityLabel({ trackType: "video" })).toBe(
			"Video and image clips",
		);
		expect(getTrackCompatibilityLabel({ trackType: "audio" })).toBe(
			"Audio clips",
		);
		expect(getTrackCompatibilityLabel({ trackType: "text" })).toBe(
			"Text clips",
		);
	});

	test("normalizes names without allowing an empty track label", () => {
		expect(
			normalizeTrackName({ name: "  Interview A-roll  ", trackType: "video" }),
		).toBe("Interview A-roll");
		expect(normalizeTrackName({ name: "   ", trackType: "audio" })).toBe(
			"Audio track",
		);
	});

	test("clamps custom heights while preserving type defaults", () => {
		const video = buildEmptyTrack({ id: "video", type: "video" });
		expect(getTrackDisplayHeight({ track: video })).toBe(65);
		expect(
			getTrackDisplayHeight({ track: { ...video, height: 4 } }),
		).toBe(TRACK_HEIGHT_MIN_PX);
		expect(
			getTrackDisplayHeight({ track: { ...video, height: 999 } }),
		).toBe(TRACK_HEIGHT_MAX_PX);
		expect(getNextTrackDisplayHeight({ track: video })).toBe(101);
		expect(
			getNextTrackDisplayHeight({ track: { ...video, height: 101 } }),
		).toBe(TRACK_HEIGHT_MAX_PX);
		expect(
			getNextTrackDisplayHeight({
				track: { ...video, height: TRACK_HEIGHT_MAX_PX },
			}),
		).toBe(TRACK_HEIGHT_MIN_PX);
	});

	test("applies safe, type-aware control patches", () => {
		const video = buildEmptyTrack({ id: "video", type: "video" });
		const text = buildEmptyTrack({ id: "text", type: "text" });
		const updatedVideo = applyTrackControlPatch({
			track: video,
			patch: {
				name: "  Camera A  ",
				locked: true,
				solo: true,
				height: 999,
			},
		});
		const updatedText = applyTrackControlPatch({
			track: text,
			patch: { solo: true },
		});

		expect(updatedVideo.name).toBe("Camera A");
		expect(updatedVideo.height).toBe(TRACK_HEIGHT_MAX_PX);
		expect(updatedVideo.solo).toBe(true);
		expect(isTrackLocked({ track: updatedVideo })).toBe(true);
		expect(updatedText.solo).toBeUndefined();
		expect(isTrackLocked({ track: text })).toBe(false);
	});

	test("solo isolates audio-capable tracks and still respects mute", () => {
		const video = buildEmptyTrack({ id: "video", type: "video" });
		const music = buildEmptyTrack({ id: "music", type: "audio" });
		const voice = buildEmptyTrack({ id: "voice", type: "audio" });
		const tracks = [video, { ...music, solo: true }, voice];

		expect(isTrackAudible({ track: video, tracks })).toBe(false);
		expect(isTrackAudible({ track: tracks[1], tracks })).toBe(true);
		expect(
			isTrackAudible({
				track: { ...tracks[1], muted: true },
				tracks: [{ ...music, solo: true, muted: true }, voice],
			}),
		).toBe(false);
		expect(isTrackAudible({ track: voice, tracks: [video, music, voice] })).toBe(
			true,
		);
	});
});
