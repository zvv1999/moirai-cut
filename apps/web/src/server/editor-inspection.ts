import { randomUUID } from "node:crypto";

export type InspectionRequest = {
	projectId: string;
	method: "getState" | "renderFrames";
	args: { atSeconds: number[]; tile: true; maxDim: number } | null;
};
type Job = InspectionRequest & {
	id: string;
	token: string;
	claimed: boolean;
	resolve: (value: unknown) => void;
};
// Shared across Next route bundles; this is a short-lived browser transport.
const host = globalThis as typeof globalThis & {
	moiraiInspections?: Map<string, Job>;
};
const jobs = (host.moiraiInspections ??= new Map<string, Job>());

export function requestInspection(
	request: InspectionRequest,
	signal?: AbortSignal,
	timeoutMs = 30_000,
): Promise<unknown> {
	if (jobs.size >= 32)
		return Promise.reject(new Error("Editor inspection queue is full"));
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		const id = randomUUID();
		const cleanup = () => {
			jobs.delete(id);
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
		};
		const abort = () => {
			cleanup();
			reject(new Error("Editor inspection cancelled"));
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("Live editor did not answer the inspection request"));
		}, timeoutMs);
		signal?.addEventListener("abort", abort, { once: true });
		jobs.set(id, {
			...request,
			id,
			token: randomUUID(),
			claimed: false,
			resolve: (value) => {
				cleanup();
				resolve(value);
			},
		});
	});
}

export function claimInspection(projectId: string) {
	for (const job of jobs.values()) {
		if (job.projectId !== projectId || job.claimed) continue;
		job.claimed = true;
		return {
			id: job.id,
			token: job.token,
			projectId,
			method: job.method,
			args: job.args,
		};
	}
	return null;
}

export function finishInspection(
	projectId: string,
	id: string,
	token: string,
	result: unknown,
): boolean {
	const job = jobs.get(id);
	if (
		!job ||
		!job.claimed ||
		job.projectId !== projectId ||
		job.token !== token
	)
		return false;
	job.resolve(result);
	return true;
}
