import { describe, expect, test } from "bun:test";
import { parseWebEnv } from "../web";

describe("web environment", () => {
	test("allows a clean local build without optional hosted services", () => {
		const env = parseWebEnv({ NODE_ENV: "production" });

		expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
		expect(env.NEXT_PUBLIC_MARBLE_API_URL).toBe(
			"https://api.marblecms.com",
		);
		expect(env.DATABASE_URL).toBeUndefined();
		expect(env.BETTER_AUTH_SECRET).toBeUndefined();
		expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
		expect(env.FREESOUND_API_KEY).toBeUndefined();
	});

	test("still rejects malformed values when an integration is configured", () => {
		expect(() =>
			parseWebEnv({
				NODE_ENV: "production",
				DATABASE_URL: "sqlite://local.db",
				UPSTASH_REDIS_REST_URL: "not-a-url",
			}),
		).toThrow();
	});
});
