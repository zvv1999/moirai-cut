import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	copyFile,
	cp,
	mkdir,
	readFile,
	readdir,
	realpath,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { runFfprobe } from "@/server/media-probe";
import { normalizeFfprobe } from "@/media/codec-capabilities";
import {
	PROJECT_EXPORT_TARGETS,
	type InterchangePlan,
	type InterchangeSource,
	type ProjectExportResult,
	type ProjectExportTarget,
} from "@/export/project-interchange";

const exec = promisify(execFile);
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const JOB_ID = /^[a-f0-9-]{36}$/;
const repo = path.resolve(
	process.cwd(),
	process.cwd().endsWith(`${path.sep}apps${path.sep}web`) ? "../.." : ".",
);
const root = () =>
	process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects");
const isRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === "object" && !Array.isArray(v);
let build: Promise<unknown> | undefined;

export async function interchangeCommand<T>(
	input: unknown,
	signal?: AbortSignal,
): Promise<T> {
	const binary =
		process.env.MOIRAI_PROJECT_EXPORT_BIN ??
		path.join(repo, "target/debug/moirai-project-export");
	if (!process.env.MOIRAI_PROJECT_EXPORT_BIN) {
		build ??= exec(
			process.env.CARGO ?? path.join(homedir(), ".cargo/bin/cargo"),
			["build", "--quiet", "-p", "moirai-project-export"],
			{ cwd: repo, timeout: 180_000 },
		).catch((error) => {
			build = undefined;
			throw error;
		});
		await build;
	}
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		const child = spawn(binary, [], {
			cwd: repo,
			signal,
			timeout: 30_000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let output = "",
			stderr = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
			if (output.length > 64 * 1024 * 1024) {
				child.kill();
				reject(new Error("Export response too large"));
			}
		});
		child.stderr.on("data", (chunk) => {
			stderr = (stderr + chunk).slice(-4000);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			try {
				const value = JSON.parse(output);
				if (code || value.error) reject(new Error(value.error ?? stderr));
				else resolve(value);
			} catch {
				reject(new Error(stderr || "工程导出服务未返回有效结果"));
			}
		});
		child.stdin.on("error", () => {});
		child.stdin.end(JSON.stringify(input));
	});
}

function directory(projectId: string, jobId?: string, projectsRoot = root()) {
	if (!SAFE_ID.test(projectId) || (jobId !== undefined && !JOB_ID.test(jobId)))
		throw new Error("Invalid export identifier");
	return path.join(
		path.resolve(projectsRoot),
		projectId,
		"exports",
		...(jobId ? [`nle-${jobId}`] : []),
	);
}

// Only ids, never paths supplied by a browser, resolve to original project media.
function referencedMedia(
	value: unknown,
	found = new Set<string>(),
	depth = 0,
): Set<string> {
	if (depth > 40) throw new Error("Project nesting is too deep");
	if (Array.isArray(value))
		for (const item of value) referencedMedia(item, found, depth + 1);
	else if (isRecord(value)) {
		if (typeof value.mediaId === "string") found.add(value.mediaId);
		for (const child of Object.values(value))
			if (child && typeof child === "object")
				referencedMedia(child, found, depth + 1);
	}
	return found;
}

export async function prepareProjectExport({
	projectId,
	target,
	project,
	projectsRoot = root(),
	signal,
}: {
	projectId: string;
	target: ProjectExportTarget;
	project: unknown;
	projectsRoot?: string;
	signal?: AbortSignal;
}): Promise<InterchangePlan> {
	if (
		!Object.hasOwn(PROJECT_EXPORT_TARGETS, target) ||
		!isRecord(project) ||
		!isRecord(project.metadata) ||
		project.metadata.id !== projectId
	)
		throw new Error("Invalid project export request");
	const id = randomUUID();
	const folder = directory(projectId, id, projectsRoot);
	const mediaDir = path.join(path.resolve(projectsRoot), projectId, "media");
	const references = referencedMedia(project);
	if (references.size > 10000) throw new Error("Too many source assets");
	const index: Record<string, Record<string, unknown>> = references.size
		? JSON.parse(await readFile(path.join(mediaDir, "index.json"), "utf8"))
		: {};
	const sources: InterchangeSource[] = [];
	const originals = new Map<string, string>();
	for (const assetId of references) {
		signal?.throwIfAborted();
		const entry = index[assetId];
		if (
			!SAFE_ID.test(assetId) ||
			!isRecord(entry) ||
			typeof entry.ext !== "string" ||
			!/^[A-Za-z0-9]{1,8}$/.test(entry.ext)
		)
			throw new Error(`原素材缺失：${assetId}`);
		const source = await realpath(
			path.join(mediaDir, `${assetId}.${entry.ext}`),
		);
		const resolvedMedia = await realpath(mediaDir);
		if (!source.startsWith(resolvedMedia + path.sep))
			throw new Error("Source escapes project media directory");
		const probe = normalizeFfprobe(await runFfprobe({ filePath: source }));
		const video = probe.videoStreams[0],
			audio = probe.audioStreams[0];
		const destination = path.join(folder, "media", `${assetId}.${entry.ext}`);
		const still =
			entry.type === "image" ||
			["png", "jpg", "jpeg", "webp", "bmp"].includes(entry.ext.toLowerCase());
		sources.push({
			id: assetId,
			name: typeof entry.name === "string" ? entry.name : assetId,
			path: destination,
			url: pathToFileURL(destination).href,
			width: video?.width ?? 0,
			height: video?.height ?? 0,
			durationSeconds: still ? 10800 : (probe.container.durationSeconds ?? 0),
			audioChannels: audio?.channels ?? 0,
			sampleRate: audio?.sampleRate ?? 48000,
			still,
			fps: video?.averageFrameRate ?? video?.nominalFrameRate ?? 0,
			requiresBake:
				!!video &&
				(video.frameRateMode === "variable" ||
					video.rotationDegrees !== 0 ||
					(video.sampleAspectRatio !== null &&
						video.sampleAspectRatio !== "1:1")),
		});
		originals.set(assetId, source);
	}
	const plan = await interchangeCommand<InterchangePlan>(
		{ action: "plan", project, sources, target, folder, id, now: Date.now() },
		signal,
	);
	try {
		await mkdir(path.join(folder, "media"), { recursive: true });
		for (const source of sources) {
			signal?.throwIfAborted();
			await copyFile(
				originals.get(source.id)!,
				source.path,
				constants.COPYFILE_FICLONE,
			);
		}
		await writeFile(path.join(folder, ".plan.json"), JSON.stringify(plan));
		await writeFile(
			path.join(folder, "source-project.json"),
			JSON.stringify(project, null, 2),
		);
		await writeFile(
			path.join(folder, "source-media-index.json"),
			JSON.stringify(
				Object.fromEntries([...references].map((key) => [key, index[key]])),
				null,
				2,
			),
		);
		signal?.throwIfAborted();
		return plan;
	} catch (error) {
		await rm(folder, { recursive: true, force: true });
		throw error;
	}
}

async function readPlan(projectId: string, id: string, projectsRoot?: string) {
	const folder = directory(projectId, id, projectsRoot);
	return JSON.parse(
		await readFile(path.join(folder, ".plan.json"), "utf8"),
	) as InterchangePlan;
}

export async function uploadProjectExportPart({
	projectId,
	id,
	bakeId,
	frame,
	bytes,
	projectsRoot,
}: {
	projectId: string;
	id: string;
	bakeId: string;
	frame: number;
	bytes: Uint8Array;
	projectsRoot?: string;
}) {
	const plan = await readPlan(projectId, id, projectsRoot);
	const bake = plan.bakes.find((b) => b.id === bakeId);
	if (!bake || !Number.isInteger(frame) || frame < 0)
		throw new Error("Invalid render part");
	const audio = bake.kind === "audio" || bake.kind === "mix";
	const count =
		["still", "background"].includes(bake.kind) || audio
			? 1
			: bake.end - bake.start;
	if (frame >= count || bytes.length > (audio ? 256 : 64) * 1024 * 1024)
		throw new Error("Render part exceeds its bounds");
	const signature = audio
		? [82, 73, 70, 70]
		: [137, 80, 78, 71, 13, 10, 26, 10];
	if (!signature.every((byte, i) => bytes[i] === byte))
		throw new Error("Invalid render part format");
	if (!audio) {
		if (bytes.length < 24) throw new Error("Invalid PNG header");
		const header = new DataView(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength,
		);
		if (
			header.getUint32(16) !== plan.width ||
			header.getUint32(20) !== plan.height
		)
			throw new Error("Render dimensions do not match the export canvas");
	}
	const staging = path.join(plan.folder, ".render", bake.id);
	await mkdir(staging, { recursive: true });
	const output = path.join(
		staging,
		audio ? "audio.wav" : `${String(frame).padStart(8, "0")}.png`,
	);
	const temporary = `${output}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, bytes);
		await rename(temporary, output);
	} finally {
		await rm(temporary, { force: true });
	}
}

async function finalizeProjectExport({
	projectId,
	id,
	projectsRoot = root(),
	signal,
}: {
	projectId: string;
	id: string;
	projectsRoot?: string;
	signal?: AbortSignal;
}): Promise<ProjectExportResult> {
	const plan = await readPlan(projectId, id, projectsRoot);
	for (const bake of plan.bakes) {
		signal?.throwIfAborted();
		const staging = path.join(plan.folder, ".render", bake.id);
		const output = plan.files.find((s) => s.id === bake.id)!.path;
		if (["still", "background"].includes(bake.kind)) {
			await copyFile(path.join(staging, "00000000.png"), output);
			continue;
		}
		if (bake.kind === "audio" || bake.kind === "mix") {
			// Browser audio rendering retains original timeline time. Trim the requested interval in PCM.
			await exec(
				process.env.FFMPEG_BIN ?? "ffmpeg",
				[
					"-v",
					"error",
					"-nostdin",
					"-y",
					"-i",
					path.join(staging, "audio.wav"),
					"-ss",
					String((bake.start * plan.denominator) / plan.numerator),
					"-t",
					String(((bake.end - bake.start) * plan.denominator) / plan.numerator),
					"-c:a",
					"pcm_s16le",
					output,
				],
				{ signal, timeout: 600_000, maxBuffer: 1024 * 1024 },
			);
		} else {
			for (let frame = 0; frame < bake.end - bake.start; frame++)
				await stat(path.join(staging, `${String(frame).padStart(8, "0")}.png`));
			await exec(
				process.env.FFMPEG_BIN ?? "ffmpeg",
				[
					"-v",
					"error",
					"-nostdin",
					"-y",
					"-framerate",
					`${plan.numerator}/${plan.denominator}`,
					"-i",
					path.join(staging, "%08d.png"),
					"-frames:v",
					String(bake.end - bake.start),
					"-c:v",
					"prores_ks",
					"-profile:v",
					"4",
					"-pix_fmt",
					"yuva444p10le",
					"-an",
					output,
				],
				{ signal, timeout: 1_800_000, maxBuffer: 1024 * 1024 },
			);
		}
		const probe = normalizeFfprobe(await runFfprobe({ filePath: output }));
		const expected =
			((bake.end - bake.start) * plan.denominator) / plan.numerator;
		if (
			Math.abs((probe.container.durationSeconds ?? 0) - expected) >
			Math.max(0.05, plan.denominator / plan.numerator)
		)
			throw new Error(`渲染时长校验失败：${bake.id}`);
	}
	const { documents } = await interchangeCommand<{
		documents: Record<string, string>;
	}>({ action: "serialize", plan }, signal);
	for (const [name, content] of Object.entries(documents)) {
		if (path.basename(name) !== name)
			throw new Error("Invalid generated document path");
		await writeFile(path.join(plan.folder, name), content);
	}
	await writeFile(
		path.join(plan.folder, "export-report.json"),
		JSON.stringify(
			{
				target: plan.target,
				warnings: plan.warnings,
				rendered: plan.bakes,
				source: "source-project.json",
			},
			null,
			2,
		),
	);
	await writeFile(
		path.join(plan.folder, "README.txt"),
		exportInstructions(plan),
	);
	signal?.throwIfAborted();
	const archiveName = `nle-${plan.target}-${id}.zip`;
	const archive = path.join(
		directory(projectId, undefined, projectsRoot),
		archiveName,
	);
	const temporaryArchive = archive.replace(/\.zip$/, ".partial.zip");
	try {
		await exec(
			process.env.ZIP_BIN ?? "zip",
			["-q", "-r", temporaryArchive, ".", "-x", ".render/*", ".plan.json"],
			{ cwd: plan.folder, signal, timeout: 600_000, maxBuffer: 1024 * 1024 },
		);
		await rename(temporaryArchive, archive);
	} finally {
		await rm(temporaryArchive, { force: true });
	}
	await rm(path.join(plan.folder, ".render"), { recursive: true, force: true });
	const result: ProjectExportResult = {
		id,
		createdAt: new Date().toISOString(),
		target: plan.target,
		folder: plan.folder,
		entryPath: path.join(
			plan.folder,
			plan.target === "premiere"
				? "timeline.xml"
				: plan.target === "fcpxml"
					? "timeline.fcpxml"
					: "draft_info.json",
		),
		archiveName,
		warnings: plan.warnings,
	};
	await writeFile(
		path.join(plan.folder, ".result.json"),
		JSON.stringify(result),
	);
	return result;
}

const activeFinishes = new Map<string, Promise<ProjectExportResult>>();
export async function finishProjectExport(
	request: Parameters<typeof finalizeProjectExport>[0],
): Promise<ProjectExportResult> {
	const folder = directory(request.projectId, request.id, request.projectsRoot);
	try {
		return JSON.parse(
			await readFile(path.join(folder, ".result.json"), "utf8"),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const active = activeFinishes.get(folder);
	if (active) return active;
	const work = finalizeProjectExport(request).finally(() =>
		activeFinishes.delete(folder),
	);
	activeFinishes.set(folder, work);
	return work;
}

export async function listProjectExports(
	projectId: string,
	projectsRoot = root(),
): Promise<ProjectExportResult[]> {
	const folder = directory(projectId, undefined, projectsRoot);
	const names = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return [];
		throw error;
	});
	const results: ProjectExportResult[] = [];
	for (const name of names.filter((name) => /^nle-[a-f0-9-]{36}$/.test(name))) {
		try {
			results.push(
				JSON.parse(
					await readFile(path.join(folder, name, ".result.json"), "utf8"),
				),
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function projectExportArchive(
	projectId: string,
	id: string,
	projectsRoot = root(),
) {
	const folder = directory(projectId, id, projectsRoot);
	const result: ProjectExportResult = JSON.parse(
		await readFile(path.join(folder, ".result.json"), "utf8"),
	);
	if (!Object.hasOwn(PROJECT_EXPORT_TARGETS, result.target))
		throw new Error("Invalid export target");
	const name = `nle-${result.target}-${id}.zip`;
	const filePath = path.join(
		directory(projectId, undefined, projectsRoot),
		name,
	);
	return { filePath, name, size: (await stat(filePath)).size };
}

/** Read the app's configured draft location; never accept an arbitrary path from a browser. */
async function installedDraftRoot(target: "jianying" | "capcut") {
	const base =
		process.platform === "darwin"
			? path.join(homedir(), "Movies")
			: process.platform === "win32"
				? (process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"))
				: null;
	if (!base)
		throw new Error(
			"当前系统没有可用的剪映／CapCut 草稿目录，请下载 ZIP 手动导入。",
		);
	const user = path.join(
		base,
		target === "jianying" ? "JianyingPro" : "CapCut",
		"User Data",
	);
	let custom = "";
	try {
		const settings = await readFile(
			path.join(user, "Config", "globalSetting"),
			"utf8",
		);
		let general = true;
		for (const row of settings.split(/\r?\n/)) {
			const line = row.trim();
			if (line.startsWith("[")) general = line === "[General]";
			const match = general && /^currentCustomDraftPath\s*=\s*(.*)$/.exec(line);
			if (match) {
				custom = match[1]
					.replace(/^"(.*)"$/, "$1")
					.replace(
						/\\(?:x([0-9a-fA-F]{1,4})|(\\|"))/g,
						(_match, hex: string, char: string) =>
							hex ? String.fromCharCode(parseInt(hex, 16)) : char,
					);
				break;
			}
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	for (const candidate of [
		custom,
		path.join(user, "Projects", "com.lveditor.draft"),
	]) {
		if (
			candidate &&
			path.isAbsolute(candidate) &&
			(await stat(candidate).then(
				(s) => s.isDirectory(),
				() => false,
			))
		)
			return candidate;
	}
	throw new Error(
		"未找到草稿目录。请先打开剪映／CapCut 创建一个空草稿，或下载 ZIP 手动导入。",
	);
}

export async function installProjectDraft({
	projectId,
	id,
	projectsRoot = root(),
	draftRoot,
}: {
	projectId: string;
	id: string;
	projectsRoot?: string;
	draftRoot?: string;
}) {
	const source = directory(projectId, id, projectsRoot);
	const result: ProjectExportResult = JSON.parse(
		await readFile(path.join(source, ".result.json"), "utf8"),
	);
	if (result.target !== "jianying" && result.target !== "capcut")
		throw new Error("This export is not an app draft");
	const plan = await readPlan(projectId, id, projectsRoot);
	plan.id = randomUUID();
	// Jianying uses the folder name when registering a new local draft.
	const label = Array.from(plan.name.replace(/[<>:"/\\|?*\p{Cc}]/gu, "-").trim())
		.slice(0, 45)
		.join("");
	const destination = path.join(
		draftRoot ?? (await installedDraftRoot(result.target)),
		`Moirai - ${label || "Untitled"} - ${plan.id.slice(0, 8)}`,
	);
	// Reserve our directory exclusively: cleanup must never remove an existing draft.
	await mkdir(destination);
	try {
		await cp(source, destination, {
			recursive: true,
			errorOnExist: true,
			force: false,
		});
		plan.folder = destination;
		for (const file of plan.files) {
			file.path = path.join(destination, "media", path.basename(file.path));
			file.url = pathToFileURL(file.path).href;
		}
		const { documents } = await interchangeCommand<{
			documents: Record<string, string>;
		}>({ action: "serialize", plan });
		for (const [name, content] of Object.entries(documents))
			await writeFile(path.join(destination, name), content);
		await rm(path.join(destination, ".plan.json"), { force: true });
		await rm(path.join(destination, ".result.json"), { force: true });
		return { folder: destination };
	} catch (error) {
		await rm(destination, { recursive: true, force: true });
		throw error;
	}
}

function exportInstructions(plan: InterchangePlan) {
	return `Moirai Cut → ${PROJECT_EXPORT_TARGETS[plan.target]}\n\n${plan.target === "premiere" ? "Premiere：文件 → 导入 timeline.xml。Resolve：导入时间线 → XML。" : plan.target === "fcpxml" ? "Final Cut Pro：文件 → 导入 → XML，选择 timeline.fcpxml。" : "退出剪映／CapCut，把整个导出目录放入该应用设置中的草稿目录，再启动应用。若移动到另一台电脑，请按素材名称重新链接 media 目录中的原素材；草稿采用绝对素材路径。请先保留原目录，验证导入后再清理。"}\n\n同机使用入口文件即可。跨机器请完整解压 ZIP；若提示媒体离线，重新链接 media 目录。\nsubtitles.srt 为可编辑字幕文本。source-project.json / source-media-index.json 保留导出时的 Moirai 快照。\n\n${plan.warnings.join("\n")}\n\n兼容性：XML/FCPXML 使用公开交换格式；剪映/CapCut 草稿格式未公开且随版本变化，需要在目标版本验证。\n`;
}

export async function cancelProjectExport(
	projectId: string,
	id: string,
	projectsRoot = root(),
) {
	// A lost HTTP response must not destroy a completed export. It remains recoverable in history.
	try {
		await stat(
			path.join(directory(projectId, id, projectsRoot), ".result.json"),
		);
		return;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (activeFinishes.has(directory(projectId, id, projectsRoot))) {
		await activeFinishes
			.get(directory(projectId, id, projectsRoot))!
			.catch(() => {});
		try {
			await stat(
				path.join(directory(projectId, id, projectsRoot), ".result.json"),
			);
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	await rm(directory(projectId, id, projectsRoot), {
		recursive: true,
		force: true,
	});
}
