import { describe, expect, test } from "bun:test";
import {
	createNativeDeliveryRouteHandlers,
	type NativeDeliveryExecutor,
} from "@/app/api/native-delivery/[projectId]/route";

describe("native delivery API", () => {
	test("validates and executes a delivery preset", async () => {
		let received: Parameters<NativeDeliveryExecutor>[0] | null = null;
		const execute: NativeDeliveryExecutor = async (request) => {
			received = request;
			return {
				projectId: request.projectId,
				sourceName: request.sourceName,
				outputName: "cut.hevc10.mp4",
				outputPath: "/tmp/cut.hevc10.mp4",
				preset: request.preset,
				encoder: "libx265",
				hardwareAcceleration: "software",
				sizeBytes: 100,
				probe: {
					container: {
						formatNames: ["mov", "mp4"],
						durationSeconds: 4,
						sizeBytes: 100,
						bitrate: null,
						startTimeSeconds: null,
					},
					videoStreams: [],
					audioStreams: [],
					subtitleStreamCount: 0,
				},
				validated: true,
			};
		};
		const { POST } = createNativeDeliveryRouteHandlers({ execute });
		const response = await POST(
			new Request("http://localhost/api/native-delivery/project", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					sourceName: "cut.mp4",
					preset: "hevc10-mp4",
				}),
			}),
			{ params: Promise.resolve({ projectId: "project" }) },
		);

		expect(response.status).toBe(200);
		expect((await response.json()).data.validated).toBe(true);
		expect(received).toMatchObject({
			projectId: "project",
			sourceName: "cut.mp4",
			preset: "hevc10-mp4",
		});
	});

	test("rejects unknown presets and incomplete requests", async () => {
		const { POST } = createNativeDeliveryRouteHandlers({
			execute: async () => {
				throw new Error("must not run");
			},
		});
		for (const body of [
			{},
			{ sourceName: "cut.mp4", preset: "unknown" },
		]) {
			const response = await POST(
				new Request("http://localhost/api/native-delivery/project", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				}),
				{ params: Promise.resolve({ projectId: "project" }) },
			);
			expect(response.status).toBe(400);
			expect((await response.json()).error.code).toBe(
				"native_delivery_request_invalid",
			);
		}
	});
});
