import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { SceneTracks } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";
import { buildScene } from "../scene-builder";
import { VideoNode } from "../nodes/video-node";

function legacyTrimmedVideoTracks({
	sourceDuration,
}: {
	sourceDuration?: ReturnType<typeof mediaTimeFromSeconds>;
} = {}): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main-track",
			name: "Main Track",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "video-element",
					name: "05-摇酒仪式",
					type: "video",
					mediaId: "video-media",
					startTime: mediaTimeFromSeconds({ seconds: 6.5 }),
					duration: mediaTimeFromSeconds({ seconds: 4.7 }),
					trimStart: mediaTimeFromSeconds({ seconds: 0.5 }),
					trimEnd: mediaTimeFromSeconds({ seconds: 7.808 }),
					...(sourceDuration === undefined ? {} : { sourceDuration }),
					params: {},
				},
			],
		},
		audio: [],
	};
}

function videoAsset({
	duration = 13.008333,
}: {
	duration?: number | null;
} = {}): MediaAsset {
	return {
		id: "video-media",
		name: "微信视频.mp4",
		type: "video",
		file: new File(["video"], "微信视频.mp4", { type: "video/mp4" }),
		url: "blob:video",
		...(duration == null ? {} : { duration }),
		width: 1920,
		height: 1080,
	};
}

describe("preview scene video source timing", () => {
	test("recovers source duration from media metadata for legacy trimmed clips", () => {
		const asset = videoAsset();
		const scene = buildScene({
			canvasSize: { width: 1080, height: 1920 },
			tracks: legacyTrimmedVideoTracks(),
			mediaAssets: [asset],
			duration: mediaTimeFromSeconds({ seconds: 47.7 }),
			background: { type: "color", color: "#000000" },
			isPreview: true,
		});

		const videoNode = scene.children.find(
			(node): node is VideoNode => node instanceof VideoNode,
		);

		expect(videoNode?.params.sourceDuration).toBe(
			mediaTimeFromSeconds({ seconds: asset.duration! }),
		);
	});

	test("preserves an explicit clip source duration", () => {
		const sourceDuration = mediaTimeFromSeconds({ seconds: 20 });
		const scene = buildScene({
			canvasSize: { width: 1080, height: 1920 },
			tracks: legacyTrimmedVideoTracks({ sourceDuration }),
			mediaAssets: [videoAsset()],
			duration: mediaTimeFromSeconds({ seconds: 47.7 }),
			background: { type: "color", color: "#000000" },
		});

		const videoNode = scene.children.find(
			(node): node is VideoNode => node instanceof VideoNode,
		);

		expect(videoNode?.params.sourceDuration).toBe(sourceDuration);
	});

	test("falls back to the stored trim equation when media duration is unavailable", () => {
		const tracks = legacyTrimmedVideoTracks();
		const element = tracks.main.elements[0]!;
		const scene = buildScene({
			canvasSize: { width: 1080, height: 1920 },
			tracks,
			mediaAssets: [videoAsset({ duration: null })],
			duration: mediaTimeFromSeconds({ seconds: 47.7 }),
			background: { type: "color", color: "#000000" },
		});

		const videoNode = scene.children.find(
			(node): node is VideoNode => node instanceof VideoNode,
		);

		expect(videoNode?.params.sourceDuration).toBe(
			element.trimStart + element.duration + element.trimEnd,
		);
	});
});
