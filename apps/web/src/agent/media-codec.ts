import type {
	NormalizedMediaProbe,
	PlaybackStrategy,
} from "@/media/codec-capabilities";
import type { MediaType } from "@/media/types";
import type { ProjectMediaSource } from "@/server/media-probe";
import type {
	NativeMediaJob,
	ProxyProfileName,
} from "@/server/media-jobs";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

export interface AgentMediaProbeResult {
	source: ProjectMediaSource;
	probe: NormalizedMediaProbe;
	probedAt: string;
	cacheHit: boolean;
	nativeTranscodeAvailable: boolean;
	compatibility: PlaybackStrategy;
}

export type MediaProbeFetcher = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export type BrowserDecodeInspector = ({
	file,
}: {
	file: File;
}) => Promise<boolean>;

async function inspectVideoDecodeSupport({
	file,
}: {
	file: File;
}): Promise<boolean> {
	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		return videoTrack ? await videoTrack.canDecode() : false;
	} finally {
		input.dispose();
	}
}

export async function checkBrowserDecodeSupport({
	asset,
	inspectVideo = inspectVideoDecodeSupport,
}: {
	asset: { type: MediaType; file: File };
	inspectVideo?: BrowserDecodeInspector;
}): Promise<boolean | null> {
	return asset.type === "video"
		? inspectVideo({ file: asset.file })
		: null;
}

function errorMessageFromBody({
	body,
	fallback,
}: {
	body: unknown;
	fallback: string;
}): string {
	if (
		body &&
		typeof body === "object" &&
		"error" in body &&
		body.error &&
		typeof body.error === "object" &&
		"message" in body.error &&
		typeof body.error.message === "string"
	) {
		return body.error.message;
	}
	return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAgentMediaProbeResult(
	value: unknown,
): value is AgentMediaProbeResult {
	if (!isRecord(value)) {
		return false;
	}
	const source = value.source;
	const probe = value.probe;
	const compatibility = value.compatibility;
	return (
		isRecord(source) &&
		typeof source.assetId === "string" &&
		typeof source.sha256 === "string" &&
		isRecord(probe) &&
		Array.isArray(probe.videoStreams) &&
		Array.isArray(probe.audioStreams) &&
		isRecord(compatibility) &&
		typeof compatibility.kind === "string" &&
		Array.isArray(compatibility.reasonCodes) &&
		compatibility.reasonCodes.every(
			(reasonCode) => typeof reasonCode === "string",
		) &&
		typeof value.probedAt === "string" &&
		typeof value.cacheHit === "boolean" &&
		typeof value.nativeTranscodeAvailable === "boolean"
	);
}

function isNativeMediaJob(value: unknown): value is NativeMediaJob {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		value.kind === "proxy" &&
		typeof value.projectId === "string" &&
		typeof value.assetId === "string" &&
		typeof value.profile === "string" &&
		typeof value.cacheKey === "string" &&
		typeof value.status === "string" &&
		typeof value.progress === "number" &&
		typeof value.processedSeconds === "number" &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string"
	);
}

async function responseBody({
	response,
}: {
	response: Response;
}): Promise<unknown> {
	const body: unknown = await response.json();
	if (!response.ok) {
		throw new Error(
			errorMessageFromBody({
				body,
				fallback: `Media request failed with HTTP ${response.status}`,
			}),
		);
	}
	return body;
}

function jobFromBody({ body }: { body: unknown }): NativeMediaJob {
	if (
		!isRecord(body) ||
		!isNativeMediaJob(body.data)
	) {
		throw new Error("Media job returned an invalid response");
	}
	return body.data;
}

function jobsFromBody({ body }: { body: unknown }): NativeMediaJob[] {
	if (
		!isRecord(body) ||
		!Array.isArray(body.data) ||
		!body.data.every(isNativeMediaJob)
	) {
		throw new Error("Media jobs returned an invalid response");
	}
	return body.data;
}

function dataFromBody({
	body,
}: {
	body: unknown;
}): AgentMediaProbeResult {
	if (!isRecord(body) || !isAgentMediaProbeResult(body.data)) {
		throw new Error("Media probe returned an invalid response");
	}
	return body.data;
}

export async function requestMediaProbe({
	projectId,
	assetId,
	browserCanDecode,
	force = false,
	fetcher = fetch,
}: {
	projectId: string;
	assetId: string;
	browserCanDecode: boolean | null;
	force?: boolean;
	fetcher?: MediaProbeFetcher;
}): Promise<AgentMediaProbeResult> {
	const query = new URLSearchParams();
	if (browserCanDecode !== null) {
		query.set("browserCanDecode", String(browserCanDecode));
	}
	if (force) {
		query.set("force", "true");
	}
	const suffix = query.size > 0 ? `?${query.toString()}` : "";
	const response = await fetcher(
		`/api/media/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}/probe${suffix}`,
	);
	const body: unknown = await response.json();
	if (!response.ok) {
		throw new Error(
			errorMessageFromBody({
				body,
				fallback: `Media probe failed with HTTP ${response.status}`,
			}),
		);
	}
	return dataFromBody({ body });
}

async function postMediaJobAction({
	projectId,
	body,
	fetcher,
}: {
	projectId: string;
	body: Record<string, unknown>;
	fetcher: MediaProbeFetcher;
}): Promise<NativeMediaJob> {
	const response = await fetcher(
		`/api/media-jobs/${encodeURIComponent(projectId)}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		},
	);
	return jobFromBody({ body: await responseBody({ response }) });
}

export async function ensureNativeProxy({
	projectId,
	assetId,
	profile = "standard",
	force = false,
	fetcher = fetch,
}: {
	projectId: string;
	assetId: string;
	profile?: ProxyProfileName;
	force?: boolean;
	fetcher?: MediaProbeFetcher;
}): Promise<NativeMediaJob> {
	return postMediaJobAction({
		projectId,
		body: {
			action: "ensureProxy",
			assetId,
			profile,
			force,
		},
		fetcher,
	});
}

export async function listNativeMediaJobs({
	projectId,
	fetcher = fetch,
}: {
	projectId: string;
	fetcher?: MediaProbeFetcher;
}): Promise<NativeMediaJob[]> {
	const response = await fetcher(
		`/api/media-jobs/${encodeURIComponent(projectId)}`,
	);
	return jobsFromBody({ body: await responseBody({ response }) });
}

export async function getNativeMediaJob({
	projectId,
	jobId,
	fetcher = fetch,
}: {
	projectId: string;
	jobId: string;
	fetcher?: MediaProbeFetcher;
}): Promise<NativeMediaJob> {
	const query = new URLSearchParams({ jobId });
	const response = await fetcher(
		`/api/media-jobs/${encodeURIComponent(projectId)}?${query.toString()}`,
	);
	return jobFromBody({ body: await responseBody({ response }) });
}

export async function cancelNativeMediaJob({
	projectId,
	jobId,
	fetcher = fetch,
}: {
	projectId: string;
	jobId: string;
	fetcher?: MediaProbeFetcher;
}): Promise<NativeMediaJob> {
	return postMediaJobAction({
		projectId,
		body: { action: "cancel", jobId },
		fetcher,
	});
}

export async function retryNativeMediaJob({
	projectId,
	jobId,
	fetcher = fetch,
}: {
	projectId: string;
	jobId: string;
	fetcher?: MediaProbeFetcher;
}): Promise<NativeMediaJob> {
	return postMediaJobAction({
		projectId,
		body: { action: "retry", jobId },
		fetcher,
	});
}

export async function waitForNativeMediaJob({
	projectId,
	jobId,
	pollIntervalMs = 250,
	timeoutMs = 2 * 60 * 60 * 1000,
	signal,
	onUpdate,
	fetcher = fetch,
}: {
	projectId: string;
	jobId: string;
	pollIntervalMs?: number;
	timeoutMs?: number;
	signal?: AbortSignal;
	onUpdate?: (job: NativeMediaJob) => void;
	fetcher?: MediaProbeFetcher;
}): Promise<NativeMediaJob> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (signal?.aborted) {
			throw new DOMException("Media job wait cancelled", "AbortError");
		}
		const job = await getNativeMediaJob({
			projectId,
			jobId,
			fetcher,
		});
		onUpdate?.(job);
		if (
			job.status === "succeeded" ||
			job.status === "failed" ||
			job.status === "cancelled"
		) {
			return job;
		}
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
	throw new Error(`Timed out waiting for media job ${jobId}`);
}
