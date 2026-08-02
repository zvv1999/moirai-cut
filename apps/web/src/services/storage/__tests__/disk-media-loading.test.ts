import { afterEach, describe, expect, test } from "bun:test";
import { storageService } from "@/services/storage/service";

const originalFetch = globalThis.fetch;
const originalProjectFiles = process.env.NEXT_PUBLIC_OPENCUT_PROJECT_FILES;

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalProjectFiles === undefined) {
		delete process.env.NEXT_PUBLIC_OPENCUT_PROJECT_FILES;
	} else {
		process.env.NEXT_PUBLIC_OPENCUT_PROJECT_FILES = originalProjectFiles;
	}
});

describe("disk-backed media loading", () => {
	test("reads the media index once and loads asset bytes concurrently", async () => {
		process.env.NEXT_PUBLIC_OPENCUT_PROJECT_FILES = "1";
		const requests: string[] = [];
		const index = {
			"media-a": {
				id: "media-a",
				name: "A 片段.mp4",
				type: "video",
				size: 4,
				lastModified: 100,
				width: 1920,
				height: 1080,
				duration: 2,
				ext: "mp4",
				mimeType: "video/mp4",
			},
			"media-b": {
				id: "media-b",
				name: "B 片段.mp4",
				type: "video",
				size: 4,
				lastModified: 200,
				width: 1280,
				height: 720,
				duration: 2,
				ext: "mp4",
				mimeType: "video/mp4",
			},
		};
		let activeAssetRequests = 0;
		let peakAssetRequests = 0;
		globalThis.fetch = Object.assign(
			async (input: RequestInfo | URL) => {
				const url = String(input);
				requests.push(url);
				if (url === "/api/media/project-media") {
					return Response.json({ assets: index });
				}
				const id = url.split("/").at(-1);
				const entry = id === "media-a" ? index["media-a"] : index["media-b"];
				activeAssetRequests += 1;
				peakAssetRequests = Math.max(peakAssetRequests, activeAssetRequests);
				await Promise.resolve();
				activeAssetRequests -= 1;
				return new Response(new Blob(["data"], { type: "video/mp4" }), {
					headers: {
						"x-opencut-media-name": encodeURIComponent(entry.name),
						"x-opencut-media-last-modified": String(entry.lastModified),
					},
				});
			},
			{ preconnect: originalFetch.preconnect },
		);

		const assets = await storageService.loadAllMediaAssets({
			projectId: "project-media",
		});

		expect(requests.filter((url) => url === "/api/media/project-media")).toHaveLength(
			1,
		);
		expect(peakAssetRequests).toBeGreaterThan(1);
		expect(assets.map((asset) => asset.file.name)).toEqual([
			"A 片段.mp4",
			"B 片段.mp4",
		]);
	});
});
