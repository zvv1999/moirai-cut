import { describe, expect, test } from "bun:test";
import { BackgroundJobRegistry } from "@/project/background-jobs";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("background jobs", () => {
	test("keeps progress and history outside the initiating UI", async () => {
		const gate = deferred();
		const registry = new BackgroundJobRegistry({
			createId: () => "job-1",
			now: () => "2026-07-28T00:00:00.000Z",
		});

		const handle = registry.start({
			kind: "proxy",
			label: "Generate 24 proxies",
			run: async ({ update }) => {
				update({ progress: 0.5, step: "12 of 24" });
				await gate.promise;
			},
		});

		expect(registry.list()[0]).toMatchObject({
			jobId: "job-1",
			status: "running",
			progress: 0.5,
			step: "12 of 24",
		});
		gate.resolve();
		await handle.done;
		expect(registry.list()[0]).toMatchObject({
			status: "completed",
			progress: 1,
		});
	});

	test("supports cancel and retry for every long-running job kind", async () => {
		let attempts = 0;
		const registry = new BackgroundJobRegistry({
			createId: () => "job-2",
			now: () => "2026-07-28T00:00:00.000Z",
		});
		const handle = registry.start({
			kind: "transcription",
			label: "Transcribe timeline",
			run: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("model download failed");
			},
		});

		await handle.done;
		expect(registry.get({ jobId: "job-2" })).toMatchObject({
			status: "failed",
			attempts: 1,
			error: "model download failed",
		});

		await registry.retry({ jobId: "job-2" });
		expect(registry.get({ jobId: "job-2" })).toMatchObject({
			status: "completed",
			attempts: 2,
			error: null,
		});

		const cancelling = registry.start({
			kind: "analysis",
			label: "Analyze loudness",
			run: async ({ signal }) => {
				await new Promise<void>((resolve) => {
					signal.addEventListener("abort", () => resolve(), { once: true });
				});
			},
		});
		registry.cancel({ jobId: cancelling.job.jobId });
		await cancelling.done;
		expect(registry.get({ jobId: cancelling.job.jobId })?.status).toBe(
			"cancelled",
		);
	});
});
