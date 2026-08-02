import { describe, expect, test } from "bun:test";
import { createLocalRateLimiter } from "../rate-limit";

describe("local rate-limit fallback", () => {
	test("bounds optional-service routes when Redis is not configured", async () => {
		let now = 1_000;
		const limit = createLocalRateLimiter({
			limit: 2,
			windowMs: 1_000,
			now: () => now,
		});

		expect(await limit("client-a")).toEqual({ success: true, limited: false });
		expect(await limit("client-a")).toEqual({ success: true, limited: false });
		expect(await limit("client-a")).toEqual({ success: false, limited: true });

		now += 1_001;
		expect(await limit("client-a")).toEqual({ success: true, limited: false });
	});
});
