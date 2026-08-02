#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
	DELIVERY_PRESET_NAMES,
	transcodeProjectExport,
	type DeliveryPresetName,
} from "../src/server/native-delivery";

const sourcePath = path.resolve(process.argv[2]);
const projectsRoot = path.resolve(
	process.argv[3] ?? "/tmp/opencut-native-delivery-verification",
);
const requested = process.argv[4]?.split(",").filter(Boolean);
const presets = (requested?.length
	? requested
	: DELIVERY_PRESET_NAMES) as DeliveryPresetName[];
const projectId = "delivery-verification";
const sourceName = path.basename(sourcePath);
const exportsDirectory = path.join(
	projectsRoot,
	projectId,
	"exports",
);
await mkdir(exportsDirectory, { recursive: true });
await copyFile(sourcePath, path.join(exportsDirectory, sourceName));

function metrics({
	outputPath,
}: {
	outputPath: string;
}): { ssim: number | null; psnrDb: number | null } {
	const result = spawnSync(
		process.env.FFMPEG_BIN ?? "ffmpeg",
		[
			"-hide_banner",
			"-i",
			outputPath,
			"-i",
			sourcePath,
			"-lavfi",
			"[0:v][1:v]ssim;[0:v][1:v]psnr",
			"-f",
			"null",
			"-",
		],
		{ encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
	);
	const ssimMatches = [
		...result.stderr.matchAll(/All:([0-9.]+)/g),
	];
	const psnrMatches = [
		...result.stderr.matchAll(/average:([0-9.]+)/g),
	];
	return {
		ssim: ssimMatches.length
			? Number(ssimMatches.at(-1)?.[1])
			: null,
		psnrDb: psnrMatches.length
			? Number(psnrMatches.at(-1)?.[1])
			: null,
	};
}

const results = [];
for (const preset of presets) {
	const startedAt = performance.now();
	try {
		const result = await transcodeProjectExport({
			projectId,
			sourceName,
			preset,
			projectsRoot,
		});
		const elapsedMs = performance.now() - startedAt;
		results.push({
			preset,
			status: "passed",
			elapsedMs: Number(elapsedMs.toFixed(2)),
			realtimeMultiplier:
				result.probe.container.durationSeconds &&
				elapsedMs > 0
					? Number(
							(
								result.probe.container.durationSeconds /
								(elapsedMs / 1000)
							).toFixed(3),
						)
					: null,
			outputName: result.outputName,
			sizeBytes: result.sizeBytes,
			encoder: result.encoder,
			video: result.probe.videoStreams[0] ?? null,
			audio: result.probe.audioStreams[0] ?? null,
			...(result.probe.videoStreams.length > 0
				? metrics({ outputPath: result.outputPath })
				: { ssim: null, psnrDb: null }),
		});
	} catch (error) {
		results.push({
			preset,
			status: "failed",
			elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
			error:
				error instanceof Error ? error.message : String(error),
		});
	}
}

const report = {
	generatedAt: new Date().toISOString(),
	sourcePath,
	projectsRoot,
	passCount: results.filter((result) => result.status === "passed")
		.length,
	failCount: results.filter((result) => result.status === "failed")
		.length,
	results,
};
const reportPath = path.join(
	projectsRoot,
	"native-delivery-verification.json",
);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
