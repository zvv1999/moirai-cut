import { describe, expect, test } from "bun:test";
import {
	cancelNativeDeliveryJob,
	getNativeDeliveryJob,
	listNativeDeliveryJobs,
	startNativeDeliveryJob,
} from "@/agent/native-delivery-jobs";

describe("Agent native delivery jobs", () => {
	test("starts asynchronously, completes with validated output, and remains inspectable", async () => {
		let resolveRequest:
			| ((response: Response) => void)
			| undefined;
		const fetcher = async () =>
			new Promise<Response>((resolve) => {
				resolveRequest = resolve;
			});
		const started = startNativeDeliveryJob({
			projectId: "project",
			sourceName: "cut.mp4",
			preset: "hevc10-mp4",
			fetcher,
			randomUUID: () => "delivery-job-1",
		});
		expect(started).toMatchObject({
			id: "delivery-job-1",
			status: "running",
			progress: 0,
		});

		resolveRequest?.(
			Response.json({
				data: {
					projectId: "project",
					sourceName: "cut.mp4",
					outputName: "cut.hevc10.mp4",
					outputPath: "/tmp/cut.hevc10.mp4",
					preset: "hevc10-mp4",
					encoder: "libx265",
					hardwareAcceleration: "software",
					sizeBytes: 100,
					probe: {
						container: {},
						videoStreams: [],
						audioStreams: [],
					},
					validated: true,
				},
			}),
		);
		await Bun.sleep(1);

		expect(getNativeDeliveryJob({ jobId: started.id })).toMatchObject({
			status: "succeeded",
			progress: 1,
			result: { validated: true },
		});
		expect(
			listNativeDeliveryJobs().some((job) => job.id === started.id),
		).toBe(true);
	});

	test("aborts a running request and records cancellation", async () => {
		// eslint-disable-next-line opencut/prefer-object-params -- fetch-compatible test double follows the platform signature.
		const fetcher = async (
			_input: RequestInfo | URL,
			init?: RequestInit,
		) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener(
					"abort",
					() => reject(new DOMException("Cancelled", "AbortError")),
					{ once: true },
				);
			});
		const started = startNativeDeliveryJob({
			projectId: "project",
			sourceName: "cut.mp4",
			preset: "h264-mp4",
			fetcher,
			randomUUID: () => "delivery-job-cancel",
		});
		const cancelled = cancelNativeDeliveryJob({ jobId: started.id });
		await Bun.sleep(1);

		expect(cancelled?.status).toBe("cancelled");
		expect(getNativeDeliveryJob({ jobId: started.id })?.status).toBe(
			"cancelled",
		);
	});

	test("preserves structured failures and handles unknown job ids", async () => {
		const started = startNativeDeliveryJob({
			projectId: "project",
			sourceName: "cut.mp4",
			preset: "av1-webm",
			fetcher: async () =>
				Response.json(
					{
						error: {
							message: "AV1 encoder is unavailable",
						},
					},
					{ status: 400 },
				),
			randomUUID: () => "delivery-job-failed",
		});
		await Bun.sleep(1);

		expect(getNativeDeliveryJob({ jobId: started.id })).toMatchObject({
			status: "failed",
			error: "AV1 encoder is unavailable",
		});
		expect(getNativeDeliveryJob({ jobId: "missing" })).toBeNull();
		expect(cancelNativeDeliveryJob({ jobId: "missing" })).toBeNull();
	});
});
