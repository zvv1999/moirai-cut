import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import {
	buildBatchMediaNames,
	computeProxyDimensions,
	getMediaAssetPlaybackSource,
	getMediaProxyStorageId,
	isMediaProxyStorageId,
	shouldAutoGenerateProxy,
} from "@/media/proxy";

function videoAsset(): MediaAsset {
	return {
		id: "media-1",
		name: "Interview.mov",
		type: "video",
		file: new File(["original"], "Interview.mov", {
			type: "video/quicktime",
		}),
		url: "blob:original",
		width: 3840,
		height: 2160,
		duration: 12,
			proxy: {
			storageId: "media-1-proxy",
			name: "Interview.proxy.mp4",
			mimeType: "video/mp4",
			size: 5,
			width: 960,
			height: 540,
			generatedAt: "2026-07-28T00:00:00.000Z",
			sourceSize: 8,
			sourceLastModified: 1,
			enabled: true,
		},
		proxyFile: new File(["proxy"], "Interview.proxy.mp4", {
			type: "video/mp4",
		}),
		proxyUrl: "blob:proxy",
	};
}

describe("media proxy workflow", () => {
	test("keeps proxy dimensions even and within the configured long edge", () => {
		expect(
			computeProxyDimensions({
				width: 3840,
				height: 2160,
				maxLongEdge: 960,
			}),
		).toEqual({ width: 960, height: 540 });
		expect(
			computeProxyDimensions({
				width: 1080,
				height: 1920,
				maxLongEdge: 960,
			}),
		).toEqual({ width: 540, height: 960 });
	});

	test("uses the proxy only for preview and the original for export", () => {
		const asset = videoAsset();

		expect(getMediaAssetPlaybackSource({ asset, isPreview: true })).toEqual({
			mediaId: "media-1-proxy",
			file: asset.proxyFile!,
			url: "blob:proxy",
		});
		expect(getMediaAssetPlaybackSource({ asset, isPreview: false })).toEqual({
			mediaId: "media-1",
			file: asset.file,
			url: "blob:original",
		});
	});

	test("falls back to the original when a proxy is disabled or incomplete", () => {
		const asset = videoAsset();
		asset.proxy = { ...asset.proxy!, enabled: false };
		expect(getMediaAssetPlaybackSource({ asset, isPreview: true }).mediaId).toBe(
			"media-1",
		);

		asset.proxy = { ...asset.proxy, enabled: true };
		asset.proxyFile = undefined;
		expect(getMediaAssetPlaybackSource({ asset, isPreview: true }).mediaId).toBe(
			"media-1",
		);
	});

	test("generates stable proxy storage ids and extension-preserving batch names", () => {
		expect(getMediaProxyStorageId({ mediaId: "media-1" })).toBe(
			"media-1-proxy",
		);
		expect(isMediaProxyStorageId({ storageId: "media-1-proxy" })).toBe(true);
		expect(isMediaProxyStorageId({ storageId: "media-1" })).toBe(false);
		expect(
			buildBatchMediaNames({
				assets: [
					videoAsset(),
					{ ...videoAsset(), id: "media-2", name: "B-roll.MOV" },
				],
				prefix: "Scene",
				startIndex: 7,
			}),
		).toEqual([
			{ assetId: "media-1", name: "Scene 007.mov" },
			{ assetId: "media-2", name: "Scene 008.MOV" },
		]);
	});

	test("automatically proxies only browser-incompatible video without a ready proxy", () => {
		expect(
			shouldAutoGenerateProxy({
				asset: {
					...videoAsset(),
					proxy: undefined,
					proxyFile: undefined,
					browserCanDecode: false,
				},
			}),
		).toBe(true);
		expect(
			shouldAutoGenerateProxy({
				asset: { ...videoAsset(), browserCanDecode: false },
			}),
		).toBe(false);
		expect(
			shouldAutoGenerateProxy({
				asset: {
					...videoAsset(),
					type: "audio",
					proxy: undefined,
					proxyFile: undefined,
					browserCanDecode: false,
				},
			}),
		).toBe(false);
		expect(
			shouldAutoGenerateProxy({
				asset: {
					...videoAsset(),
					proxy: undefined,
					proxyFile: undefined,
					browserCanDecode: true,
				},
			}),
		).toBe(false);
	});
});
