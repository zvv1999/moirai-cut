import { describe, expect, mock, test } from "bun:test";
import { RelinkMediaAssetCommand } from "@/commands/media/relink-media-asset";
import type { MediaAsset } from "@/media/types";

function asset({
	id,
	name,
	contents,
}: {
	id: string;
	name: string;
	contents: string;
}): MediaAsset {
	return {
		id,
		name,
		type: "video",
		file: new File([contents], name, { type: "video/quicktime" }),
		url: `blob:${name}`,
		width: 1920,
		height: 1080,
		duration: 10,
	};
}

function editorWithAssets(initialAssets: MediaAsset[]) {
	let assets = initialAssets;
	const setAssets = mock(({ assets: next }: { assets: MediaAsset[] }) => {
		assets = next;
	});
	const editor = {
		media: {
			getAssets: () => assets,
			setAssets,
		},
	};

	return {
		editor,
		getAssets: () => assets,
		setAssets,
	};
}

describe("RelinkMediaAssetCommand", () => {
	test("restores an unavailable media id without mutating timeline references", () => {
		const state = editorWithAssets([]);
		const saveMediaAsset = mock(() => Promise.resolve());
		const deleteMediaAsset = mock(() => Promise.resolve());
		const timelineReferences = [
			{
				trackId: "main",
				elementId: "clip-1",
				mediaId: "missing-media",
				trimStart: 120,
				effects: [{ id: "effect-1" }],
				keyframes: [{ id: "keyframe-1" }],
			},
		];
		const timelineBefore = structuredClone(timelineReferences);
		const replacement = asset({
			id: "generated-id-that-must-not-be-used",
			name: "Interview.mov",
			contents: "replacement",
		});

		const command = new RelinkMediaAssetCommand({
			projectId: "project-1",
			assetId: "missing-media",
			asset: replacement,
			dependencies: {
				getEditor: () => state.editor,
				saveMediaAsset,
				deleteMediaAsset,
				clearCaches: mock(() => undefined),
			},
		});

		command.execute();

		expect(state.getAssets()).toEqual([
			expect.objectContaining({
				id: "missing-media",
				name: "Interview.mov",
				file: replacement.file,
			}),
		]);
		expect(saveMediaAsset).toHaveBeenCalledWith({
			projectId: "project-1",
			mediaAsset: expect.objectContaining({ id: "missing-media" }),
		});
		expect(timelineReferences).toEqual(timelineBefore);
	});

	test("undo restores a replaced asset and its original identity", () => {
		const original = asset({
			id: "media-1",
			name: "Original.mov",
			contents: "original",
		});
		const replacement = asset({
			id: "ignored",
			name: "Replacement.mov",
			contents: "replacement",
		});
		const state = editorWithAssets([original]);
		const saveMediaAsset = mock(() => Promise.resolve());
		const clearCaches = mock(() => undefined);
		const command = new RelinkMediaAssetCommand({
			projectId: "project-1",
			assetId: "media-1",
			asset: replacement,
			dependencies: {
				getEditor: () => state.editor,
				saveMediaAsset,
				deleteMediaAsset: mock(() => Promise.resolve()),
				clearCaches,
			},
		});

		command.execute();
		command.undo();

		expect(state.getAssets()).toEqual([original]);
		expect(saveMediaAsset).toHaveBeenLastCalledWith({
			projectId: "project-1",
			mediaAsset: original,
		});
		expect(clearCaches).toHaveBeenCalledTimes(2);
	});

	test("undo returns a newly relinked id to its missing state", () => {
		const state = editorWithAssets([]);
		const deleteMediaAsset = mock(() => Promise.resolve());
		const command = new RelinkMediaAssetCommand({
			projectId: "project-1",
			assetId: "missing-media",
			asset: asset({
				id: "ignored",
				name: "Recovered.mov",
				contents: "replacement",
			}),
			dependencies: {
				getEditor: () => state.editor,
				saveMediaAsset: mock(() => Promise.resolve()),
				deleteMediaAsset,
				clearCaches: mock(() => undefined),
			},
		});

		command.execute();
		command.undo();

		expect(state.getAssets()).toEqual([]);
		expect(deleteMediaAsset).toHaveBeenCalledWith({
			projectId: "project-1",
			id: "missing-media",
		});
	});

	test("a failed save restores the previous asset and invalidates replacement caches", async () => {
		const original = asset({
			id: "media-1",
			name: "Original.mov",
			contents: "original",
		});
		const state = editorWithAssets([original]);
		const clearCaches = mock(() => undefined);
		let rejectSave: ((error: Error) => void) | undefined;
		const saveMediaAsset = mock(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectSave = reject;
				}),
		);
		const originalConsoleError = console.error;
		console.error = mock(() => undefined);

		try {
			const command = new RelinkMediaAssetCommand({
				projectId: "project-1",
				assetId: "media-1",
				asset: asset({
					id: "ignored",
					name: "Replacement.mov",
					contents: "replacement",
				}),
				dependencies: {
					getEditor: () => state.editor,
					saveMediaAsset,
					deleteMediaAsset: mock(() => Promise.resolve()),
					clearCaches,
				},
			});

			command.execute();
			rejectSave?.(new Error("disk full"));
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(state.getAssets()).toEqual([original]);
			expect(clearCaches).toHaveBeenCalledTimes(2);
		} finally {
			console.error = originalConsoleError;
		}
	});
});
