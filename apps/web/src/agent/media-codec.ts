import type {
	NormalizedMediaProbe,
	PlaybackStrategy,
} from "@/media/codec-capabilities";
import type { MediaType } from "@/media/types";
import type { ProjectMediaSource } from "@/server/media-probe";
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
