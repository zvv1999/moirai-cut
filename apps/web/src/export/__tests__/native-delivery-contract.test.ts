import { expect, test } from "bun:test";
import {
	DELIVERY_PRESET_NAMES,
	formatNativeDeliveryResultSummary,
	type NativeDeliveryResult,
} from "@/export/native-delivery-contract";

test("native delivery contract remains browser-safe and exhaustive", () => {
	expect(DELIVERY_PRESET_NAMES).toHaveLength(15);
	expect(DELIVERY_PRESET_NAMES).toContain("h264-mp4");
	expect(DELIVERY_PRESET_NAMES).toContain("hevc10-mov");
	expect(DELIVERY_PRESET_NAMES).toContain("av1-webm");
	expect(DELIVERY_PRESET_NAMES).toContain("wav-pcm");

	const result = {
		projectId: "project",
		sourceName: "cut.mp4",
		outputName: "cut.h264.mp4",
		outputPath: "/tmp/cut.h264.mp4",
		preset: "h264-mp4",
		encoder: "libx264",
		hardwareAcceleration: "software",
		sizeBytes: 1,
		probe: {
			container: {
				formatNames: ["mov", "mp4"],
				durationSeconds: 1,
				sizeBytes: 1,
				bitrate: 8,
				startTimeSeconds: 0,
			},
			videoStreams: [],
			audioStreams: [],
			subtitleStreamCount: 0,
		},
		validated: true,
	} satisfies NativeDeliveryResult;

	expect(result.validated).toBe(true);
	expect(formatNativeDeliveryResultSummary({ result })).toBe(
		"libx264 · 软件编码 · 已完整解码验证",
	);
});
