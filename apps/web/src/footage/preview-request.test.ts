import { afterEach, expect, test } from "bun:test";
import { requestPreview } from "./preview-request";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("temporary service failure retries the same preview without a write", async () => {
	let calls = 0;
	globalThis.fetch = (async (_url, init) => {
		expect(init?.body).toBe('{"rotation":90}');
		return ++calls === 1 ? new Response("Unavailable", { status: 503 }) : Response.json({ rotation: 90 });
	}) as typeof fetch;
	expect(await requestPreview<{ rotation: number }>("shots/test/preview-plan", { rotation: 90 }, new AbortController().signal)).toEqual({ rotation: 90 });
	expect(calls).toBe(2);
});

test("oversized payload is explained and is not retried", async () => {
	let calls = 0;
	globalThis.fetch = (async () => {
		calls++;
		return new Response("Failed to buffer the request body", { status: 413 });
	}) as unknown as typeof fetch;
	await expect(requestPreview("shots/test/preview-plan", {}, new AbortController().signal)).rejects.toThrow("调色预览数据超出服务限制");
	expect(calls).toBe(1);
});

test("a superseded edit cancels pending retries", async () => {
	let calls = 0;
	const controller = new AbortController();
	globalThis.fetch = (async () => {
		calls++;
		return new Response("Unavailable", { status: 503 });
	}) as unknown as typeof fetch;
	const pending = requestPreview("shots/test/preview-plan", {}, controller.signal);
	setTimeout(() => controller.abort(), 20);
	await expect(pending).rejects.toThrow();
	expect(calls).toBe(1);
});

test("persistent network failure stops after three attempts", async () => {
	let calls = 0;
	globalThis.fetch = (async () => { calls++; throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
	await expect(requestPreview("shots/test/preview-plan", {}, new AbortController().signal)).rejects.toThrow("预览服务连接中断");
	expect(calls).toBe(3);
});
