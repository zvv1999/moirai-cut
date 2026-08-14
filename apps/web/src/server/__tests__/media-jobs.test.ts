import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	NativeMediaJobService,
	buildProxyFfmpegArgs,
	runNativeTranscode,
	type NativeMediaJob,
	type NativeTranscodeRunner,
} from "@/server/media-jobs";
import { normalizeFfprobe } from "@/media/codec-capabilities";
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

	test("normalizes low-rate VFR sources to an explicit CFR proxy", () => {
		const probe = {
			source: {
				assetId: "asset",
				fileName: "vfr.mp4",
				extension: "mp4",
				mimeType: "video/mp4",
				sizeBytes: 12,
				mtimeMs: 0,
				ctimeMs: 0,
				inode: 1,
				sha256: "b".repeat(64),
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
						codec: "h264",
						codecLongName: null,
						profile: "High",
						level: null,
						pixelFormat: "yuv420p",
						bitDepth: 8,
						width: 1280,
						height: 720,
						sampleAspectRatio: "1:1",
						displayAspectRatio: "16:9",
						rotationDegrees: 0,
						averageFrameRate: 24,
						nominalFrameRate: 30,
						frameRateMode: "variable" as const,
						durationSeconds: 10,
						bitrate: null,
						color: {
							range: "tv",
							space: "bt709",
							transfer: "bt709",
							primaries: "bt709",
							chromaLocation: "left",
						},
						hdr: false,
					},
				],
				audioStreams: [],
				subtitleStreamCount: 0,
			},
			probedAt: "2026-07-29T00:00:00.000Z",
			cacheHit: false,
		} satisfies ProjectMediaProbeResult;
		const args = buildProxyFfmpegArgs({
			inputPath: "/tmp/vfr.mp4",
			outputPath: "/tmp/vfr.proxy.mp4",
			profile: "standard",
			probe,
		});
		expect(args.join(" ")).toContain("fps=24");
	});

	test("converts Display P3 SDR proxies into the BT.709 preview space", () => {
		const probe = {
			source: {
				assetId: "p3-asset",
				fileName: "p3.mp4",
				extension: "mp4",
				mimeType: "video/mp4",
				sizeBytes: 12,
				mtimeMs: 0,
				ctimeMs: 0,
				inode: 1,
				sha256: "c".repeat(64),
			},
			probe: normalizeFfprobe({
				format: { format_name: "mov,mp4", duration: "4" },
				streams: [
					{
						index: 0,
						codec_type: "video",
						codec_name: "hevc",
						profile: "Main 10",
						pix_fmt: "yuv420p10le",
						width: 640,
						height: 360,
						avg_frame_rate: "30/1",
						r_frame_rate: "30/1",
						color_primaries: "smpte432",
						color_transfer: "iec61966-2-1",
						color_space: "bt709",
						color_range: "tv",
					},
				],
			}),
			probedAt: "2026-07-29T00:00:00.000Z",
			cacheHit: false,
		} satisfies ProjectMediaProbeResult;
		const args = buildProxyFfmpegArgs({
			inputPath: "/tmp/p3.mp4",
			outputPath: "/tmp/p3.proxy.mp4",
			profile: "standard",
			probe,
		});

		expect(args.join(" ")).toContain(
			"zscale=p=bt709:t=bt709:m=bt709:r=tv",
		);
	});

	test("native runner parses FFmpeg progress and reports bounded failures", async () => {
		const originalBinary = process.env.FFMPEG_BIN;
		process.env.FFMPEG_BIN = process.execPath;
		const updates: Array<{
			progress: number;
			processedSeconds: number;
		}> = [];
		try {
			await runNativeTranscode({
				args: [
					"-e",
					"process.stdout.write('out_time_us=5000000\\nprogress=continue\\n'); process.stderr.write('diagnostic');",
				],
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

			await expect(
				runNativeTranscode({
					args: [
						"-e",
						"process.stderr.write('intentional failure'); process.exit(7);",
					],
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

	test("native runner terminates and identifies a bounded timeout", async () => {
		const originalBinary = process.env.FFMPEG_BIN;
		process.env.FFMPEG_BIN = process.execPath;
		try {
			await expect(
				runNativeTranscode({
					args: ["-e", "setInterval(() => undefined, 1_000);"],
					inputPath: "/tmp/source.mp4",
					temporaryOutputPath: "/tmp/output.mp4",
					signal: new AbortController().signal,
					durationSeconds: 10,
					timeoutMs: 20,
					onProgress: () => undefined,
				}),
			).rejects.toThrow("timed out after 20 ms");
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

	test("reports encoded display dimensions for rotated phone footage", async () => {
		const source = await fixture();
		const rotatedProbeFile: ProbeFile = async () => ({
			format: { format_name: "mov", duration: "2.7" },
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
					side_data_list: [{ rotation: -90 }],
				},
			],
		});
		const service = new NativeMediaJobService({
			projectsRoot: source.projectsRoot,
			probeFile: rotatedProbeFile,
			transcode: async ({ temporaryOutputPath }) => {
				await writeFile(temporaryOutputPath, "portrait-proxy");
			},
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

		expect(completed.result?.proxy).toMatchObject({
			width: 540,
			height: 960,
		});
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

	test("keeps failed jobs non-terminal until partial output cleanup finishes", async () => {
		const source = await fixture();
		let temporaryOutputPath = "";
		let signalCleanupStarted!: () => void;
		const cleanupStarted = new Promise<void>((resolve) => {
			signalCleanupStarted = resolve;
		});
		let allowCleanup!: () => void;
		const cleanupAllowed = new Promise<void>((resolve) => {
			allowCleanup = resolve;
		});
		const service = new NativeMediaJobService({
			projectsRoot: source.projectsRoot,
			probeFile,
			transcode: async ({ temporaryOutputPath: outputPath }) => {
				temporaryOutputPath = outputPath;
				await writeFile(outputPath, "partial");
				throw new Error("No space left on device");
			},
			removeTemporaryOutput: async (outputPath) => {
				signalCleanupStarted();
				await cleanupAllowed;
				await rm(outputPath, { force: true });
			},
		});
		const queued = await service.ensureProxy({
			projectId: source.projectId,
			assetId: source.assetId,
		});
		await cleanupStarted;
		try {
			expect(
				await service.get({
					projectId: source.projectId,
					jobId: queued.id,
				}),
			).toMatchObject({ status: "running" });
		} finally {
			allowCleanup();
		}
		const terminal = await service.waitForTerminal({
			projectId: source.projectId,
			jobId: queued.id,
		});
		expect(terminal).toMatchObject({
			status: "failed",
			error: { message: "No space left on device" },
		});
		await expect(stat(temporaryOutputPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("recovers interrupted jobs and persists their terminal status", async () => {
		const source = await fixture();
		const jobsDirectory = path.join(
			source.projectsRoot,
			source.projectId,
			"codec-jobs",
		);
		await mkdir(jobsDirectory, { recursive: true });
		const jobsFile = path.join(jobsDirectory, "index.json");
		await writeFile(
			jobsFile,
			JSON.stringify([
				{
					id: "interrupted-job",
					kind: "proxy",
					projectId: source.projectId,
					assetId: source.assetId,
					profile: "standard",
					cacheKey: "hash:standard",
					status: "running",
					progress: 0.4,
					processedSeconds: 4,
					createdAt: "2026-07-29T00:00:00.000Z",
					updatedAt: "2026-07-29T00:00:01.000Z",
				},
			]),
		);
		const service = new NativeMediaJobService({
			projectsRoot: source.projectsRoot,
			probeFile,
		});

		expect(await service.list({ projectId: source.projectId })).toMatchObject([
			{
				id: "interrupted-job",
				status: "failed",
				error: { code: "interrupted" },
			},
		]);
		const persisted = JSON.parse(await readFile(jobsFile, "utf8"));
		expect(persisted[0]).toMatchObject({
			status: "failed",
			error: { code: "interrupted" },
		});
	});

	test("bounds concurrent transcodes and preserves every proxy metadata update", async () => {
		const source = await fixture();
		const indexPath = path.join(source.mediaDirectory, "index.json");
		const index = JSON.parse(await readFile(indexPath, "utf8"));
		for (const assetId of ["asset-jobs-2", "asset-jobs-3"]) {
			index[assetId] = {
				...index[source.assetId],
				id: assetId,
				name: `${assetId}.mp4`,
			};
			await writeFile(
				path.join(source.mediaDirectory, `${assetId}.mp4`),
				`source-${assetId}`,
			);
		}
		await writeFile(indexPath, JSON.stringify(index));

		let active = 0;
		let maximumActive = 0;
		let started = 0;
		let releaseFirstWave!: () => void;
		const firstWaveStarted = new Promise<void>((resolve) => {
			releaseFirstWave = resolve;
		});
		const transcode: NativeTranscodeRunner = async ({
			temporaryOutputPath,
		}) => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await writeFile(temporaryOutputPath, "proxy");
			started += 1;
			if (started === 2) {
				releaseFirstWave();
			}
			await firstWaveStarted;
			active -= 1;
		};
		const service = new NativeMediaJobService({
			projectsRoot: source.projectsRoot,
			probeFile,
			transcode,
			maxConcurrent: 2,
		});
		const queued = await Promise.all(
			[source.assetId, "asset-jobs-2", "asset-jobs-3"].map((assetId) =>
				service.ensureProxy({
					projectId: source.projectId,
					assetId,
				}),
			),
		);
		await Promise.all(
			queued.map((job) =>
				service.waitForTerminal({
					projectId: source.projectId,
					jobId: job.id,
				}),
			),
		);

		expect(maximumActive).toBe(2);
		const persisted = JSON.parse(
			await readFile(
				path.join(
					source.projectsRoot,
					source.projectId,
					"codec-jobs",
					"index.json",
				),
				"utf8",
			),
		);
		expect(persisted).toHaveLength(3);
		expect(persisted.map((job: NativeMediaJob) => job.id).sort()).toEqual(
			queued.map((job) => job.id).sort(),
		);
		const mediaIndex = JSON.parse(await readFile(indexPath, "utf8"));
		for (const assetId of [source.assetId, "asset-jobs-2", "asset-jobs-3"]) {
			expect(mediaIndex[assetId].proxy).toMatchObject({
				storageId: `${assetId}-proxy`,
			});
			expect(mediaIndex[`${assetId}-proxy`]).toMatchObject({
				id: `${assetId}-proxy`,
			});
		}
	});
});
