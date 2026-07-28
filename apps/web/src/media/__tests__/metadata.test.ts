import { describe, expect, test } from "bun:test";
import {
	getMediaAssetMetadata,
	updateMediaAssetMetadata,
	type MediaOrganization,
} from "@/media/organization";

function organization(): MediaOrganization {
	return {
		bins: [],
		assetBinIds: {},
		assetMetadata: {
			a: {
				tags: ["interview"],
				favorite: false,
				colorLabel: null,
			},
		},
	};
}

describe("media asset metadata", () => {
	test("batch adds normalized tags, favorite, and color without duplicates", () => {
		const updated = updateMediaAssetMetadata({
			organization: organization(),
			assetIds: ["a", "b", "b"],
			patch: {
				addTags: [" Reed ", "interview", "reed"],
				favorite: true,
				colorLabel: "blue",
			},
		});

		expect(updated.assetMetadata).toEqual({
			a: {
				tags: ["interview", "Reed"],
				favorite: true,
				colorLabel: "blue",
			},
			b: {
				tags: ["Reed", "interview"],
				favorite: true,
				colorLabel: "blue",
			},
		});
	});

	test("batch removal and explicit clearing preserve unrelated metadata", () => {
		const updated = updateMediaAssetMetadata({
			organization: {
				...organization(),
				assetMetadata: {
					a: {
						tags: ["interview", "night"],
						favorite: true,
						colorLabel: "red",
					},
				},
			},
			assetIds: ["a"],
			patch: {
				removeTags: [" NIGHT "],
				colorLabel: null,
			},
		});

		expect(getMediaAssetMetadata({ organization: updated, assetId: "a" })).toEqual({
			tags: ["interview"],
			favorite: true,
			colorLabel: null,
		});
	});

	test("old projects have safe empty metadata defaults", () => {
		expect(
			getMediaAssetMetadata({
				organization: { bins: [], assetBinIds: {} },
				assetId: "missing",
			}),
		).toEqual({
			tags: [],
			favorite: false,
			colorLabel: null,
		});
	});
});
