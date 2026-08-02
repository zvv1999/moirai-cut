import type { MediaProbeFetcher } from "@/agent/media-codec";
import type {
	DeliveryPresetName,
	NativeDeliveryResult,
} from "@/export/native-delivery-contract";

export type NativeDeliveryJobStatus =
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface NativeDeliveryJobState {
	id: string;
	projectId: string;
	sourceName: string;
	preset: DeliveryPresetName;
	outputName?: string;
	status: NativeDeliveryJobStatus;
	progress: number;
	createdAt: string;
	updatedAt: string;
	result: NativeDeliveryResult | null;
	error: string | null;
}

const MAX_JOBS = 16;
const jobs = new Map<string, NativeDeliveryJobState>();
const controllers = new Map<string, AbortController>();

function remember({ job }: { job: NativeDeliveryJobState }): void {
	jobs.set(job.id, job);
	while (jobs.size > MAX_JOBS) {
		const oldest = jobs.keys().next().value;
		if (typeof oldest !== "string") {
			break;
		}
		jobs.delete(oldest);
		controllers.delete(oldest);
	}
}

function cloneJob({
	job,
}: {
	job: NativeDeliveryJobState;
}): NativeDeliveryJobState {
	return structuredClone(job);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNativeDeliveryResult(
	value: unknown,
): value is NativeDeliveryResult {
	return (
		isRecord(value) &&
		typeof value.projectId === "string" &&
		typeof value.sourceName === "string" &&
		typeof value.outputName === "string" &&
		typeof value.outputPath === "string" &&
		typeof value.preset === "string" &&
		typeof value.encoder === "string" &&
		typeof value.sizeBytes === "number" &&
		value.validated === true &&
		isRecord(value.probe)
	);
}

function messageFromBody({
	body,
	fallback,
}: {
	body: unknown;
	fallback: string;
}): string {
	if (
		isRecord(body) &&
		isRecord(body.error) &&
		typeof body.error.message === "string"
	) {
		return body.error.message;
	}
	return fallback;
}

function isAbortError({ error }: { error: unknown }): boolean {
	return (
		error instanceof DOMException
			? error.name === "AbortError"
			: error instanceof Error && error.name === "AbortError"
	);
}

export function startNativeDeliveryJob({
	projectId,
	sourceName,
	preset,
	outputName,
	fetcher = fetch,
	randomUUID = () => crypto.randomUUID(),
}: {
	projectId: string;
	sourceName: string;
	preset: DeliveryPresetName;
	outputName?: string;
	fetcher?: MediaProbeFetcher;
	randomUUID?: () => string;
}): NativeDeliveryJobState {
	const now = new Date().toISOString();
	const job: NativeDeliveryJobState = {
		id: randomUUID(),
		projectId,
		sourceName,
		preset,
		...(outputName ? { outputName } : {}),
		status: "running",
		progress: 0,
		createdAt: now,
		updatedAt: now,
		result: null,
		error: null,
	};
	const controller = new AbortController();
	remember({ job });
	controllers.set(job.id, controller);

	void (async () => {
		try {
			const response = await fetcher(
				`/api/native-delivery/${encodeURIComponent(projectId)}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						sourceName,
						preset,
						...(outputName ? { outputName } : {}),
					}),
					signal: controller.signal,
				},
			);
			const body: unknown = await response.json();
			const current = jobs.get(job.id);
			if (!current || current.status === "cancelled") {
				return;
			}
			if (
				!response.ok ||
				!isRecord(body) ||
				!isNativeDeliveryResult(body.data)
			) {
				throw new Error(
					messageFromBody({
						body,
						fallback: `Native delivery failed with HTTP ${response.status}`,
					}),
				);
			}
			current.status = "succeeded";
			current.progress = 1;
			current.result = body.data;
			current.updatedAt = new Date().toISOString();
		} catch (error) {
			const current = jobs.get(job.id);
			if (!current) {
				return;
			}
			if (
				current.status === "cancelled" ||
				isAbortError({ error })
			) {
				current.status = "cancelled";
			} else {
				current.status = "failed";
				current.error =
					error instanceof Error ? error.message : String(error);
			}
			current.updatedAt = new Date().toISOString();
		} finally {
			controllers.delete(job.id);
		}
	})();

	return cloneJob({ job });
}

export function getNativeDeliveryJob({
	jobId,
}: {
	jobId: string;
}): NativeDeliveryJobState | null {
	const job = jobs.get(jobId);
	return job ? cloneJob({ job }) : null;
}

export function listNativeDeliveryJobs(): NativeDeliveryJobState[] {
	return [...jobs.values()]
		.sort((left, right) =>
			right.createdAt.localeCompare(left.createdAt),
		)
		.map((job) => cloneJob({ job }));
}

export function cancelNativeDeliveryJob({
	jobId,
}: {
	jobId: string;
}): NativeDeliveryJobState | null {
	const job = jobs.get(jobId);
	if (!job) {
		return null;
	}
	if (job.status === "running") {
		job.status = "cancelled";
		job.updatedAt = new Date().toISOString();
		controllers.get(jobId)?.abort();
	}
	return cloneJob({ job });
}

export async function waitForNativeDeliveryJob({
	jobId,
	pollIntervalMs = 250,
	timeoutMs = 2 * 60 * 60 * 1000,
}: {
	jobId: string;
	pollIntervalMs?: number;
	timeoutMs?: number;
}): Promise<NativeDeliveryJobState> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const job = getNativeDeliveryJob({ jobId });
		if (!job) {
			throw new Error(`No native delivery job ${jobId}`);
		}
		if (job.status !== "running") {
			return job;
		}
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
	throw new Error(`Timed out waiting for native delivery job ${jobId}`);
}
