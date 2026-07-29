import { describe, expect, test } from "bun:test";
import { selectVideoPrewarmCandidates } from "@/media/preview-prewarm";

describe("preview decoder prewarm planning", () => {
	test("selects the active and next unique video clips inside the lookahead window", () => {
		expect(
			selectVideoPrewarmCandidates({
				currentTime: 4.5,
				lookaheadSeconds: 2,
				maxCandidates: 2,
				elements: [
					{
						type: "video",
						mediaId: "current",
						startSeconds: 0,
						durationSeconds: 5,
					},
					{
						type: "image",
						mediaId: "still",
						startSeconds: 4.8,
						durationSeconds: 2,
					},
					{
						type: "video",
						mediaId: "next",
						startSeconds: 5,
						durationSeconds: 3,
					},
					{
						type: "video",
						mediaId: "next",
						startSeconds: 5.2,
						durationSeconds: 1,
					},
					{
						type: "video",
						mediaId: "later",
						startSeconds: 9,
						durationSeconds: 1,
					},
				],
			}),
		).toEqual(["current", "next"]);
	});

	test("drops clips that have ended and applies a deterministic cap", () => {
		expect(
			selectVideoPrewarmCandidates({
				currentTime: 10,
				lookaheadSeconds: 10,
				maxCandidates: 1,
				elements: [
					{
						type: "video",
						mediaId: "ended",
						startSeconds: 0,
						durationSeconds: 2,
					},
					{
						type: "video",
						mediaId: "first",
						startSeconds: 11,
						durationSeconds: 2,
					},
					{
						type: "video",
						mediaId: "second",
						startSeconds: 12,
						durationSeconds: 2,
					},
				],
			}),
		).toEqual(["first"]);
	});
});
