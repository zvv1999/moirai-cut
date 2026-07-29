import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { MediaProxyData } from "@/services/storage/types";
import {
	probeProjectMedia,
	type ProbeFile,
	type ProjectMediaProbeResult,
} from "@/server/media-probe";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TERMINAL_STATUSES = new Set<NativeMediaJobStatus>([
	"succeeded",
	"failed",
	"cancelled",
]);

export const PROXY_PROFILE_NAMES = [
	"draft",
	"standard",
	"high",
] as const;
export type ProxyProfileName = (typeof PROXY_PROFILE_NAMES)[number];

export type NativeMediaJobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface NativeProxyMetadata extends MediaProxyData {
	profile: ProxyProfileName;
	sourceSha256: string;
}

export interface NativeMediaJob {
	id: string;
	kind: "proxy";
	projectId: string;
	assetId: string;
	profile: ProxyProfileName;
	cacheKey: string;
	status: NativeMediaJobStatus;
	progress: number;
	processedSeconds: number;
	createdAt: string;
	updatedAt: string;
	startedAt?: string;
	finishedAt?: string;
	error?: { code: string; message: string };
	result?: {
		proxy: NativeProxyMetadata;
		outputPath: string;
	};
	cacheHit?: boolean;
}

export type NativeTranscodeRunner = ({
	args,
	inputPath,
	temporaryOutputPath,
	signal,
	durationSeconds,
	timeoutMs,
	onProgress,
}: {
	args: string[];
	inputPath: string;
	temporaryOutputPath: string;
	signal: AbortSignal;
	durationSeconds: number | null;
	timeoutMs?: number;
	onProgress: (update: {
		progress: number;
		processedSeconds: number;
	}) => void;
}) => Promise<void>;

interface QueuedProxyExecution {
	jobId: string;
	probe: ProjectMediaProbeResult;
	controller: AbortController;
}

interface ProxyProfile {
	maxLongEdge: number;
	maxFps: number;
	crf: number;
	audioBitrate: string;
}

const PROXY_PROFILES: Record<ProxyProfileName, ProxyProfile> = {
	draft: {
		maxLongEdge: 640,
		maxFps: 24,
		crf: 28,
		audioBitrate: "128k",
	},
	standard: {
		maxLongEdge: 960,
		maxFps: 30,
		crf: 23,
		audioBitrate: "160k",
	},
	high: {
		maxLongEdge: 1440,
		maxFps: 30,
		crf: 18,
		audioBitrate: "192k",
	},
};

interface MediaIndexEntry extends Record<string, unknown> {
	ext: string;
}

type MediaIndex = Record<string, MediaIndexEntry>;

function validateId({ value, label }: { value: string; label: string }): void {
	if (!SAFE_ID.test(value)) {
		throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}`);
	}
}

function defaultProjectsRoot(): string {
	return (
		process.env.OPENCUT_PROJECTS_DIR ??
		path.join(homedir(), "OpenCutProjects")
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
	return path.join(path.resolve(projectsRoot), projectId, "media");
}

function jobsPath({
	projectsRoot,
	projectId,
}: {
	projectsRoot: string;
	projectId: string;
}): string {
	validateId({ value: projectId, label: "project id" });
	return path.join(
		path.resolve(projectsRoot),
		projectId,
		"codec-jobs",
		"index.json",
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNativeMediaJob(value: unknown): value is NativeMediaJob {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		value.kind === "proxy" &&
		typeof value.projectId === "string" &&
		typeof value.assetId === "string" &&
		PROXY_PROFILE_NAMES.some(
			(profile) => profile === value.profile,
		) &&
		typeof value.status === "string" &&
		typeof value.cacheKey === "string" &&
		typeof value.progress === "number" &&
		typeof value.processedSeconds === "number" &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string"
	);
}

async function readMediaIndex({
	directory,
}: {
	directory: string;
}): Promise<MediaIndex> {
	const parsed: unknown = JSON.parse(
		await readFile(path.join(directory, "index.json"), "utf8"),
	);
	if (!isRecord(parsed)) {
		throw new Error("Invalid media index");
	}
	const index: MediaIndex = {};
	for (const [id, entry] of Object.entries(parsed)) {
		if (isRecord(entry) && typeof entry.ext === "string") {
			index[id] = { ...entry, ext: entry.ext };
		}
	}
	return index;
}

async function writeJsonAtomic({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}): Promise<void> {
	const directory = path.dirname(filePath);
	await mkdir(directory, { recursive: true });
	const temporaryPath = path.join(
		directory,
		`.${path.basename(filePath)}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(
			temporaryPath,
			`${JSON.stringify(value, null, 2)}\n`,
			"utf8",
		);
		await rename(temporaryPath, filePath);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

function proxyDimensions({
	width,
	height,
	rotationDegrees = 0,
	maxLongEdge,
}: {
	width: number;
	height: number;
	rotationDegrees?: number;
	maxLongEdge: number;
}): { width: number; height: number } {
	const normalizedRotation =
		((rotationDegrees % 360) + 360) % 360;
	const swapsAxes =
		Math.abs(normalizedRotation - 90) < 0.5 ||
		Math.abs(normalizedRotation - 270) < 0.5;
	const sourceWidth = Math.max(2, swapsAxes ? height : width);
	const sourceHeight = Math.max(2, swapsAxes ? width : height);
	const scale = Math.min(
		1,
		maxLongEdge / Math.max(sourceWidth, sourceHeight),
	);
	const even = (value: number) =>
		Math.max(2, Math.round((value * scale) / 2) * 2);
	return {
		width: even(sourceWidth),
		height: even(sourceHeight),
	};
}

function proxyVideoFilter({
	profile,
	probe,
}: {
	profile: ProxyProfile;
	probe: ProjectMediaProbeResult;
}): string {
	const longEdge = profile.maxLongEdge;
	const filters = [
		`scale=w=if(gte(iw\\,ih)\\,min(${longEdge}\\,iw)\\,-2):h=if(gte(iw\\,ih)\\,-2\\,min(${longEdge}\\,ih)):force_divisible_by=2`,
	];
	const video = probe.probe.videoStreams[0];
	const sourceFps =
		video?.averageFrameRate ?? video?.nominalFrameRate ?? null;
	if (
		video?.frameRateMode === "variable" ||
		(sourceFps ?? 0) > profile.maxFps
	) {
		const targetFps = Math.min(
			profile.maxFps,
			Math.max(1, Math.round(sourceFps ?? profile.maxFps)),
		);
		filters.push(`fps=${targetFps}`);
	}
	if (video?.hdr) {
		filters.push(
			"zscale=t=linear:npl=100",
			"tonemap=tonemap=hable:desat=0",
			"zscale=p=bt709:t=bt709:m=bt709:r=tv",
		);
	} else if (video?.color.primaries === "smpte432") {
		filters.push("zscale=p=bt709:t=bt709:m=bt709:r=tv");
	}
	filters.push("format=yuv420p");
	return filters.join(",");
}

export function buildProxyFfmpegArgs({
	inputPath,
	outputPath,
	profile,
	probe,
}: {
	inputPath: string;
	outputPath: string;
	profile: ProxyProfileName;
	probe: ProjectMediaProbeResult;
}): string[] {
	const settings = PROXY_PROFILES[profile];
	if (!settings) {
		throw new Error(`Unknown proxy profile: ${profile}`);
	}
	return [
		"-hide_banner",
		"-nostdin",
		"-y",
		"-i",
		inputPath,
		"-map",
		"0:v:0",
		"-map",
		"0:a:0?",
		"-vf",
		proxyVideoFilter({ profile: settings, probe }),
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-crf",
		String(settings.crf),
		"-pix_fmt",
		"yuv420p",
		"-g",
		String(settings.maxFps),
		"-c:a",
		"aac",
		"-b:a",
		settings.audioBitrate,
		"-ar",
		"48000",
		"-movflags",
		"+faststart",
		"-progress",
		"pipe:1",
		"-nostats",
		outputPath,
	];
}

function boundedAppend({
	current,
	chunk,
	maxLength,
}: {
	current: string;
	chunk: string;
	maxLength: number;
}): string {
	const combined = current + chunk;
	return combined.length <= maxLength
		? combined
		: combined.slice(combined.length - maxLength);
}

export const runNativeTranscode: NativeTranscodeRunner = ({
	args,
	signal,
	durationSeconds,
	timeoutMs = 2 * 60 * 60 * 1000,
	onProgress,
}) =>
	new Promise((resolve, reject) => {
		const binary = process.env.FFMPEG_BIN ?? "ffmpeg";
		const child = spawn(binary, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stderr = "";
		let stdoutBuffer = "";
		let settled = false;
		let timedOut = false;
		const boundedTimeoutMs = Math.max(1, timeoutMs);
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, boundedTimeoutMs);

		const finish = ({
			error,
		}: {
			error?: Error;
		}): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			signal.removeEventListener("abort", abort);
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		};
		const abort = () => {
			child.kill("SIGTERM");
			setTimeout(() => {
				if (child.exitCode === null) {
					child.kill("SIGKILL");
				}
			}, 1_000).unref();
		};
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) {
			abort();
		}

		child.stdout.on("data", (chunk: Buffer) => {
			stdoutBuffer += chunk.toString("utf8");
			const lines = stdoutBuffer.split(/\r?\n/);
			stdoutBuffer = lines.pop() ?? "";
			for (const line of lines) {
				const [key, rawValue] = line.split("=", 2);
				if (key !== "out_time_us" && key !== "out_time_ms") {
					continue;
				}
				const microseconds = Number(rawValue);
				if (!Number.isFinite(microseconds)) {
					continue;
				}
				const processedSeconds = microseconds / 1_000_000;
				onProgress({
					processedSeconds,
					progress:
						durationSeconds && durationSeconds > 0
							? Math.min(0.99, processedSeconds / durationSeconds)
							: 0,
				});
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = boundedAppend({
				current: stderr,
				chunk: chunk.toString("utf8"),
				maxLength: 64 * 1024,
			});
		});
		child.on("error", (error) => finish({ error }));
		child.on("close", (code) => {
			if (timedOut) {
				finish({
					error: new Error(
						`Transcode timed out after ${boundedTimeoutMs} ms`,
					),
				});
			} else if (signal.aborted) {
				finish({
					error: new DOMException("Transcode cancelled", "AbortError"),
				});
			} else if (code !== 0) {
				finish({
					error: new Error(
						`FFmpeg exited with code ${code}: ${stderr.trim()}`,
					),
				});
			} else {
				finish({});
			}
		});
	});

function cloneJob(job: NativeMediaJob): NativeMediaJob {
	return structuredClone(job);
}

function isAbortError(error: unknown): boolean {
	return (
		error instanceof DOMException
			? error.name === "AbortError"
			: error instanceof Error && error.name === "AbortError"
	);
}

export class NativeMediaJobService {
	private readonly projectsRoot: string;
	private readonly probeFile?: ProbeFile;
	private readonly transcode: NativeTranscodeRunner;
	private readonly maxConcurrent: number;
	private readonly jobs = new Map<string, Map<string, NativeMediaJob>>();
	private readonly loadedProjects = new Set<string>();
	private readonly loadingProjects = new Map<
		string,
		Promise<Map<string, NativeMediaJob>>
	>();
	private readonly controllers = new Map<string, AbortController>();
	private readonly pendingExecutions: QueuedProxyExecution[] = [];
	private activeExecutions = 0;

	constructor({
		projectsRoot = defaultProjectsRoot(),
		probeFile,
		transcode = runNativeTranscode,
		maxConcurrent = 2,
	}: {
		projectsRoot?: string;
		probeFile?: ProbeFile;
		transcode?: NativeTranscodeRunner;
		maxConcurrent?: number;
	} = {}) {
		this.projectsRoot = projectsRoot;
		this.probeFile = probeFile;
		this.transcode = transcode;
		this.maxConcurrent = Math.max(
			1,
			Math.min(8, Math.trunc(maxConcurrent)),
		);
	}

	private controllerKey({
		projectId,
		jobId,
	}: {
		projectId: string;
		jobId: string;
	}): string {
		return `${projectId}:${jobId}`;
	}

	private async ensureLoaded({
		projectId,
	}: {
		projectId: string;
	}): Promise<Map<string, NativeMediaJob>> {
		validateId({ value: projectId, label: "project id" });
		if (this.loadedProjects.has(projectId)) {
			return this.jobs.get(projectId) ?? new Map();
		}
		const loading = this.loadingProjects.get(projectId);
		if (loading) {
			return loading;
		}
		const load = this.loadProjectJobs({ projectId });
		this.loadingProjects.set(projectId, load);
		try {
			return await load;
		} finally {
			this.loadingProjects.delete(projectId);
		}
	}

	private async loadProjectJobs({
		projectId,
	}: {
		projectId: string;
	}): Promise<Map<string, NativeMediaJob>> {
		const projectJobs = new Map<string, NativeMediaJob>();
		let recoveredInterruptedJob = false;
		try {
			const parsed: unknown = JSON.parse(
				await readFile(
					jobsPath({ projectsRoot: this.projectsRoot, projectId }),
					"utf8",
				),
			);
			if (Array.isArray(parsed)) {
				for (const candidate of parsed) {
					if (isNativeMediaJob(candidate)) {
						const job = candidate;
						if (
							job.status === "queued" ||
							job.status === "running"
						) {
							job.status = "failed";
							recoveredInterruptedJob = true;
							job.error = {
								code: "interrupted",
								message:
									"The application restarted before this job completed",
							};
							job.finishedAt = new Date().toISOString();
						}
						projectJobs.set(job.id, job);
					}
				}
			}
		} catch (error) {
			if (
				!(
					error instanceof Error &&
					"code" in error &&
					error.code === "ENOENT"
				)
			) {
				throw error;
			}
		}
		this.jobs.set(projectId, projectJobs);
		this.loadedProjects.add(projectId);
		if (recoveredInterruptedJob) {
			await this.persist({ projectId });
		}
		return projectJobs;
	}

	private enqueueProxy(execution: QueuedProxyExecution): void {
		this.pendingExecutions.push(execution);
		this.drainProxyQueue();
	}

	private drainProxyQueue(): void {
		while (
			this.activeExecutions < this.maxConcurrent &&
			this.pendingExecutions.length > 0
		) {
			const execution = this.pendingExecutions.shift();
			if (!execution) {
				return;
			}
			this.activeExecutions += 1;
			void this.executeProxy(execution).finally(() => {
				this.activeExecutions -= 1;
				this.drainProxyQueue();
			});
		}
	}

	private async persist({ projectId }: { projectId: string }): Promise<void> {
		const projectJobs = this.jobs.get(projectId) ?? new Map();
		await writeJsonAtomic({
			filePath: jobsPath({
				projectsRoot: this.projectsRoot,
				projectId,
			}),
			value: [...projectJobs.values()],
		});
	}

	private updateJob({
		projectId,
		jobId,
		update,
	}: {
		projectId: string;
		jobId: string;
		update: (job: NativeMediaJob) => void;
	}): NativeMediaJob {
		const job = this.jobs.get(projectId)?.get(jobId);
		if (!job) {
			throw new Error(`No media job ${jobId}`);
		}
		update(job);
		job.updatedAt = new Date().toISOString();
		return job;
	}

	async ensureProxy({
		projectId,
		assetId,
		profile = "standard",
		force = false,
	}: {
		projectId: string;
		assetId: string;
		profile?: ProxyProfileName;
		force?: boolean;
	}): Promise<NativeMediaJob> {
		validateId({ value: projectId, label: "project id" });
		validateId({ value: assetId, label: "asset id" });
		if (!PROXY_PROFILE_NAMES.includes(profile)) {
			throw new Error(`Unknown proxy profile: ${profile}`);
		}
		const projectJobs = await this.ensureLoaded({ projectId });
		const probe = await probeProjectMedia({
			projectId,
			assetId,
			projectsRoot: this.projectsRoot,
			probeFile: this.probeFile,
		});
		if (probe.probe.videoStreams.length === 0) {
			throw new Error(`Asset ${assetId} has no video stream`);
		}
		const cacheKey = `${probe.source.sha256}:${profile}`;
		if (!force) {
			const reusable = [...projectJobs.values()]
				.reverse()
				.find(
					(job) =>
						job.assetId === assetId &&
						job.cacheKey === cacheKey &&
						(job.status === "queued" ||
							job.status === "running" ||
							job.status === "succeeded"),
				);
			if (reusable) {
				if (
					reusable.status !== "succeeded" ||
					(reusable.result &&
						(await stat(reusable.result.outputPath)
							.then(() => true)
							.catch(() => false)))
				) {
					return { ...cloneJob(reusable), cacheHit: true };
				}
			}
		}

		const now = new Date().toISOString();
		const job: NativeMediaJob = {
			id: randomUUID(),
			kind: "proxy",
			projectId,
			assetId,
			profile,
			cacheKey,
			status: "queued",
			progress: 0,
			processedSeconds: 0,
			createdAt: now,
			updatedAt: now,
		};
		projectJobs.set(job.id, job);
		await this.persist({ projectId });
		const controller = new AbortController();
		this.controllers.set(
			this.controllerKey({ projectId, jobId: job.id }),
			controller,
		);
		this.enqueueProxy({ jobId: job.id, probe, controller });
		return cloneJob(job);
	}

	private async executeProxy({
		jobId,
		probe,
		controller,
	}: {
		jobId: string;
		probe: ProjectMediaProbeResult;
		controller: AbortController;
	}): Promise<void> {
		const { projectId, assetId, profile } = this.findJob({ jobId });
		const directory = mediaDirectory({
			projectsRoot: this.projectsRoot,
			projectId,
		});
		const inputPath = path.join(
			directory,
			`${assetId}.${probe.source.extension}`,
		);
		const outputPath = path.join(directory, `${assetId}-proxy.mp4`);
		const temporaryOutputPath = path.join(
			directory,
			`.${assetId}-proxy.${jobId}.tmp.mp4`,
		);
		try {
			if (controller.signal.aborted) {
				throw new DOMException("Transcode cancelled", "AbortError");
			}
			this.updateJob({
				projectId,
				jobId,
				update: (job) => {
					job.status = "running";
					job.startedAt = new Date().toISOString();
				},
			});
			await this.persist({ projectId });
			const args = buildProxyFfmpegArgs({
				inputPath,
				outputPath: temporaryOutputPath,
				profile,
				probe,
			});
			if (controller.signal.aborted) {
				throw new DOMException("Transcode cancelled", "AbortError");
			}
			await this.transcode({
				args,
				inputPath,
				temporaryOutputPath,
				signal: controller.signal,
				durationSeconds: probe.probe.container.durationSeconds,
				onProgress: ({ progress, processedSeconds }) => {
					if (controller.signal.aborted) {
						return;
					}
					this.updateJob({
						projectId,
						jobId,
						update: (job) => {
							job.progress = Math.max(
								job.progress,
								Math.min(0.99, progress),
							);
							job.processedSeconds = Math.max(
								job.processedSeconds,
								processedSeconds,
							);
						},
					});
					void this.persist({ projectId });
				},
			});
			if (controller.signal.aborted) {
				throw new DOMException("Transcode cancelled", "AbortError");
			}
			await rename(temporaryOutputPath, outputPath);
			const outputStat = await stat(outputPath);
			const video = probe.probe.videoStreams[0];
			const dimensions = proxyDimensions({
				width: video?.width ?? 2,
				height: video?.height ?? 2,
				rotationDegrees: video?.rotationDegrees ?? 0,
				maxLongEdge: PROXY_PROFILES[profile].maxLongEdge,
			});
			const mediaIndex = await readMediaIndex({ directory });
			const original = mediaIndex[assetId];
			if (!original) {
				throw new Error(`No asset ${assetId}`);
			}
			const storageId = `${assetId}-proxy`;
			const proxy: NativeProxyMetadata = {
				storageId,
				name: `${path.parse(probe.source.fileName).name}.proxy.mp4`,
				mimeType: "video/mp4",
				size: outputStat.size,
				width: dimensions.width,
				height: dimensions.height,
				generatedAt: new Date().toISOString(),
				sourceSize: probe.source.sizeBytes,
				sourceLastModified: probe.source.mtimeMs,
				enabled: true,
				profile,
				sourceSha256: probe.source.sha256,
			};
			mediaIndex[assetId] = { ...original, proxy };
			mediaIndex[storageId] = {
				id: storageId,
				ext: "mp4",
				mimeType: "video/mp4",
				name: proxy.name,
				type: "video",
				size: proxy.size,
				lastModified: outputStat.mtimeMs,
				width: proxy.width,
				height: proxy.height,
				duration: probe.probe.container.durationSeconds ?? undefined,
				fps: Math.min(
					video?.averageFrameRate ??
						PROXY_PROFILES[profile].maxFps,
					PROXY_PROFILES[profile].maxFps,
				),
				hasAudio: probe.probe.audioStreams.length > 0,
			};
			await writeJsonAtomic({
				filePath: path.join(directory, "index.json"),
				value: mediaIndex,
			});
			this.updateJob({
				projectId,
				jobId,
				update: (job) => {
					job.status = "succeeded";
					job.progress = 1;
					job.processedSeconds =
						probe.probe.container.durationSeconds ??
						job.processedSeconds;
					job.finishedAt = new Date().toISOString();
					job.result = { proxy, outputPath };
					delete job.error;
				},
			});
		} catch (error) {
			const cancelled =
				controller.signal.aborted || isAbortError(error);
			this.updateJob({
				projectId,
				jobId,
				update: (job) => {
					job.status = cancelled ? "cancelled" : "failed";
					job.finishedAt = new Date().toISOString();
					if (!cancelled) {
						job.error = {
							code: "transcode_failed",
							message:
								error instanceof Error
									? error.message
									: String(error),
						};
					}
				},
			});
		} finally {
			await rm(temporaryOutputPath, { force: true }).catch(
				() => undefined,
			);
			this.controllers.delete(
				this.controllerKey({ projectId, jobId }),
			);
			await this.persist({ projectId });
		}
	}

	private findJob({ jobId }: { jobId: string }): NativeMediaJob {
		for (const projectJobs of this.jobs.values()) {
			const job = projectJobs.get(jobId);
			if (job) {
				return job;
			}
		}
		throw new Error(`No media job ${jobId}`);
	}

	async get({
		projectId,
		jobId,
	}: {
		projectId: string;
		jobId: string;
	}): Promise<NativeMediaJob | null> {
		const jobs = await this.ensureLoaded({ projectId });
		const job = jobs.get(jobId);
		return job ? cloneJob(job) : null;
	}

	async list({
		projectId,
	}: {
		projectId: string;
	}): Promise<NativeMediaJob[]> {
		const jobs = await this.ensureLoaded({ projectId });
		return [...jobs.values()]
			.sort((left, right) =>
				right.createdAt.localeCompare(left.createdAt),
			)
			.map(cloneJob);
	}

	async cancel({
		projectId,
		jobId,
	}: {
		projectId: string;
		jobId: string;
	}): Promise<NativeMediaJob> {
		await this.ensureLoaded({ projectId });
		const job = this.updateJob({
			projectId,
			jobId,
			update: (candidate) => {
				if (!TERMINAL_STATUSES.has(candidate.status)) {
					candidate.status = "cancelled";
					candidate.finishedAt = new Date().toISOString();
				}
			},
		});
		const key = this.controllerKey({ projectId, jobId });
		const controller = this.controllers.get(key);
		const pendingIndex = this.pendingExecutions.findIndex(
			(execution) => execution.jobId === jobId,
		);
		if (pendingIndex >= 0) {
			this.pendingExecutions.splice(pendingIndex, 1);
			this.controllers.delete(key);
		} else {
			controller?.abort();
		}
		await this.persist({ projectId });
		if (controller) {
			const deadline = Date.now() + 2_000;
			while (
				this.controllers.has(key) &&
				Date.now() < deadline
			) {
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		}
		return cloneJob(
			this.jobs.get(projectId)?.get(jobId) ?? job,
		);
	}

	async retry({
		projectId,
		jobId,
	}: {
		projectId: string;
		jobId: string;
	}): Promise<NativeMediaJob> {
		const existing = await this.get({ projectId, jobId });
		if (!existing) {
			throw new Error(`No media job ${jobId}`);
		}
		if (
			existing.status !== "failed" &&
			existing.status !== "cancelled"
		) {
			throw new Error(`Job ${jobId} cannot be retried`);
		}
		return this.ensureProxy({
			projectId,
			assetId: existing.assetId,
			profile: existing.profile,
			force: true,
		});
	}

	async waitForStatus({
		projectId,
		jobId,
		status,
		timeoutMs = 5_000,
	}: {
		projectId: string;
		jobId: string;
		status: NativeMediaJobStatus;
		timeoutMs?: number;
	}): Promise<NativeMediaJob> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const job = await this.get({ projectId, jobId });
			if (!job) {
				throw new Error(`No media job ${jobId}`);
			}
			if (job.status === status) {
				return job;
			}
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		throw new Error(`Timed out waiting for job ${jobId} to be ${status}`);
	}

	async waitForTerminal({
		projectId,
		jobId,
		timeoutMs = 5_000,
	}: {
		projectId: string;
		jobId: string;
		timeoutMs?: number;
	}): Promise<NativeMediaJob> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const job = await this.get({ projectId, jobId });
			if (!job) {
				throw new Error(`No media job ${jobId}`);
			}
			if (TERMINAL_STATUSES.has(job.status)) {
				return job;
			}
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		throw new Error(`Timed out waiting for job ${jobId}`);
	}
}

export const nativeMediaJobs = new NativeMediaJobService();
