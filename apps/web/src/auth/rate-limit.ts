import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { webEnv } from "@/env/web";

type RateLimitResult = { success: boolean; limited: boolean };

export function createLocalRateLimiter({
	limit,
	windowMs,
	now = Date.now,
}: {
	limit: number;
	windowMs: number;
	now?: () => number;
}) {
	const requests = new Map<string, number[]>();
	return async (key: string): Promise<RateLimitResult> => {
		const threshold = now() - windowMs;
		const active = (requests.get(key) ?? []).filter(
			(timestamp) => timestamp > threshold,
		);
		if (active.length >= limit) {
			requests.set(key, active);
			return { success: false, limited: true };
		}
		active.push(now());
		requests.set(key, active);
		return { success: true, limited: false };
	};
}

const localLimit = createLocalRateLimiter({ limit: 100, windowMs: 60_000 });
let hostedLimit: Ratelimit | null = null;

function getHostedLimit() {
	if (hostedLimit) return hostedLimit;
	if (!webEnv.UPSTASH_REDIS_REST_URL || !webEnv.UPSTASH_REDIS_REST_TOKEN) {
		return null;
	}
	hostedLimit = new Ratelimit({
		redis: new Redis({
			url: webEnv.UPSTASH_REDIS_REST_URL,
			token: webEnv.UPSTASH_REDIS_REST_TOKEN,
		}),
		limiter: Ratelimit.slidingWindow(100, "1 m"),
		analytics: true,
		prefix: "rate-limit",
	});
	return hostedLimit;
}

export async function checkRateLimit({ request }: { request: Request }) {
	const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
	const remote = getHostedLimit();
	if (!remote) return localLimit(ip);
	const { success } = await remote.limit(ip);
	return { success, limited: !success };
}
