import { describe, expect, test } from "bun:test";
import {
	decidePlaybackStrategy,
	normalizeFfprobe,
	type RawFfprobeOutput,
} from "@/media/codec-capabilities";

function main10Probe(): RawFfprobeOutput {
	return {
		format: {
			format_name: "mov,mp4,m4a,3gp,3g2,mj2",
			duration: "13.008333",
			size: "6140128",
			bit_rate: "3775900",
		},
		streams: [
			{
				index: 0,
				codec_type: "video",
				codec_name: "hevc",
				profile: "Main 10",
				level: 120,
				pix_fmt: "yuv420p10le",
				width: 1920,
				height: 1080,
				avg_frame_rate: "46800/1561",
				r_frame_rate: "30/1",
				sample_aspect_ratio: "1:1",
				display_aspect_ratio: "16:9",
				color_range: "tv",
				color_space: "bt2020nc",
				color_transfer: "smpte2084",
				color_primaries: "bt2020",
				chroma_location: "left",
				side_data_list: [{ rotation: -90 }],
			},
			{
				index: 1,
				codec_type: "audio",
				codec_name: "aac",
				profile: "LC",
				sample_rate: "48000",
				channels: 2,
				channel_layout: "stereo",
				bit_rate: "192000",
			},
		],
	};
}

describe("codec probe normalization", () => {
	test("normalizes Main10, colour, rotation, VFR, container, and audio facts", () => {
		const probe = normalizeFfprobe(main10Probe());

		expect(probe.container.formatNames).toEqual([
			"mov",
			"mp4",
			"m4a",
			"3gp",
			"3g2",
			"mj2",
		]);
		expect(probe.container.durationSeconds).toBeCloseTo(13.008333);
		expect(probe.videoStreams[0]).toMatchObject({
			codec: "hevc",
			profile: "Main 10",
			pixelFormat: "yuv420p10le",
			bitDepth: 10,
			width: 1920,
			height: 1080,
			sampleAspectRatio: "1:1",
			displayAspectRatio: "16:9",
			rotationDegrees: -90,
			frameRateMode: "variable",
			hdr: true,
			color: {
				range: "tv",
				space: "bt2020nc",
				transfer: "smpte2084",
				primaries: "bt2020",
				chromaLocation: "left",
			},
		});
		expect(probe.videoStreams[0]?.averageFrameRate).toBeCloseTo(29.9808, 3);
		expect(probe.audioStreams[0]).toMatchObject({
			codec: "aac",
			profile: "LC",
			sampleRate: 48_000,
			channels: 2,
			channelLayout: "stereo",
			bitrate: 192_000,
		});
	});

	test("keeps missing or malformed optional values explicit instead of inventing them", () => {
		const probe = normalizeFfprobe({
			format: { format_name: "matroska,webm", duration: "N/A" },
			streams: [
				{
					index: 0,
					codec_type: "video",
					codec_name: "vp9",
					pix_fmt: "yuv420p",
					width: 1280,
					height: 720,
					avg_frame_rate: "0/0",
					r_frame_rate: "0/0",
				},
			],
		});

		expect(probe.container.durationSeconds).toBeNull();
		expect(probe.videoStreams[0]).toMatchObject({
			bitDepth: 8,
			averageFrameRate: null,
			nominalFrameRate: null,
			frameRateMode: "unknown",
			rotationDegrees: 0,
			hdr: false,
		});
		expect(probe.audioStreams).toEqual([]);
	});
});

describe("playback strategy", () => {
	test("recommends a proxy for browser-decodable 1080p Main10 HDR media", () => {
		expect(
			decidePlaybackStrategy({
				probe: normalizeFfprobe(main10Probe()),
				browserCanDecode: true,
				nativeTranscodeAvailable: true,
			}),
		).toEqual({
			kind: "proxy-recommended",
			reasonCodes: ["high-bit-depth", "hdr-source"],
		});
	});

	test("recommends a proxy for decodable 4K, high-frame-rate, or high-bitrate video", () => {
		const probe = normalizeFfprobe({
			format: {
				format_name: "mov,mp4",
				duration: "12",
				bit_rate: "42000000",
			},
			streams: [
				{
					index: 0,
					codec_type: "video",
					codec_name: "h264",
					profile: "High",
					pix_fmt: "yuv420p",
					width: 3840,
					height: 2160,
					avg_frame_rate: "60/1",
					r_frame_rate: "60/1",
					bit_rate: "40000000",
				},
			],
		});

		expect(
			decidePlaybackStrategy({
				probe,
				browserCanDecode: true,
				nativeTranscodeAvailable: true,
			}),
		).toEqual({
			kind: "proxy-recommended",
			reasonCodes: ["large-frame", "high-frame-rate", "high-bitrate"],
		});
	});

	test("requires a native proxy when the browser decoder rejects video", () => {
		expect(
			decidePlaybackStrategy({
				probe: normalizeFfprobe(main10Probe()),
				browserCanDecode: false,
				nativeTranscodeAvailable: true,
			}),
		).toEqual({
			kind: "proxy-required",
			reasonCodes: ["browser-codec-unsupported"],
		});
	});

	test("fails closed when neither browser decoding nor native transcoding exists", () => {
		expect(
			decidePlaybackStrategy({
				probe: normalizeFfprobe(main10Probe()),
				browserCanDecode: false,
				nativeTranscodeAvailable: false,
			}),
		).toEqual({
			kind: "unsupported",
			reasonCodes: [
				"browser-codec-unsupported",
				"native-transcode-unavailable",
			],
		});
	});

	test("distinguishes audio-only assets and ordinary direct-play video", () => {
		const audioOnly = normalizeFfprobe({
			format: { format_name: "wav", duration: "4" },
			streams: [
				{
					index: 0,
					codec_type: "audio",
					codec_name: "pcm_s24le",
					sample_rate: "48000",
					channels: 2,
				},
			],
		});
		expect(
			decidePlaybackStrategy({
				probe: audioOnly,
				browserCanDecode: null,
				nativeTranscodeAvailable: true,
			}),
		).toEqual({ kind: "audio-only", reasonCodes: ["audio-only"] });

		const direct = normalizeFfprobe({
			format: { format_name: "mov,mp4", duration: "4" },
			streams: [
				{
					index: 0,
					codec_type: "video",
					codec_name: "h264",
					profile: "High",
					pix_fmt: "yuv420p",
					width: 1280,
					height: 720,
					avg_frame_rate: "30/1",
					r_frame_rate: "30/1",
				},
			],
		});
		expect(
			decidePlaybackStrategy({
				probe: direct,
				browserCanDecode: true,
				nativeTranscodeAvailable: true,
			}),
		).toEqual({ kind: "direct", reasonCodes: ["browser-decodable"] });
	});
});
