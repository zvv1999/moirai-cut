#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { NativeMediaJobService } from "../src/server/media-jobs";

const inputPath = path.resolve(
	process.argv[2] ?? "/tmp/opencut-codec-fixtures/hevc-main10-aac.mp4",
);
const projectsRoot = path.resolve(
	process.argv[3] ?? "/tmp/opencut-native-proxy-verification",
);
const reportPath = path.resolve(
	process.argv[4] ??
		path.join(projectsRoot, "native-proxy-verification.json"),
);
const projectId = "codec-verification";
const assetId = "hevc-main10";
const mediaDirectory = path.join(projectsRoot, projectId, "media");
const sourcePath = path.join(mediaDirectory, `${assetId}.mp4`);

await mkdir(mediaDirectory, { recursive: true });
await copyFile(inputPath, sourcePath);
const sourceStat = await stat(sourcePath);
await writeFile(
	path.join(mediaDirectory, "index.json"),
	`${JSON.stringify(
		{
			[assetId]: {
				id: assetId,
				ext: "mp4",
				mimeType: "video/mp4",
				name: path.basename(inputPath),
				type: "video",
				size: sourceStat.size,
				lastModified: sourceStat.mtimeMs,
			},
		},
		null,
		2,
	)}\n`,
);

const service = new NativeMediaJobService({ projectsRoot });
const startedAt = performance.now();
const queued = await service.ensureProxy({
	projectId,
	assetId,
	profile: "standard",
	force: true,
});
const completed = await service.waitForTerminal({
	projectId,
	jobId: queued.id,
	timeoutMs: 120_000,
});
const elapsedMs = performance.now() - startedAt;
if (completed.status !== "succeeded" || !completed.result) {
	throw new Error(
		completed.error?.message ??
			`Native proxy verification ended as ${completed.status}`,
	);
}

const ffprobe = spawnSync(
	process.env.FFPROBE_BIN ?? "ffprobe",
	[
		"-v",
		"error",
		"-show_format",
		"-show_streams",
		"-of",
		"json",
		completed.result.outputPath,
	],
	{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
if (ffprobe.status !== 0) {
	throw new Error(ffprobe.stderr || "FFprobe verification failed");
}

const sourceProbe = JSON.parse(
	await readFile(
		path.join(
			mediaDirectory,
			".codec-cache",
			`${assetId}.probe.json`,
		),
		"utf8",
	),
);
const outputProbe = JSON.parse(ffprobe.stdout);
const durationSeconds = Number(outputProbe.format?.duration ?? 0);
const outputVideo = outputProbe.streams?.find(
	(stream: { codec_type?: string }) => stream.codec_type === "video",
);
const outputAudio = outputProbe.streams?.find(
	(stream: { codec_type?: string }) => stream.codec_type === "audio",
);
const report = {
	generatedAt: new Date().toISOString(),
	inputPath,
	projectsRoot,
	job: completed,
	metrics: {
		elapsedMs: Number(elapsedMs.toFixed(2)),
		durationSeconds,
		realtimeMultiplier:
			elapsedMs > 0
				? Number(
						(durationSeconds / (elapsedMs / 1000)).toFixed(3),
					)
				: null,
	},
	source: sourceProbe,
	output: {
		formatNames: String(outputProbe.format?.format_name ?? "").split(","),
		codec: outputVideo?.codec_name ?? null,
		pixelFormat: outputVideo?.pix_fmt ?? null,
		width: outputVideo?.width ?? null,
		height: outputVideo?.height ?? null,
		frameRate: outputVideo?.avg_frame_rate ?? null,
		audioCodec: outputAudio?.codec_name ?? null,
		sampleRate: outputAudio?.sample_rate ?? null,
	},
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
