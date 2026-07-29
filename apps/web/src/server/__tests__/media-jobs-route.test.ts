import { describe, expect, test } from "bun:test";
import {
	createMediaJobsRouteHandlers,
	type MediaJobsApiService,
} from "@/app/api/media-jobs/[projectId]/route";

function serviceStub() {
	const calls: Array<{ method: string; input: unknown }> = [];
	const job = {
		id: "job-1",
		kind: "proxy" as const,
		projectId: "project",
		assetId: "asset",
		profile: "standard" as const,
		cacheKey: "hash:standard",
		status: "queued" as const,
		progress: 0,
		processedSeconds: 0,
		createdAt: "2026-07-29T00:00:00.000Z",
		updatedAt: "2026-07-29T00:00:00.000Z",
	};
	const service: MediaJobsApiService = {
		ensureProxy: async (input) => {
			calls.push({ method: "ensureProxy", input });
			return job;
		},
		list: async (input) => {
			calls.push({ method: "list", input });
			return [job];
		},
		get: async (input) => {
			calls.push({ method: "get", input });
			return job;
		},
		cancel: async (input) => {
			calls.push({ method: "cancel", input });
			return { ...job, status: "cancelled" };
		},
		retry: async (input) => {
			calls.push({ method: "retry", input });
			return job;
		},
	};
	return { service, calls };
}

describe("native media jobs API", () => {
	test("starts, lists, inspects, cancels, and retries jobs with explicit actions", async () => {
		const stub = serviceStub();
		const handlers = createMediaJobsRouteHandlers({
			service: stub.service,
		});
		const context = {
			params: Promise.resolve({ projectId: "project" }),
		};

		const started = await handlers.POST(
			new Request("http://localhost/api/media-jobs/project", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "ensureProxy",
					assetId: "asset",
					profile: "high",
				}),
			}),
			context,
		);
		expect(started.status).toBe(202);

		const listed = await handlers.GET(
			new Request("http://localhost/api/media-jobs/project"),
			context,
		);
		expect((await listed.json()).data).toHaveLength(1);

		const inspected = await handlers.GET(
			new Request(
				"http://localhost/api/media-jobs/project?jobId=job-1",
			),
			context,
		);
		expect((await inspected.json()).data.id).toBe("job-1");

		for (const action of ["cancel", "retry"]) {
			const response = await handlers.POST(
				new Request("http://localhost/api/media-jobs/project", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ action, jobId: "job-1" }),
				}),
				context,
			);
			expect(response.status).toBe(200);
		}

		expect(stub.calls.map((call) => call.method)).toEqual([
			"ensureProxy",
			"list",
			"get",
			"cancel",
			"retry",
		]);
		expect(stub.calls[0]?.input).toEqual({
			projectId: "project",
			assetId: "asset",
			profile: "high",
			force: false,
		});
	});

	test("rejects unknown actions and invalid profiles", async () => {
		const handlers = createMediaJobsRouteHandlers({
			service: serviceStub().service,
		});
		const context = {
			params: Promise.resolve({ projectId: "project" }),
		};
		for (const body of [
			{ action: "destroyEverything" },
			{ action: "ensureProxy", assetId: "asset", profile: "ultra" },
		]) {
			const response = await handlers.POST(
				new Request("http://localhost/api/media-jobs/project", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				}),
				context,
			);
			expect(response.status).toBe(400);
			expect((await response.json()).error.code).toBe(
				"media_job_request_invalid",
			);
		}
	});
});
