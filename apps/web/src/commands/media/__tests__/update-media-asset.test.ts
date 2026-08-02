import { describe, expect, mock, test } from "bun:test";
import { UpdateMediaAssetCommand } from "@/commands/media/update-media-asset";
import type { MediaAsset } from "@/media/types";

function asset(): MediaAsset {
	return {
		id: "media-1",
		name: "Original.mov",
		type: "video",
		file: new File(["original"], "Original.mov", { type: "video/quicktime" }),
		url: "blob:original",
		width: 1920,
		height: 1080,
		duration: 10,
	};
}

describe("UpdateMediaAssetCommand", () => {
	test("updates metadata without replacing source bytes and restores it on undo", () => {
		let assets = [asset()];
		const setAssets = mock(({ assets: next }: { assets: MediaAsset[] }) => {
			assets = next;
		});
		const saveMediaAssetMetadata = mock(() => Promise.resolve());
		const command = new UpdateMediaAssetCommand({
			projectId: "project-1",
			assetId: "media-1",
			update: (current) => ({ ...current, name: "Renamed.mov" }),
			dependencies: {
				getEditor: () => ({
					media: { getAssets: () => assets, setAssets },
				}),
				saveMediaAssetMetadata,
				saveMediaProxy: mock(() => Promise.resolve()),
				deleteMediaProxy: mock(() => Promise.resolve()),
				clearCaches: mock(() => undefined),
			},
		});

		command.execute();
		expect(assets[0].name).toBe("Renamed.mov");
		expect(assets[0].file.name).toBe("Original.mov");
		expect(saveMediaAssetMetadata).toHaveBeenLastCalledWith({
			projectId: "project-1",
			mediaAsset: assets[0],
		});

		command.undo();
		expect(assets[0].name).toBe("Original.mov");
		expect(assets[0].file.name).toBe("Original.mov");
	});

	test("attaches and removes proxy bytes through the same undoable command", () => {
		let assets = [asset()];
		const saveMediaProxy = mock(() => Promise.resolve());
		const deleteMediaProxy = mock(() => Promise.resolve());
		const proxyFile = new File(["proxy"], "Original.proxy.mp4", {
			type: "video/mp4",
		});
		const command = new UpdateMediaAssetCommand({
			projectId: "project-1",
			assetId: "media-1",
			update: (current) => ({
				...current,
				proxy: {
					storageId: "media-1-proxy",
					name: proxyFile.name,
					mimeType: proxyFile.type,
					size: proxyFile.size,
					width: 960,
					height: 540,
					generatedAt: "2026-07-28T00:00:00.000Z",
					sourceSize: current.file.size,
					sourceLastModified: current.file.lastModified,
					enabled: true,
				},
				proxyFile,
				proxyUrl: "blob:proxy",
			}),
			dependencies: {
				getEditor: () => ({
					media: {
						getAssets: () => assets,
						setAssets: ({ assets: next }) => {
							assets = next;
						},
					},
				}),
				saveMediaAssetMetadata: mock(() => Promise.resolve()),
				saveMediaProxy,
				deleteMediaProxy,
				clearCaches: mock(() => undefined),
			},
		});

		command.execute();
		expect(saveMediaProxy).toHaveBeenCalledWith({
			projectId: "project-1",
			mediaAsset: expect.objectContaining({ proxyFile }),
		});

		command.undo();
		expect(assets[0].proxy).toBeUndefined();
		expect(deleteMediaProxy).toHaveBeenCalledWith({
			projectId: "project-1",
			storageId: "media-1-proxy",
		});
	});
});
