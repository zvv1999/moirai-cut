import { betterAuth, type RateLimit } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "@upstash/redis";
import { getDb } from "@/db";
import { webEnv } from "@/env/web";

function createAuth() {
	const missing = [
		["DATABASE_URL", webEnv.DATABASE_URL],
		["BETTER_AUTH_SECRET", webEnv.BETTER_AUTH_SECRET],
		["UPSTASH_REDIS_REST_URL", webEnv.UPSTASH_REDIS_REST_URL],
		["UPSTASH_REDIS_REST_TOKEN", webEnv.UPSTASH_REDIS_REST_TOKEN],
	]
		.filter(([, value]) => !value)
		.map(([name]) => name);
	if (missing.length > 0) {
		throw new Error(
			`Authentication is not configured. Set ${missing.join(", ")} to enable account features.`,
		);
	}

	const redis = new Redis({
		url: webEnv.UPSTASH_REDIS_REST_URL!,
		token: webEnv.UPSTASH_REDIS_REST_TOKEN!,
	});

	return betterAuth({
		database: drizzleAdapter(getDb(), {
			provider: "pg",
			usePlural: true,
		}),
		secret: webEnv.BETTER_AUTH_SECRET!,
		user: {
			deleteUser: {
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		rateLimit: {
			storage: "secondary-storage",
			customStorage: {
				get: async (key) => {
					const value = await redis.get(key);
					return value as RateLimit | undefined;
				},
				set: async (key, value) => {
					await redis.set(key, value);
				},
			},
		},
		baseURL: webEnv.NEXT_PUBLIC_SITE_URL,
		appName: "Moirai Cut",
		trustedOrigins: [webEnv.NEXT_PUBLIC_SITE_URL],
	});
}

type AuthInstance = ReturnType<typeof createAuth>;
let authInstance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
	if (!authInstance) authInstance = createAuth();
	return authInstance;
}

export type Auth = AuthInstance;
