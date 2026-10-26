import { expect, test } from "bun:test";
import {
	claimInspection,
	finishInspection,
	requestInspection,
} from "../editor-inspection";
import { POST, PATCH } from "@/app/api/editor-inspection/route";

test("browser inspection is claimed once and bound to project and token", async () => {
	const pending = requestInspection({
		projectId: "p",
		method: "getState",
		args: null,
	});
	expect(claimInspection("other")).toBeNull();
	const job = claimInspection("p")!;
	expect(claimInspection("p")).toBeNull();
	expect(finishInspection("other", job.id, job.token, { ok: true })).toBe(
		false,
	);
	expect(finishInspection("p", job.id, "bad-token", { ok: true })).toBe(false);
	expect(
		finishInspection("p", job.id, job.token, {
			ok: true,
			data: { revision: 3 },
		}),
	).toBe(true);
	expect(await pending).toEqual({ ok: true, data: { revision: 3 } });
	expect(finishInspection("p", job.id, job.token, { ok: true })).toBe(false);
});
test("timeout and cancellation clear queued inspection work", async () => {
	const timeout = requestInspection(
		{ projectId: "timeout", method: "getState", args: null },
		undefined,
		5,
	);
	await expect(timeout).rejects.toThrow("did not answer");
	expect(claimInspection("timeout")).toBeNull();
	const controller = new AbortController();
	const pending = requestInspection(
		{ projectId: "cancel", method: "getState", args: null },
		controller.signal,
	);
	controller.abort();
	await expect(pending).rejects.toThrow("cancelled");
	expect(claimInspection("cancel")).toBeNull();
});
test("transport rejects write methods, malformed frames and foreign origins", async () => {
	for (const body of [
		{ projectId: "p", method: "edit_project" },
		{
			projectId: "p",
			method: "renderFrames",
			args: { tile: true, atSeconds: [-1], maxDim: 320 },
		},
	]) {
		expect(
			(
				await POST(
					new Request("http://localhost/api/editor-inspection", {
						method: "POST",
						body: JSON.stringify(body),
					}),
				)
			).status,
		).toBe(400);
	}
	expect(
		(
			await POST(
				new Request("http://localhost/api/editor-inspection", {
					method: "POST",
					headers: { origin: "https://other.example" },
					body: "{}",
				}),
			)
		).status,
	).toBe(403);
});

test("loopback Host survives Next URL normalization but cross-site requests are refused", async () => {
	const request = (cross = false) =>
		new Request("http://localhost:3110/api/editor-inspection", {
			method: "PATCH",
			headers: {
				host: "127.0.0.1:3110",
				origin: "http://127.0.0.1:3110",
				...(cross ? { "sec-fetch-site": "cross-site" } : {}),
			},
			body: JSON.stringify({
				projectId: "p",
				id: "job",
				token: "token",
				result: { ok: true },
			}),
		});
	expect((await PATCH(request())).status).toBe(200);
	expect((await PATCH(request(true))).status).toBe(403);
});
