import { describe, expect, test } from "bun:test";
import {
	assignAssetsToMediaBin,
	createMediaBin,
	deleteMediaBin,
	getMediaBinTree,
	moveMediaBin,
	renameMediaBin,
	type MediaOrganization,
} from "@/media/organization";

function emptyOrganization(): MediaOrganization {
	return { bins: [], assetBinIds: {} };
}

describe("media organization", () => {
	test("creates named root and nested bins in stable sibling order", () => {
		let organization = createMediaBin({
			organization: emptyOrganization(),
			bin: { id: "story", name: " Story ", parentId: null },
		});
		organization = createMediaBin({
			organization,
			bin: { id: "broll", name: "B-roll", parentId: null },
		});
		organization = createMediaBin({
			organization,
			bin: { id: "interviews", name: "Interviews", parentId: "story" },
		});

		expect(organization.bins).toEqual([
			{ id: "story", name: "Story", parentId: null, order: 0 },
			{ id: "broll", name: "B-roll", parentId: null, order: 1 },
			{ id: "interviews", name: "Interviews", parentId: "story", order: 0 },
		]);
		expect(getMediaBinTree({ organization })).toEqual([
			{
				bin: organization.bins[0],
				depth: 0,
				hasChildren: true,
			},
			{
				bin: organization.bins[2],
				depth: 1,
				hasChildren: false,
			},
			{
				bin: organization.bins[1],
				depth: 0,
				hasChildren: false,
			},
		]);
	});

	test("renames, reorders, reparents, and rejects descendant cycles", () => {
		let organization: MediaOrganization = {
			bins: [
				{ id: "a", name: "A", parentId: null, order: 0 },
				{ id: "b", name: "B", parentId: null, order: 1 },
				{ id: "c", name: "C", parentId: "a", order: 0 },
			],
			assetBinIds: {},
		};

		organization = renameMediaBin({
			organization,
			binId: "b",
			name: " Selects ",
		});
		organization = moveMediaBin({
			organization,
			binId: "b",
			parentId: null,
			index: 0,
		});
		organization = moveMediaBin({
			organization,
			binId: "c",
			parentId: "b",
			index: 0,
		});

		expect(organization.bins).toEqual([
			{ id: "a", name: "A", parentId: null, order: 1 },
			{ id: "b", name: "Selects", parentId: null, order: 0 },
			{ id: "c", name: "C", parentId: "b", order: 0 },
		]);
		expect(() =>
			moveMediaBin({
				organization,
				binId: "b",
				parentId: "c",
				index: 0,
			}),
		).toThrow("inside itself");
	});

	test("deleting a bin removes its descendants but rehomes every asset", () => {
		const organization: MediaOrganization = {
			bins: [
				{ id: "parent", name: "Parent", parentId: null, order: 0 },
				{ id: "delete", name: "Delete", parentId: "parent", order: 0 },
				{ id: "child", name: "Child", parentId: "delete", order: 0 },
				{ id: "keep", name: "Keep", parentId: "parent", order: 1 },
			],
			assetBinIds: {
				one: "delete",
				two: "child",
				three: "keep",
			},
		};

		const result = deleteMediaBin({
			organization,
			binId: "delete",
		});

		expect(result.deletedBinIds).toEqual(["delete", "child"]);
		expect(result.rehomedAssetIds).toEqual(["one", "two"]);
		expect(result.organization.bins).toEqual([
			{ id: "parent", name: "Parent", parentId: null, order: 0 },
			{ id: "keep", name: "Keep", parentId: "parent", order: 0 },
		]);
		expect(result.organization.assetBinIds).toEqual({
			one: "parent",
			two: "parent",
			three: "keep",
		});
	});

	test("assigning assets moves organization metadata without touching assets", () => {
		const organization = assignAssetsToMediaBin({
			organization: {
				bins: [{ id: "selects", name: "Selects", parentId: null, order: 0 }],
				assetBinIds: { a: "old" },
			},
			assetIds: ["a", "b", "b"],
			binId: "selects",
		});

		expect(organization.assetBinIds).toEqual({
			a: "selects",
			b: "selects",
		});
		expect(
			assignAssetsToMediaBin({
				organization,
				assetIds: ["a"],
				binId: null,
			}).assetBinIds,
		).toEqual({ b: "selects" });
	});
});
