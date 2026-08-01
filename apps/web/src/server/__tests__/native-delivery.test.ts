import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildDeliveryFfmpegArgs,
	transcodeProjectExport,
	type DeliveryProbe,
	type DeliveryRunner,
} from "@/server/native-delivery";

describe("native delivery presets", () => {
	test("builds explicit video and audio codec/container combinations", () => {
		const cases = [
			{
				preset: "h264-mp4" as const,
				contains: ["libx264", "aac", "+faststart", "yuv420p"],
			},
			{
				preset: "hevc10-mov" as const,
				contains: ["libx265", "hvc1", "yuv420p10le", "aac"],
			},
			{
				preset: "hevc10-mov-pcm" as const,
				contains: ["libx265", "hvc1", "yuv420p10le", "pcm_s24le"],
			},
			{
				preset: "vp9-webm" as const,
				contains: ["libvpx-vp9", "libopus", "yuv420p"],
			},
			{
				preset: "av1-webm" as const,
				contains: ["libaom-av1", "libopus", "yuv420p"],
			},
			{ preset: "wav-pcm" as const, contains: ["pcm_s24le", "-vn"] },
			{ preset: "m4a-aac" as const, contains: ["aac", "-vn"] },
			{ preset: "mp3" as const, contains: ["libmp3lame", "-vn"] },
			{ preset: "flac" as const, contains: ["flac", "-vn"] },
			{ preset: "ogg-opus" as const, contains: ["libopus", "-vn"] },
		];
		for (const item of cases) {
			const args = buildDeliveryFfmpegArgs({
				inputPath: "/tmp/input;one.mp4",
				outputPath: "/tmp/output file.bin",
				preset: item.preset,
			});
			expect(args).toContain("/tmp/input;one.mp4");
			expect(args.at(-1)).toBe("/tmp/output file.bin");
			for (const token of item.contains) {
				expect(args.join(" ")).toContain(token);
			}
		}
	});

	test("uses a low-latency x264 preset for interactive MP4 delivery", () => {
		const args = buildDeliveryFfmpegArgs({
			inputPath: "/tmp/input.webm",
			outputPath: "/tmp/output.mp4",
			preset: "h264-mp4",
		});
		const presetIndex = args.indexOf("-preset");

		expect(presetIndex).toBeGreaterThan(-1);
		expect(args[presetIndex + 1]).toBe("veryfast");
	});

	test("atomically writes, probes, decodes, and reports a delivery", async () => {
		const projectsRoot = await mkdtemp(
			path.join(tmpdir(), "opencut-delivery-"),
		);
		const exportDirectory = path.join(
			projectsRoot,
			"project",
			"exports",
		);
		await mkdir(exportDirectory, { recursive: true });
		await writeFile(
			path.join(exportDirectory, "source.mp4"),
			"source",
		);
		let runs = 0;
		const runner: DeliveryRunner = async ({
			temporaryOutputPath,
			onProgress,
		}) => {
			runs += 1;
			onProgress({ progress: 0.5, processedSeconds: 2 });
			await writeFile(temporaryOutputPath, "delivery");
		};
		const probe: DeliveryProbe = async () => ({
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
				{
					index: 1,
					codec_type: "audio",
					codec_name: "aac",
					sample_rate: "48000",
					channels: 2,
				},
			],
		});
		let decoded = false;
		const result = await transcodeProjectExport({
			projectId: "project",
			sourceName: "source.mp4",
			preset: "hevc10-mp4",
			projectsRoot,
			runner,
			probe,
			decode: async ({ filePath }) => {
				decoded = true;
				expect(path.dirname(filePath)).toBe(exportDirectory);
				expect(path.basename(filePath)).toMatch(
					/^\.source\.hevc10\..+\.tmp\.mp4$/,
				);
			},
		});

		expect(result).toMatchObject({
			projectId: "project",
			sourceName: "source.mp4",
			outputName: "source.hevc10.mp4",
			preset: "hevc10-mp4",
			encoder: "libx265",
			hardwareAcceleration: "software",
			validated: true,
		});
		expect(result.probe.videoStreams[0]).toMatchObject({
			codec: "hevc",
			bitDepth: 10,
		});
		expect(decoded).toBe(true);
		expect(runs).toBe(1);
		expect(await readFile(result.outputPath, "utf8")).toBe("delivery");
		await expect(stat(`${result.outputPath}.tmp`)).rejects.toBeDefined();
	});

	test("rejects path traversal before invoking the runner", async () => {
		let invoked = false;
		await expect(
			transcodeProjectExport({
				projectId: "../escape",
				sourceName: "source.mp4",
				preset: "h264-mp4",
				runner: async () => {
					invoked = true;
				},
			}),
		).rejects.toThrow("Unsafe project id");
		expect(invoked).toBe(false);
	});
});
