import { describe, expect, test } from "bun:test";
import { requestMediaProbe } from "@/agent/media-codec";

describe("agent media codec client", () => {
	test("encodes project/asset ids and forwards compatibility inputs", async () => {
		let requestedUrl = "";
		const fetcher = async (input: RequestInfo | URL) => {
			requestedUrl = String(input);
			return Response.json({
				data: {
					source: { assetId: "asset / one" },
					probe: { videoStreams: [], audioStreams: [] },
					compatibility: {
						kind: "proxy-required",
						reasonCodes: ["browser-codec-unsupported"],
					},
					nativeTranscodeAvailable: true,
					cacheHit: false,
					probedAt: "2026-07-29T00:00:00.000Z",
				},
			});
		};

		const result = await requestMediaProbe({
			projectId: "project / one",
			assetId: "asset / one",
			browserCanDecode: false,
			force: true,
			fetcher,
		});

		expect(requestedUrl).toBe(
			"/api/media/project%20%2F%20one/asset%20%2F%20one/probe?browserCanDecode=false&force=true",
		);
		expect(result.compatibility.kind).toBe("proxy-required");
	});

	test("turns structured API failures into actionable errors", async () => {
		const fetcher = async () =>
			Response.json(
				{
					error: {
						code: "media_probe_failed",
						message: "FFprobe failed: invalid data",
					},
				},
				{ status: 400 },
			);

		await expect(
			requestMediaProbe({
				projectId: "project",
				assetId: "asset",
				browserCanDecode: null,
				fetcher,
			}),
		).rejects.toThrow("FFprobe failed: invalid data");
	});
});
