#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const fixtureDirectory = resolve(
	process.argv[2] ?? readFileSync("/tmp/opencut-codec-fixture-dir.txt", "utf8").trim(),
);
const outputPath = resolve(
	process.argv[3] ?? join(fixtureDirectory, "codec-baseline.json"),
);
const ffmpeg = process.env.FFMPEG_BIN ?? "ffmpeg";
const ffprobe = process.env.FFPROBE_BIN ?? "ffprobe";

function run(command, args, { allowFailure = false } = {}) {
	const startedAt = performance.now();
	const result = spawnSync(command, args, {
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
	const elapsedMs = performance.now() - startedAt;
	if (!allowFailure && result.status !== 0) {
		throw new Error(
			`${command} failed (${result.status}): ${result.stderr || result.stdout}`,
		);
	}
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		elapsedMs,
	};
}

function probe(filePath) {
	const result = run(ffprobe, [
		"-v",
		"error",
		"-show_format",
		"-show_streams",
		"-of",
		"json",
		filePath,
	]);
	return {
		elapsedMs: result.elapsedMs,
		data: JSON.parse(result.stdout),
	};
}

function firstLine(command, args) {
	const result = run(command, args);
	return result.stdout.split(/\r?\n/, 1)[0] ?? "";
}

function parseSsim(stderr) {
	const matches = [...stderr.matchAll(/All:([0-9.]+)/g)];
	return matches.length ? Number(matches.at(-1)[1]) : null;
}

function parsePsnr(stderr) {
	const matches = [...stderr.matchAll(/average:([0-9.]+)/g)];
	return matches.length ? Number(matches.at(-1)[1]) : null;
}

const mediaExtensions = new Set([
	".mp4",
	".mov",
	".webm",
	".wav",
	".m4a",
	".mp3",
	".flac",
	".ogg",
]);
const fixtureFiles = readdirSync(fixtureDirectory)
	.filter((name) => {
		const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
		return mediaExtensions.has(extension) && name !== "corrupt.mp4";
	})
	.sort();

const probeResults = fixtureFiles.map((name) => {
	const result = probe(join(fixtureDirectory, name));
	const video = result.data.streams?.find((stream) => stream.codec_type === "video");
	const audio = result.data.streams?.find((stream) => stream.codec_type === "audio");
	return {
		name,
		elapsedMs: Number(result.elapsedMs.toFixed(2)),
		durationSeconds: Number(result.data.format?.duration ?? 0),
		video: video
			? {
					codec: video.codec_name,
					profile: video.profile,
					pixelFormat: video.pix_fmt,
					width: video.width,
					height: video.height,
					averageFrameRate: video.avg_frame_rate,
					realFrameRate: video.r_frame_rate,
				}
			: null,
		audio: audio
			? {
					codec: audio.codec_name,
					profile: audio.profile,
					sampleRate: Number(audio.sample_rate ?? 0),
					channels: audio.channels,
				}
			: null,
	};
});

const benchmarkDirectory = join(fixtureDirectory, ".benchmark");
mkdirSync(benchmarkDirectory, { recursive: true });
const proxyInput = join(fixtureDirectory, "hevc-main10-aac.mp4");
const proxyOutput = join(benchmarkDirectory, "hevc-main10.proxy.mp4");
const proxyResult = run(ffmpeg, [
	"-hide_banner",
	"-loglevel",
	"error",
	"-y",
	"-i",
	proxyInput,
	"-map",
	"0:v:0",
	"-map",
	"0:a:0?",
	"-vf",
	"scale=w='if(gt(iw,ih),min(960,iw),-2)':h='if(gt(iw,ih),-2,min(960,ih))'",
	"-c:v",
	"libx264",
	"-preset",
	"veryfast",
	"-crf",
	"18",
	"-pix_fmt",
	"yuv420p",
	"-g",
	"30",
	"-c:a",
	"aac",
	"-b:a",
	"160k",
	"-movflags",
	"+faststart",
	proxyOutput,
]);
const proxyProbe = probe(proxyOutput);
const proxyDuration = Number(proxyProbe.data.format?.duration ?? 0);

const ssimResult = run(
	ffmpeg,
	[
		"-hide_banner",
		"-i",
		proxyOutput,
		"-i",
		proxyInput,
		"-lavfi",
		"[0:v][1:v]ssim",
		"-f",
		"null",
		"-",
	],
	{ allowFailure: true },
);
const psnrResult = run(
	ffmpeg,
	[
		"-hide_banner",
		"-i",
		proxyOutput,
		"-i",
		proxyInput,
		"-lavfi",
		"[0:v][1:v]psnr",
		"-f",
		"null",
		"-",
	],
	{ allowFailure: true },
);

const probeTimes = probeResults.map((result) => result.elapsedMs).sort((a, b) => a - b);
const p95Index = Math.max(0, Math.ceil(probeTimes.length * 0.95) - 1);
const report = {
	generatedAt: new Date().toISOString(),
	fixtureDirectory,
	system: {
		platform: process.platform,
		architecture: process.arch,
		node: process.version,
		ffmpeg: firstLine(ffmpeg, ["-version"]),
		ffprobe: firstLine(ffprobe, ["-version"]),
	},
	probe: {
		count: probeResults.length,
		p95Ms: probeTimes[p95Index] ?? null,
		results: probeResults,
	},
	proxy: {
		input: basename(proxyInput),
		output: basename(proxyOutput),
		elapsedMs: Number(proxyResult.elapsedMs.toFixed(2)),
		durationSeconds: proxyDuration,
		realtimeMultiplier:
			proxyResult.elapsedMs > 0
				? Number((proxyDuration / (proxyResult.elapsedMs / 1000)).toFixed(3))
				: null,
		ssim: parseSsim(ssimResult.stderr),
		psnrDb: parsePsnr(psnrResult.stderr),
	},
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
