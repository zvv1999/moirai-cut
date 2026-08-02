import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import {
	findActiveMissingVisualElements,
	findMissingMediaReferences,
	matchFilesToMissingMedia,
} from "@/media/missing-media";
import type {
	AudioElement,
	ImageElement,
	SceneTracks,
	VideoElement,
} from "@/timeline";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";

const at = (seconds: number) => mediaTimeFromSeconds({ seconds });

function videoElement({
	id,
	mediaId,
	name,
	start = 0,
	duration = 4,
}: {
	id: string;
	mediaId: string;
	name: string;
	start?: number;
	duration?: number;
}): VideoElement {
	return {
		id,
		type: "video",
		mediaId,
		name,
		startTime: at(start),
		duration: at(duration),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function imageElement({
	id,
	mediaId,
	name,
	start = 0,
	duration = 4,
}: {
	id: string;
	mediaId: string;
	name: string;
	start?: number;
	duration?: number;
}): ImageElement {
	return {
		id,
		type: "image",
		mediaId,
		name,
		startTime: at(start),
		duration: at(duration),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function uploadedAudioElement({
	id,
	mediaId,
	name,
}: {
	id: string;
	mediaId: string;
	name: string;
}): AudioElement {
	return {
		id,
		type: "audio",
		sourceType: "upload",
		mediaId,
		name,
		startTime: ZERO_MEDIA_TIME,
		duration: at(8),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function tracksFixture(): SceneTracks {
	return {
		overlay: [
			{
				id: "overlay-video",
				name: "Overlay",
				type: "video",
				hidden: false,
				muted: false,
				elements: [
					imageElement({
						id: "missing-image-element",
						mediaId: "missing-image",
						name: "Poster.png",
						start: 1,
						duration: 2,
					}),
				],
			},
		],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			hidden: false,
			muted: false,
			elements: [
				videoElement({
					id: "existing-video-element",
					mediaId: "existing-video",
					name: "Existing.mov",
					duration: 1,
				}),
				videoElement({
					id: "missing-video-element",
					mediaId: "missing-video",
					name: "Interview.mov",
					start: 2,
					duration: 5,
				}),
				videoElement({
					id: "missing-video-reuse",
					mediaId: "missing-video",
					name: "Interview.mov",
					start: 7,
					duration: 2,
				}),
			],
		},
		audio: [
			{
				id: "audio",
				name: "Audio",
				type: "audio",
				muted: false,
				elements: [
					uploadedAudioElement({
						id: "missing-audio-element",
						mediaId: "missing-audio",
						name: "Room tone.wav",
					}),
					{
						id: "library-audio",
						type: "audio",
						sourceType: "library",
						sourceUrl: "https://example.invalid/library.mp3",
						name: "Library track",
						startTime: ZERO_MEDIA_TIME,
						duration: at(4),
						trimStart: ZERO_MEDIA_TIME,
						trimEnd: ZERO_MEDIA_TIME,
						params: {},
					},
				],
			},
		],
	};
}

function existingVideoAsset(): MediaAsset {
	return {
		id: "existing-video",
		name: "Existing.mov",
		type: "video",
		file: new File(["video"], "Existing.mov", { type: "video/quicktime" }),
		url: "blob:existing-video",
		duration: 1,
	};
}

describe("findMissingMediaReferences", () => {
	test("groups timeline references whose media asset is unavailable", () => {
		const missing = findMissingMediaReferences({
			tracks: tracksFixture(),
			assets: [existingVideoAsset()],
		});

		expect(missing).toEqual([
			{
				mediaId: "missing-image",
				name: "Poster.png",
				type: "image",
				usages: [
					{ trackId: "overlay-video", elementId: "missing-image-element" },
				],
			},
			{
				mediaId: "missing-video",
				name: "Interview.mov",
				type: "video",
				usages: [
					{ trackId: "main", elementId: "missing-video-element" },
					{ trackId: "main", elementId: "missing-video-reuse" },
				],
			},
			{
				mediaId: "missing-audio",
				name: "Room tone.wav",
				type: "audio",
				usages: [{ trackId: "audio", elementId: "missing-audio-element" }],
			},
		]);
	});

	test("ignores restored assets and library audio without a media id", () => {
		const missing = findMissingMediaReferences({
			tracks: tracksFixture(),
			assets: [
				existingVideoAsset(),
				{
					id: "missing-video",
					name: "Interview.mov",
					type: "video",
					file: new File(["restored"], "Interview.mov", {
						type: "video/quicktime",
					}),
				},
			],
		});

		expect(missing.map((reference) => reference.mediaId)).toEqual([
			"missing-image",
			"missing-audio",
		]);
	});
});

describe("findActiveMissingVisualElements", () => {
	test("uses half-open clip ranges and only returns visual missing media", () => {
		const tracks = tracksFixture();
		const assets = [existingVideoAsset()];

		expect(
			findActiveMissingVisualElements({ tracks, assets, time: at(1) }).map(
				(element) => element.mediaId,
			),
		).toEqual(["missing-image"]);
		expect(
			findActiveMissingVisualElements({ tracks, assets, time: at(2) }).map(
				(element) => element.mediaId,
			),
		).toEqual(["missing-image", "missing-video"]);
		expect(
			findActiveMissingVisualElements({ tracks, assets, time: at(3) }).map(
				(element) => element.mediaId,
			),
		).toEqual(["missing-video"]);
		expect(
			findActiveMissingVisualElements({ tracks, assets, time: at(9) }),
		).toEqual([]);
	});
});

describe("matchFilesToMissingMedia", () => {
	test("matches exact filenames first and then a unique same-type basename", () => {
		const references = findMissingMediaReferences({
			tracks: tracksFixture(),
			assets: [existingVideoAsset()],
		});
		const exactVideo = new File(["video"], "Interview.mov", {
			type: "video/quicktime",
		});
		const alternateImageExtension = new File(["image"], "Poster.jpg", {
			type: "image/jpeg",
		});
		const unrelatedAudio = new File(["audio"], "Music.wav", {
			type: "audio/wav",
		});

		const result = matchFilesToMissingMedia({
			references,
			files: [unrelatedAudio, alternateImageExtension, exactVideo],
		});

		expect(result.matches).toEqual([
			{ reference: references[0], file: alternateImageExtension },
			{ reference: references[1], file: exactVideo },
		]);
		expect(result.unmatchedReferences.map((item) => item.mediaId)).toEqual([
			"missing-audio",
		]);
		expect(result.unmatchedFiles).toEqual([unrelatedAudio]);
	});

	test("never matches a basename when the media type is incompatible", () => {
		const references = findMissingMediaReferences({
			tracks: tracksFixture(),
			assets: [existingVideoAsset()],
		});
		const wrongType = new File(["audio"], "Interview.wav", {
			type: "audio/wav",
		});

		const result = matchFilesToMissingMedia({
			references,
			files: [wrongType],
		});

		expect(result.matches).toEqual([]);
		expect(result.unmatchedReferences).toEqual(references);
		expect(result.unmatchedFiles).toEqual([wrongType]);
	});
});
