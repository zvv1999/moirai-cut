import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	probeProjectMedia,
	runFfprobe,
	type ProbeFile,
} from "@/server/media-probe";
import type { RawFfprobeOutput } from "@/media/codec-capabilities";

const rawProbe: RawFfprobeOutput = {
	format: {
		format_name: "mov,mp4,m4a,3gp,3g2,mj2",
		duration: "4",
		size: "1024",
	},
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
		{
			index: 1,
			codec_type: "audio",
			codec_name: "aac",
			sample_rate: "48000",
			channels: 2,
		},
	],
};

async function fixture() {
	const projectsRoot = await mkdtemp(path.join(tmpdir(), "opencut-probe-"));
	const projectId = "project-1";
	const assetId = "asset-1";
	const mediaDirectory = path.join(projectsRoot, projectId, "media");
	await mkdir(mediaDirectory, { recursive: true });
	await writeFile(
		path.join(mediaDirectory, "index.json"),
		JSON.stringify({
			[assetId]: { ext: "mp4", mimeType: "video/mp4", name: "Main10.mp4" },
		}),
	);
	await writeFile(path.join(mediaDirectory, `${assetId}.mp4`), "first-version");
	return { projectsRoot, projectId, assetId, mediaDirectory };
}

describe("project media probe", () => {
	test("normalizes FFprobe output and reuses a warm cache without rerunning FFprobe", async () => {
		const source = await fixture();
		let invocations = 0;
		const probeFile: ProbeFile = async ({ filePath }) => {
			invocations += 1;
			expect(filePath).toBe(
				path.join(source.mediaDirectory, `${source.assetId}.mp4`),
			);
			return rawProbe;
		};

		const cold = await probeProjectMedia({ ...source, probeFile });
		const warm = await probeProjectMedia({ ...source, probeFile });

		expect(cold.cacheHit).toBe(false);
		expect(cold.source).toMatchObject({
			assetId: source.assetId,
			fileName: "Main10.mp4",
			extension: "mp4",
			mimeType: "video/mp4",
			sizeBytes: 13,
		});
		expect(cold.source.sha256).toHaveLength(64);
		expect(cold.probe.videoStreams[0]).toMatchObject({
			codec: "hevc",
			bitDepth: 10,
		});
		expect(warm.cacheHit).toBe(true);
		expect(warm.probe).toEqual(cold.probe);
		expect(invocations).toBe(1);

		const cache = JSON.parse(
			await readFile(
				path.join(
					source.mediaDirectory,
					".codec-cache",
					`${source.assetId}.probe.json`,
				),
				"utf8",
			),
		);
		expect(cache.source.sha256).toBe(cold.source.sha256);
	});

	test("invalidates the cache when the source is replaced", async () => {
		const source = await fixture();
		let invocations = 0;
		const probeFile: ProbeFile = async () => {
			invocations += 1;
			return rawProbe;
		};

		await probeProjectMedia({ ...source, probeFile });
		await Bun.sleep(5);
		await writeFile(
			path.join(source.mediaDirectory, `${source.assetId}.mp4`),
			"second-version-is-longer",
		);
		const replaced = await probeProjectMedia({ ...source, probeFile });

		expect(replaced.cacheHit).toBe(false);
		expect(replaced.source.sizeBytes).toBe(24);
		expect(invocations).toBe(2);
	});

	test("honors force refresh and recovers from a malformed cache file", async () => {
		const source = await fixture();
		let invocations = 0;
		const probeFile: ProbeFile = async () => {
			invocations += 1;
			return rawProbe;
		};

		await probeProjectMedia({ ...source, probeFile });
		const forced = await probeProjectMedia({
			...source,
			probeFile,
			force: true,
		});
		expect(forced.cacheHit).toBe(false);
		await writeFile(
			path.join(
				source.mediaDirectory,
				".codec-cache",
				`${source.assetId}.probe.json`,
			),
			"{broken",
		);
		const recovered = await probeProjectMedia({ ...source, probeFile });

		expect(recovered.cacheHit).toBe(false);
		expect(invocations).toBe(3);
	});

	test("invokes FFprobe as an argument-array process and parses JSON output", async () => {
		const calls: Array<{ binary: string; args: string[] }> = [];

		const result = await runFfprobe({
			filePath: "/tmp/a file;still-one-argument.mp4",
			ffprobeBinary: "ffprobe-test-double",
			run: async ({ binary, args }) => {
				calls.push({ binary, args });
				return JSON.stringify(rawProbe);
			},
		});

		expect(result.streams?.[0]?.codec_name).toBe("hevc");
		expect(calls).toEqual([
			{
				binary: "ffprobe-test-double",
				args: [
					"-v",
					"error",
					"-show_format",
					"-show_streams",
					"-of",
					"json",
					"/tmp/a file;still-one-argument.mp4",
				],
			},
		]);
	});

	test("rejects unsafe identifiers before touching the filesystem", async () => {
		const source = await fixture();
		const probeFile: ProbeFile = async () => rawProbe;

		await expect(
			probeProjectMedia({
				...source,
				projectId: "../escape",
				probeFile,
			}),
		).rejects.toThrow("Unsafe project id");
		await expect(
			probeProjectMedia({
				...source,
				assetId: "../../escape",
				probeFile,
			}),
		).rejects.toThrow("Unsafe asset id");
	});

	test("reports missing assets and unsafe extensions", async () => {
		const source = await fixture();
		const probeFile: ProbeFile = async () => rawProbe;
		await expect(
			probeProjectMedia({
				...source,
				assetId: "not-there",
				probeFile,
			}),
		).rejects.toThrow("No asset not-there");

		await writeFile(
			path.join(source.mediaDirectory, "index.json"),
			JSON.stringify({
				[source.assetId]: { ext: "../mov", name: "unsafe.mov" },
			}),
		);
		await expect(
			probeProjectMedia({ ...source, probeFile }),
		).rejects.toThrow("Unsafe extension");
	});
});
