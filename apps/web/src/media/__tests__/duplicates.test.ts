import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { detectMediaDuplicates } from "@/media/duplicates";

function media({
	id,
	name,
	contents,
	type = "image",
	width = 1920,
	height = 1080,
	duration,
	ephemeral,
}: {
	id: string;
	name: string;
	contents: string;
	type?: MediaAsset["type"];
	width?: number;
	height?: number;
	duration?: number;
	ephemeral?: boolean;
}): MediaAsset {
	const mimeType =
		type === "video"
			? "video/mp4"
			: type === "audio"
				? "audio/wav"
				: "image/jpeg";
	return {
		id,
		name,
		type,
		file: new File([contents], name, { type: mimeType }),
		url: `blob:${id}`,
		width,
		height,
		duration,
		ephemeral,
	};
}

describe("duplicate media detection", () => {
	test("groups byte-identical assets as exact duplicates regardless of name", async () => {
		const groups = await detectMediaDuplicates({
			assets: [
				media({ id: "a", name: "Interview.jpg", contents: "same" }),
				media({ id: "b", name: "Copy.jpg", contents: "same" }),
				media({ id: "c", name: "Other.jpg", contents: "other" }),
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			kind: "exact",
			assetIds: ["a", "b"],
		});
		expect(groups[0].reasons).toContain("Identical SHA-256 content");
	});

	test("flags structurally similar but different media only as probable", async () => {
		const groups = await detectMediaDuplicates({
			assets: [
				media({
					id: "a",
					name: "Take 01.mp4",
					contents: "abcde",
					type: "video",
					duration: 12,
				}),
				media({
					id: "b",
					name: "Take 01 copy.mp4",
					contents: "vwxyz",
					type: "video",
					duration: 12.04,
				}),
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0].kind).toBe("probable");
		expect(groups[0].reasons).toContain("Matching normalized filename");
		expect(groups[0].reasons).toContain("Matching dimensions and duration");
	});

	test("does not group legitimate alternates with different timing or dimensions", async () => {
		const groups = await detectMediaDuplicates({
			assets: [
				media({
					id: "a",
					name: "Take.mp4",
					contents: "abcde",
					type: "video",
					duration: 5,
				}),
				media({
					id: "b",
					name: "Take copy.mp4",
					contents: "vwxyz",
					type: "video",
					duration: 9,
				}),
				media({
					id: "c",
					name: "Take 2.mp4",
					contents: "12345",
					type: "video",
					width: 1280,
					height: 720,
					duration: 5,
				}),
			],
		});

		expect(groups).toEqual([]);
	});

	test("ignores ephemeral working assets and reports scan progress", async () => {
		const progress: number[] = [];
		const groups = await detectMediaDuplicates({
			assets: [
				media({ id: "a", name: "A.jpg", contents: "same" }),
				media({
					id: "temp",
					name: "Temp.jpg",
					contents: "same",
					ephemeral: true,
				}),
			],
			onProgress: (value) => progress.push(value),
		});

		expect(groups).toEqual([]);
		expect(progress.at(-1)).toBe(1);
	});
});
