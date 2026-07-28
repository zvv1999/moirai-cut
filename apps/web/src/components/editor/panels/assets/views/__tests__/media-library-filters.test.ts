import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { filterMediaLibraryAssets } from "../media-library-filters";

function asset({
	id,
	name,
	type,
	duration,
	width,
	height,
	ephemeral = false,
}: {
	id: string;
	name: string;
	type: MediaAsset["type"];
	duration?: number;
	width?: number;
	height?: number;
	ephemeral?: boolean;
}): MediaAsset {
	return {
		id,
		name,
		type,
		duration,
		width,
		height,
		ephemeral,
		file: new File([], name),
		url: `blob:${id}`,
	};
}

describe("filterMediaLibraryAssets", () => {
	const assets = [
		asset({ id: "image", name: "DSC_5404.JPG", type: "image" }),
		asset({ id: "video", name: "Reed Entrance.MP4", type: "video" }),
		asset({ id: "audio", name: "Reed Source Score.WAV", type: "audio" }),
		asset({
			id: "ephemeral",
			name: "Reed preview.mp4",
			type: "video",
			ephemeral: true,
		}),
	];

	test("matches filenames case-insensitively and ignores surrounding spaces", () => {
		expect(
			filterMediaLibraryAssets({
				assets,
				query: "  reed  ",
				type: "all",
			}).map((item) => item.id),
		).toEqual(["video", "audio"]);
	});

	test("combines filename search with a media type filter", () => {
		expect(
			filterMediaLibraryAssets({
				assets,
				query: "reed",
				type: "audio",
			}).map((item) => item.id),
		).toEqual(["audio"]);
	});

	test("keeps ephemeral working assets out of search results", () => {
		expect(
			filterMediaLibraryAssets({
				assets,
				query: "",
				type: "video",
			}).map((item) => item.id),
		).toEqual(["video"]);
	});

	test("combines duration, resolution, usage, tag, and favorite filters", () => {
		const richAssets = [
			asset({
				id: "short-hd",
				name: "Reed closeup.mp4",
				type: "video",
				duration: 8,
				width: 1920,
				height: 1080,
			}),
			asset({
				id: "long-uhd",
				name: "Wide.mp4",
				type: "video",
				duration: 90,
				width: 3840,
				height: 2160,
			}),
		];
		const filtered = filterMediaLibraryAssets({
			assets: richAssets,
			query: "",
			type: "video",
			filters: {
				duration: "under-10",
				resolution: "hd",
				usage: "used",
				availability: "available",
				tag: "select",
				favorite: "favorite",
			},
			usageCounts: { "short-hd": 2 },
			metadata: {
				"short-hd": {
					tags: ["select"],
					favorite: true,
					colorLabel: "green",
				},
			},
		});

		expect(filtered.map((item) => item.id)).toEqual(["short-hd"]);
	});

	test("available assets are excluded when the missing-only filter is active", () => {
		expect(
			filterMediaLibraryAssets({
				assets,
				query: "",
				type: "all",
				filters: {
					duration: "all",
					resolution: "all",
					usage: "all",
					availability: "missing",
					tag: null,
					favorite: "all",
				},
				usageCounts: {},
				metadata: {},
			}),
		).toEqual([]);
	});
});
