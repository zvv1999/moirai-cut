import { afterEach, describe, expect, test } from "bun:test";
import {
	DiskMediaFileAdapter,
	DiskMediaMetadataAdapter,
} from "@/services/storage/disk-media-adapter";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("disk media metadata adapter", () => {
	test("uses one per-asset PATCH and transmits undefined fields as removals", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = (async (input, init) => {
			calls.push({ url: String(input), init });
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;
		const adapter = new DiskMediaMetadataAdapter<{
			id: string;
			name: string;
			proxy?: unknown;
			thumbnailUrl?: string;
		}>("project");

		await adapter.set({
			key: "asset",
			value: {
				id: "asset",
				name: "Renamed",
				proxy: undefined,
				thumbnailUrl: undefined,
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("/api/media/project/asset");
		expect(calls[0]?.init?.method).toBe("PATCH");
		expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
			action: "merge",
			value: { id: "asset", name: "Renamed" },
			removeKeys: ["thumbnailUrl"],
		});
	});

	test("removes one metadata record without a stale index replacement", async () => {
		let body: unknown;
		globalThis.fetch = (async (_input, init) => {
			body = JSON.parse(String(init?.body));
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}) as typeof fetch;
		const adapter = new DiskMediaMetadataAdapter("project");

		await adapter.remove("asset");

		expect(body).toEqual({ action: "remove" });
	});

	test("surfaces failed byte deletion and clear requests", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: "denied" }), {
				status: 500,
				statusText: "Server Error",
			})) as unknown as typeof fetch;
		const adapter = new DiskMediaFileAdapter("project");

		await expect(adapter.remove("asset")).rejects.toThrow(
			"Media delete failed: Server Error",
		);
		await expect(adapter.clear()).rejects.toThrow(
			"Media clear failed: Server Error",
		);
	});
});
