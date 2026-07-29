import { describe, expect, test } from "bun:test";
import {
	cancelNativeMediaJob,
	checkBrowserDecodeSupport,
	ensureNativeProxy,
	getNativeMediaJob,
	listNativeMediaJobs,
	requestMediaProbe,
	retryNativeMediaJob,
	waitForNativeMediaJob,
} from "@/agent/media-codec";
import type { NativeMediaJob } from "@/server/media-jobs";

describe("agent media codec client", () => {
	test("only asks the browser decoder about video assets", async () => {
		let inspections = 0;
		const inspectVideo = async () => {
			inspections += 1;
			return false;
		};
		const file = new File(["media"], "media.bin");

		expect(
			await checkBrowserDecodeSupport({
				asset: { type: "audio", file },
				inspectVideo,
			}),
		).toBeNull();
		expect(
			await checkBrowserDecodeSupport({
				asset: { type: "video", file },
				inspectVideo,
			}),
		).toBe(false);
		expect(inspections).toBe(1);
	});

	test("encodes project/asset ids and forwards compatibility inputs", async () => {
		let requestedUrl = "";
		const fetcher = async (input: RequestInfo | URL) => {
			requestedUrl = String(input);
			return Response.json({
				data: {
					source: {
						assetId: "asset / one",
						sha256: "a".repeat(64),
					},
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

	test("uses the native job actions and polls until proxy completion", async () => {
		const calls: Array<{ url: string; action?: string }> = [];
		let polls = 0;
		const baseJob: NativeMediaJob = {
			id: "job-1",
			kind: "proxy",
			projectId: "project",
			assetId: "asset",
			profile: "standard",
			cacheKey: "hash:standard",
			status: "queued",
			progress: 0,
			processedSeconds: 0,
			createdAt: "2026-07-29T00:00:00.000Z",
			updatedAt: "2026-07-29T00:00:00.000Z",
		};
		// eslint-disable-next-line opencut/prefer-object-params -- fetch-compatible test double follows the platform signature.
		const fetcher = async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const body =
				typeof init?.body === "string"
					? JSON.parse(init.body)
					: undefined;
			calls.push({ url: String(input), action: body?.action });
			if (String(input).includes("jobId=")) {
				polls += 1;
				return Response.json({
					data: {
						...baseJob,
						status: polls > 1 ? "succeeded" : "running",
						progress: polls > 1 ? 1 : 0.5,
					},
				});
			}
			if (!init?.method) {
				return Response.json({ data: [baseJob] });
			}
			return Response.json({ data: baseJob });
		};

		await ensureNativeProxy({
			projectId: "project",
			assetId: "asset",
			profile: "high",
			fetcher,
		});
		await listNativeMediaJobs({ projectId: "project", fetcher });
		await getNativeMediaJob({
			projectId: "project",
			jobId: "job-1",
			fetcher,
		});
		await cancelNativeMediaJob({
			projectId: "project",
			jobId: "job-1",
			fetcher,
		});
		await retryNativeMediaJob({
			projectId: "project",
			jobId: "job-1",
			fetcher,
		});
		const completed = await waitForNativeMediaJob({
			projectId: "project",
			jobId: "job-1",
			pollIntervalMs: 1,
			fetcher,
		});

		expect(completed.status).toBe("succeeded");
		expect(calls.map((call) => call.action).filter(Boolean)).toEqual([
			"ensureProxy",
			"cancel",
			"retry",
		]);
		expect(calls[0]?.url).toBe("/api/media-jobs/project");
	});
});
