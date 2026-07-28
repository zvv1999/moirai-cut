import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { filterMediaLibraryAssets } from "../media-library-filters";

function asset({
	id,
	name,
	type,
	ephemeral = false,
}: {
	id: string;
	name: string;
	type: MediaAsset["type"];
	ephemeral?: boolean;
}): MediaAsset {
	return {
		id,
		name,
		type,
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
});
