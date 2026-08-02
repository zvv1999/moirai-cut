import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
	normalizeFfprobe,
	type NormalizedMediaProbe,
	type RawFfprobeOutput,
} from "@/media/codec-capabilities";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_EXT = /^[A-Za-z0-9]{1,8}$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_FFPROBE_OUTPUT_BYTES = 8 * 1024 * 1024;

interface MediaIndexEntry extends Record<string, unknown> {
	ext: string;
	mimeType?: string;
	name?: string;
}

type MediaIndex = Record<string, MediaIndexEntry>;

interface SourceSignature {
	sizeBytes: number;
	mtimeMs: number;
	ctimeMs: number;
	inode: number;
}

export interface ProjectMediaSource extends SourceSignature {
	assetId: string;
	fileName: string;
	extension: string;
	mimeType: string | null;
	sha256: string;
}

export interface ProjectMediaProbeResult {
	source: ProjectMediaSource;
	probe: NormalizedMediaProbe;
	probedAt: string;
	cacheHit: boolean;
}

interface CachedProbe {
	version: 1;
	signature: SourceSignature;
	source: ProjectMediaSource;
	probe: NormalizedMediaProbe;
	probedAt: string;
}

export type ProbeFile = ({
	filePath,
}: {
	filePath: string;
}) => Promise<RawFfprobeOutput>;

function validateId({ value, label }: { value: string; label: string }): void {
	if (!SAFE_ID.test(value)) {
		throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}`);
	}
}

function projectsRootFromEnvironment(): string {
	return (
		process.env.OPENCUT_PROJECTS_DIR ??
		path.join(/*turbopackIgnore: true*/ homedir(), "OpenCutProjects")
	);
}

function mediaDirectory({
	projectsRoot,
	projectId,
}: {
	projectsRoot: string;
	projectId: string;
}): string {
	validateId({ value: projectId, label: "project id" });
	return path.join(/*turbopackIgnore: true*/
		path.resolve(/*turbopackIgnore: true*/ projectsRoot),
		projectId,
		"media",
	);
}

function resolveAssetPath({
	directory,
	assetId,
	extension,
}: {
	directory: string;
	assetId: string;
	extension: string;
}): string {
	validateId({ value: assetId, label: "asset id" });
	if (!SAFE_EXT.test(extension)) {
		throw new Error(`Unsafe extension: ${JSON.stringify(extension)}`);
	}
	return path.join(/*turbopackIgnore: true*/
		directory,
		`${assetId}.${extension}`,
	);
}

async function readMediaIndex({
	directory,
}: {
	directory: string;
}): Promise<MediaIndex> {
	const parsed: unknown = JSON.parse(
		await readFile(
			/*turbopackIgnore: true*/
			path.join(/*turbopackIgnore: true*/ directory, "index.json"),
			"utf8",
		),
	);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Invalid media index");
	}
	const index: MediaIndex = {};
	for (const [assetId, candidate] of Object.entries(parsed)) {
		if (
			candidate &&
			typeof candidate === "object" &&
			!Array.isArray(candidate) &&
			"ext" in candidate &&
			typeof candidate.ext === "string"
		) {
			index[assetId] = {
				...candidate,
				ext: candidate.ext,
			};
		}
	}
	return index;
}

function signatureFromStat({
	size,
	mtimeMs,
	ctimeMs,
	ino,
}: {
	size: number;
	mtimeMs: number;
	ctimeMs: number;
	ino: number | bigint;
}): SourceSignature {
	return {
		sizeBytes: size,
		mtimeMs,
		ctimeMs,
		inode: Number(ino),
	};
}

function signaturesEqual({
	left,
	right,
}: {
	left: SourceSignature;
	right: SourceSignature;
}): boolean {
	return (
		left.sizeBytes === right.sizeBytes &&
		left.mtimeMs === right.mtimeMs &&
		left.ctimeMs === right.ctimeMs &&
		left.inode === right.inode
	);
}

function hasNodeErrorCode({
	error,
	code,
}: {
	error: unknown;
	code: string;
}): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function isCachedProbe(value: unknown): value is CachedProbe {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Partial<CachedProbe>;
	return (
		candidate.version === 1 &&
		typeof candidate.probedAt === "string" &&
		!!candidate.signature &&
		typeof candidate.signature.sizeBytes === "number" &&
		typeof candidate.signature.mtimeMs === "number" &&
		typeof candidate.signature.ctimeMs === "number" &&
		typeof candidate.signature.inode === "number" &&
		!!candidate.source &&
		typeof candidate.source.sha256 === "string" &&
		!!candidate.probe &&
		Array.isArray(candidate.probe.videoStreams) &&
		Array.isArray(candidate.probe.audioStreams)
	);
}

async function readCachedProbe({
	cachePath,
	signature,
}: {
	cachePath: string;
	signature: SourceSignature;
}): Promise<CachedProbe | null> {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(/*turbopackIgnore: true*/ cachePath, "utf8"),
		);
		return isCachedProbe(parsed) &&
			signaturesEqual({ left: parsed.signature, right: signature })
			? parsed
			: null;
	} catch (error) {
		if (
			hasNodeErrorCode({ error, code: "ENOENT" }) ||
			error instanceof SyntaxError
		) {
			return null;
		}
		throw error;
	}
}

async function writeCachedProbe({
	cachePath,
	cache,
}: {
	cachePath: string;
	cache: CachedProbe;
}): Promise<void> {
	const directory = path.dirname(cachePath);
	await mkdir(/*turbopackIgnore: true*/ directory, { recursive: true });
	const temporaryPath = path.join(/*turbopackIgnore: true*/
		directory,
		`.${path.basename(cachePath)}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(
			/*turbopackIgnore: true*/
			temporaryPath,
			`${JSON.stringify(cache, null, 2)}\n`,
			"utf8",
		);
		await rename(
			/*turbopackIgnore: true*/ temporaryPath,
			/*turbopackIgnore: true*/ cachePath,
		);
	} catch (error) {
		await rm(/*turbopackIgnore: true*/ temporaryPath, { force: true }).catch(
			() => undefined,
		);
		throw error;
	}
}

async function sha256File({ filePath }: { filePath: string }): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(
		/*turbopackIgnore: true*/ filePath,
	)) {
		hash.update(chunk);
	}
	return hash.digest("hex");
}

export async function runFfprobe({
	filePath,
	ffprobeBinary = process.env.FFPROBE_BIN ?? "ffprobe",
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
	filePath: string;
	ffprobeBinary?: string;
	timeoutMs?: number;
}): Promise<RawFfprobeOutput> {
	const stdout = await new Promise<string>((resolve, reject) => {
		execFile(
			ffprobeBinary,
			["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath],
			{
				encoding: "utf8",
				maxBuffer: MAX_FFPROBE_OUTPUT_BYTES,
				timeout: timeoutMs,
			},
			(error, output, stderr) => {
				if (error) {
					reject(
						new Error(`FFprobe failed: ${stderr.trim() || error.message}`, {
							cause: error,
						}),
					);
					return;
				}
				resolve(output);
			},
		);
	});

	const parsed: unknown = JSON.parse(stdout);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("FFprobe returned invalid JSON");
	}
	return parsed as RawFfprobeOutput;
}

export async function probeProjectMedia({
	projectId,
	assetId,
	projectsRoot = projectsRootFromEnvironment(),
	force = false,
	probeFile = ({ filePath }) => runFfprobe({ filePath }),
}: {
	projectId: string;
	assetId: string;
	projectsRoot?: string;
	force?: boolean;
	probeFile?: ProbeFile;
}): Promise<ProjectMediaProbeResult> {
	validateId({ value: projectId, label: "project id" });
	validateId({ value: assetId, label: "asset id" });

	const directory = mediaDirectory({ projectsRoot, projectId });
	const index = await readMediaIndex({ directory });
	const entry = index[assetId];
	if (!entry) {
		throw new Error(`No asset ${assetId}`);
	}
	if (typeof entry.ext !== "string") {
		throw new Error(`Asset ${assetId} has no valid extension`);
	}

	const filePath = resolveAssetPath({
		directory,
		assetId,
		extension: entry.ext,
	});
	const fileStat = await stat(/*turbopackIgnore: true*/ filePath, {
		bigint: false,
	});
	const signature = signatureFromStat(fileStat);
	const cachePath = path.join(/*turbopackIgnore: true*/
		directory,
		".codec-cache",
		`${assetId}.probe.json`,
	);

	if (!force) {
		const cached = await readCachedProbe({ cachePath, signature });
		if (cached) {
			return {
				source: cached.source,
				probe: cached.probe,
				probedAt: cached.probedAt,
				cacheHit: true,
			};
		}
	}

	const [sha256, rawProbe] = await Promise.all([
		sha256File({ filePath }),
		probeFile({ filePath }),
	]);
	const source: ProjectMediaSource = {
		assetId,
		fileName:
			typeof entry.name === "string" && entry.name.trim() !== ""
				? entry.name
				: `${assetId}.${entry.ext}`,
		extension: entry.ext,
		mimeType: typeof entry.mimeType === "string" ? entry.mimeType : null,
		...signature,
		sha256,
	};
	const cached: CachedProbe = {
		version: 1,
		signature,
		source,
		probe: normalizeFfprobe(rawProbe),
		probedAt: new Date().toISOString(),
	};
	await writeCachedProbe({ cachePath, cache: cached });

	return {
		source: cached.source,
		probe: cached.probe,
		probedAt: cached.probedAt,
		cacheHit: false,
	};
}
