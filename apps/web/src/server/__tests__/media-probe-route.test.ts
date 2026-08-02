import { afterEach, describe, expect, test } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET } from "@/app/api/media/[projectId]/[assetId]/probe/route";
import type { RawFfprobeOutput } from "@/media/codec-capabilities";

const originalProjectsRoot = process.env.OPENCUT_PROJECTS_DIR;
const originalFfprobeBinary = process.env.FFPROBE_BIN;
const originalFfmpegBinary = process.env.FFMPEG_BIN;

afterEach(() => {
	if (originalProjectsRoot === undefined) {
		delete process.env.OPENCUT_PROJECTS_DIR;
	} else {
		process.env.OPENCUT_PROJECTS_DIR = originalProjectsRoot;
	}
	if (originalFfprobeBinary === undefined) {
		delete process.env.FFPROBE_BIN;
	} else {
		process.env.FFPROBE_BIN = originalFfprobeBinary;
	}
	if (originalFfmpegBinary === undefined) {
		delete process.env.FFMPEG_BIN;
	} else {
		process.env.FFMPEG_BIN = originalFfmpegBinary;
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
	const fakeFfprobe = path.join(root, "ffprobe");
	await writeFile(
		fakeFfprobe,
		`#!/bin/sh\nprintf '%s' '${JSON.stringify(raw)}'\n`,
	);
	await chmod(fakeFfprobe, 0o755);
	const fakeFfmpeg = path.join(root, "ffmpeg");
	await writeFile(fakeFfmpeg, "#!/bin/sh\nexit 0\n");
	await chmod(fakeFfmpeg, 0o755);

	process.env.OPENCUT_PROJECTS_DIR = root;
	process.env.FFPROBE_BIN = fakeFfprobe;
	process.env.FFMPEG_BIN = fakeFfmpeg;
	return { projectId, assetId };
}

describe("media probe route", () => {
	test("returns normalized metadata and browser compatibility", async () => {
		const fixture = await routeFixture();
		const response = await GET(
			new Request(
				`http://localhost/api/media/${fixture.projectId}/${fixture.assetId}/probe?browserCanDecode=false`,
			),
			{
				params: Promise.resolve(fixture),
			},
		);
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
