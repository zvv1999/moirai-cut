import { describe, expect, test } from "bun:test";
import {
	buildPortableProjectManifest,
	collectPortableProjectCompanions,
	validatePortableProjectManifest,
} from "@/project/portable-package";

describe("portable project packages", () => {
	test("records project, originals or proxies, fonts, and captions in a validated manifest", () => {
		const companions = collectPortableProjectCompanions({
			tracks: [
				{
					id: "text",
					type: "text",
					elements: [
						{
							id: "caption",
							name: "Caption 1",
							type: "text",
							params: {
								content: "Hello",
								fontFamily: "Inter",
								"caption.enabled": true,
							},
						},
					],
				},
			],
		});
		const manifest = buildPortableProjectManifest({
			projectId: "project-1",
			projectName: "Reed cut",
			revision: 12,
			createdAt: "2026-07-28T00:00:00.000Z",
			mediaMode: "originals-and-proxies",
			files: [
				{ path: "project.json", sizeBytes: 1200, role: "project" },
				{ path: "media/video.mp4", sizeBytes: 9000, role: "original" },
				{ path: "media/video.proxy.mp4", sizeBytes: 1000, role: "proxy" },
				{ path: "captions/captions.json", sizeBytes: 90, role: "captions" },
				{ path: "fonts/font-manifest.json", sizeBytes: 40, role: "fonts" },
			],
			...companions,
		});

		expect(validatePortableProjectManifest(manifest)).toEqual({
			ok: true,
			errors: [],
		});
		expect(manifest.fonts).toEqual(["Inter"]);
		expect(manifest.captionCount).toBe(1);
	});

	test("rejects path traversal, missing project data, and mismatched totals", () => {
		const manifest = buildPortableProjectManifest({
			projectId: "project-1",
			projectName: "Unsafe",
			revision: 1,
			createdAt: "2026-07-28T00:00:00.000Z",
			mediaMode: "originals",
			fonts: [],
			captionCount: 0,
			files: [
				{ path: "../project.json", sizeBytes: 10, role: "project" },
				{ path: "media/a.mp4", sizeBytes: -1, role: "original" },
			],
		});

		expect(validatePortableProjectManifest(manifest)).toEqual({
			ok: false,
			errors: [
				"Package paths must stay inside the archive",
				"Package must contain project.json",
				"Package file sizes must be non-negative integers",
				"Package byte total does not match its file entries",
			],
		});
	});
});
