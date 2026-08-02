import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z
		.url()
		.default("https://api.marblecms.com"),
	NEXT_PUBLIC_DATABUDDY_CLIENT_ID: z.string().trim().min(1).optional(),

	// Optional hosted services. Each feature validates its required group when
	// invoked, so the local editor and clean CI builds do not need cloud secrets.
	DATABASE_URL: z
		.string()
		.refine(
			(url) =>
				url.startsWith("postgres://") || url.startsWith("postgresql://"),
			"DATABASE_URL must be a postgres:// or postgresql:// URL",
		)
		.optional(),
	BETTER_AUTH_SECRET: z.string().trim().min(1).optional(),
	UPSTASH_REDIS_REST_URL: z.url().optional(),
	UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(1).optional(),
	MARBLE_WORKSPACE_KEY: z.string().trim().min(1).optional(),
	FREESOUND_CLIENT_ID: z.string().trim().min(1).optional(),
	FREESOUND_API_KEY: z.string().trim().min(1).optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseWebEnv(environment: Record<string, unknown>): WebEnv {
	return webEnvSchema.parse(environment);
}

export const webEnv = parseWebEnv(process.env);
