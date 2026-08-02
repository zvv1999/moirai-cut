import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	GET,
	handleMediaProbeRequest,
} from "@/app/api/media/[projectId]/[assetId]/probe/route";
import type { RawFfprobeOutput } from "@/media/codec-capabilities";

const originalProjectsRoot = process.env.OPENCUT_PROJECTS_DIR;

afterEach(() => {
	if (originalProjectsRoot === undefined) {
		delete process.env.OPENCUT_PROJECTS_DIR;
	} else {
		process.env.OPENCUT_PROJECTS_DIR = originalProjectsRoot;
	}
});

async function routeFixture() {
	const root = await mkdtemp(path.join(tmpdir(), "opencut-probe-route-"));
	const projectId = "project-route";
	const assetId = "asset-route";
	const mediaDirectory = path.join(root, projectId, "media");
	await mkdir(mediaDirectory, { recursive: true });
	await writeFile(
		path.join(mediaDirectory, "index.json"),
		JSON.stringify({
			[assetId]: {
				ext: "mp4",
				mimeType: "video/mp4",
				name: "HEVC Main10.mp4",
			},
		}),
	);
	await writeFile(path.join(mediaDirectory, `${assetId}.mp4`), "media");

	const raw: RawFfprobeOutput = {
		format: { format_name: "mov,mp4", duration: "4" },
		streams: [
			{
				index: 0,
				codec_type: "video",
				codec_name: "hevc",
				profile: "Main 10",
				pix_fmt: "yuv420p10le",
				width: 1920,
				height: 1080,
				avg_frame_rate: "30/1",
				r_frame_rate: "30/1",
			},
		],
	};
	process.env.OPENCUT_PROJECTS_DIR = root;
	return { projectId, assetId, raw };
}

describe("media probe route", () => {
	test("returns normalized metadata and browser compatibility", async () => {
		const fixture = await routeFixture();
		const response = await handleMediaProbeRequest({
			request: new Request(
				`http://localhost/api/media/${fixture.projectId}/${fixture.assetId}/probe?browserCanDecode=false`,
			),
			context: {
				params: Promise.resolve(fixture),
			},
			probeFile: async () => fixture.raw,
			checkNativeTranscode: async () => true,
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.probe.videoStreams[0]).toMatchObject({
			codec: "hevc",
			bitDepth: 10,
		});
		expect(body.data.compatibility).toEqual({
			kind: "proxy-required",
			reasonCodes: ["browser-codec-unsupported"],
		});
		expect(body.data.nativeTranscodeAvailable).toBe(true);
	});

	test("returns a stable client error for unsafe identifiers", async () => {
		const response = await GET(
			new Request("http://localhost/api/media/unsafe/asset/probe"),
			{
				params: Promise.resolve({
					projectId: "../unsafe",
					assetId: "asset",
				}),
			},
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error.code).toBe("media_probe_failed");
		expect(body.error.message).toContain("Unsafe project id");
	});
});
