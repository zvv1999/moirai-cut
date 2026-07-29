import { describe, expect, test } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	NativeMediaJobService,
	buildProxyFfmpegArgs,
	runNativeTranscode,
	type NativeTranscodeRunner,
} from "@/server/media-jobs";
import type {
	ProbeFile,
	ProjectMediaProbeResult,
} from "@/server/media-probe";

async function fixture() {
	const projectsRoot = await mkdtemp(path.join(tmpdir(), "opencut-jobs-"));
	const projectId = "project-jobs";
	const assetId = "asset-jobs";
	const mediaDirectory = path.join(projectsRoot, projectId, "media");
	await mkdir(mediaDirectory, { recursive: true });
	await writeFile(
		path.join(mediaDirectory, "index.json"),
		JSON.stringify({
			[assetId]: {
				id: assetId,
				ext: "mp4",
				mimeType: "video/mp4",
				name: "Source.mp4",
				type: "video",
				size: 12,
				lastModified: 100,
			},
		}),
	);
	await writeFile(path.join(mediaDirectory, `${assetId}.mp4`), "source-bytes");
	return { projectsRoot, projectId, assetId, mediaDirectory };
}

const probeFile: ProbeFile = async () => ({
	format: { format_name: "mov,mp4", duration: "10" },
	streams: [
		{
			index: 0,
			codec_type: "video",
			codec_name: "hevc",
			profile: "Main 10",
			pix_fmt: "yuv420p10le",
			width: 1920,
			height: 1080,
			avg_frame_rate: "60/1",
			r_frame_rate: "60/1",
			color_primaries: "bt2020",
			color_transfer: "smpte2084",
			color_space: "bt2020nc",
		},
		{
			index: 1,
			codec_type: "audio",
			codec_name: "aac",
			sample_rate: "48000",
			channels: 2,
		},
	],
});

describe("proxy command construction", () => {
	test("uses an argument array, even dimensions, FPS cap, fast-start, and HDR tone mapping", () => {
		const args = buildProxyFfmpegArgs({
			inputPath: "/tmp/source;not-shell.mp4",
			outputPath: "/tmp/proxy output.tmp.mp4",
			profile: "standard",
			probe: {
				source: {
					assetId: "asset",
					fileName: "source.mp4",
					extension: "mp4",
					mimeType: "video/mp4",
					sizeBytes: 12,
					mtimeMs: 0,
					ctimeMs: 0,
					inode: 1,
					sha256: "a".repeat(64),
				},
				probe: {
					container: {
						formatNames: ["mov", "mp4"],
						durationSeconds: 10,
						sizeBytes: 12,
						bitrate: null,
						startTimeSeconds: null,
					},
					videoStreams: [
						{
							index: 0,
							codec: "hevc",
							codecLongName: null,
							profile: "Main 10",
							level: null,
							pixelFormat: "yuv420p10le",
							bitDepth: 10,
							width: 1920,
							height: 1080,
							sampleAspectRatio: "1:1",
							displayAspectRatio: "16:9",
							rotationDegrees: 0,
							averageFrameRate: 60,
							nominalFrameRate: 60,
							frameRateMode: "constant",
							durationSeconds: 10,
							bitrate: null,
							color: {
								range: "tv",
								space: "bt2020nc",
								transfer: "smpte2084",
								primaries: "bt2020",
								chromaLocation: "left",
							},
							hdr: true,
						},
					],
					audioStreams: [],
					subtitleStreamCount: 0,
				},
				probedAt: "2026-07-29T00:00:00.000Z",
				cacheHit: false,
			} satisfies ProjectMediaProbeResult,
		});

		expect(args).toContain("/tmp/source;not-shell.mp4");
		expect(args).toContain("/tmp/proxy output.tmp.mp4");
		expect(args).toContain("+faststart");
		expect(args).toContain("yuv420p");
		expect(args.join(" ")).toContain("min(960");
		expect(args.join(" ")).toContain("fps=30");
		expect(args.join(" ")).toContain("tonemap");
	});

	test("native runner parses FFmpeg progress and reports bounded failures", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "opencut-fake-transcoder-"),
		);
		const binary = path.join(directory, "ffmpeg");
		await writeFile(
			binary,
			"#!/bin/sh\nprintf 'out_time_us=5000000\\nprogress=continue\\n'\nprintf 'diagnostic' >&2\nexit 0\n",
		);
		await chmod(binary, 0o755);
		const originalBinary = process.env.FFMPEG_BIN;
		process.env.FFMPEG_BIN = binary;
		const updates: Array<{
			progress: number;
			processedSeconds: number;
		}> = [];
		try {
			await runNativeTranscode({
				args: [],
				inputPath: "/tmp/source.mp4",
				temporaryOutputPath: "/tmp/output.mp4",
				signal: new AbortController().signal,
				durationSeconds: 10,
				onProgress: (update) => updates.push(update),
			});
			expect(updates).toContainEqual({
				progress: 0.5,
				processedSeconds: 5,
			});

			await writeFile(
				binary,
				"#!/bin/sh\nprintf 'intentional failure' >&2\nexit 7\n",
			);
			await expect(
				runNativeTranscode({
					args: [],
					inputPath: "/tmp/source.mp4",
					temporaryOutputPath: "/tmp/output.mp4",
					signal: new AbortController().signal,
					durationSeconds: 10,
					onProgress: () => undefined,
				}),
			).rejects.toThrow("intentional failure");
		} finally {
			if (originalBinary === undefined) {
				delete process.env.FFMPEG_BIN;
			} else {
				process.env.FFMPEG_BIN = originalBinary;
			}
		}
	});
});

describe("native media proxy jobs", () => {
	test("persists progress, attaches proxy metadata, and reuses the verified cache", async () => {
		const source = await fixture();
		let transcodes = 0;
		const transcode: NativeTranscodeRunner = async ({
			temporaryOutputPath,
			onProgress,
		}) => {
			transcodes += 1;
			onProgress({ progress: 0.4, processedSeconds: 4 });
			await writeFile(temporaryOutputPath, "proxy-bytes");
			onProgress({ progress: 1, processedSeconds: 10 });
		};
		const service = new NativeMediaJobService({
			projectsRoot: source.projectsRoot,
			probeFile,
			transcode,
		});

		const queued = await service.ensureProxy({
			projectId: source.projectId,
			assetId: source.assetId,
			profile: "standard",
		});
		const completed = await service.waitForTerminal({
			projectId: source.projectId,
			jobId: queued.id,
		});

		expect(completed.status).toBe("succeeded");
		expect(completed.progress).toBe(1);
		expect(completed.result?.proxy).toMatchObject({
			storageId: `${source.assetId}-proxy`,
			mimeType: "video/mp4",
			width: 960,
			height: 540,
			enabled: true,
			profile: "standard",
		});
		const index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		expect(index[source.assetId].proxy.storageId).toBe(
			`${source.assetId}-proxy`,
		);
		await expect(
			stat(
				path.join(
					source.mediaDirectory,
					`${source.assetId}-proxy.mp4`,
				),
			),
		).resolves.toBeDefined();

		const reused = await service.ensureProxy({
			projectId: source.projectId,
			assetId: source.assetId,
			profile: "standard",
		});
		expect(reused.id).toBe(completed.id);
		expect(reused.cacheHit).toBe(true);
		expect(transcodes).toBe(1);
	});

	test("cancels the worker and removes its temporary output", async () => {
		const source = await fixture();
		let temporaryOutputPath = "";
		const transcode: NativeTranscodeRunner = async ({
			temporaryOutputPath: outputPath,
			signal,
		}) => {
			temporaryOutputPath = outputPath;
			await writeFile(outputPath, "partial");
			await new Promise<void>((_resolve, reject) => {
				signal.addEventListener(
					"abort",
					() => reject(new DOMException("Cancelled", "AbortError")),
					{ once: true },
				);
			});
		};
		const service = new NativeMediaJobService({
			projectsRoot: source.projectsRoot,
			probeFile,
			transcode,
		});
		const queued = await service.ensureProxy({
			projectId: source.projectId,
			assetId: source.assetId,
			profile: "draft",
		});
		await service.waitForStatus({
			projectId: source.projectId,
			jobId: queued.id,
			status: "running",
		});
		const cancelled = await service.cancel({
			projectId: source.projectId,
			jobId: queued.id,
		});
		const terminal = await service.waitForTerminal({
			projectId: source.projectId,
			jobId: queued.id,
		});

		expect(cancelled.status).toBe("cancelled");
		expect(terminal.status).toBe("cancelled");
		await expect(stat(temporaryOutputPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
