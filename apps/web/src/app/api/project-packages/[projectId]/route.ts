import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	copyFile,
	link,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import {
	buildPortableProjectManifest,
	collectPortableProjectCompanions,
	parsePortableProjectManifest,
	type PortableMediaMode,
	type PortableProjectFile,
	validatePortableProjectManifest,
} from "@/project/portable-package";

const PROJECTS_ROOT =
	process.env.OPENCUT_PROJECTS_DIR ?? path.join(homedir(), "OpenCutProjects");
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_PACKAGE = /^[\p{L}\p{N}_. -]{1,120}\.opencut$/u;

type Context = { params: Promise<{ projectId: string }> };

function projectDir(projectId: string): string {
	if (!SAFE_ID.test(projectId)) throw new Error("Unsafe project id");
	return path.join(PROJECTS_ROOT, projectId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mediaModeOf(value: unknown): PortableMediaMode {
	return value === "originals" ||
		value === "proxies" ||
		value === "originals-and-proxies"
		? value
		: "originals-and-proxies";
}

function packageFilesForMode({
	entries,
	mediaMode,
}: {
	entries: string[];
	mediaMode: PortableMediaMode;
}): string[] {
	return entries.filter((entry) => {
		if (entry.startsWith(".")) return false;
		const isProxy = /-proxy\.[^.]+$/i.test(entry);
		if (mediaMode === "proxies") return isProxy;
		if (mediaMode === "originals") return !isProxy;
		return true;
	});
}

async function cloneFile({
	source,
	destination,
}: {
	source: string;
	destination: string;
}): Promise<void> {
	try {
		await link(source, destination);
	} catch {
		await copyFile(source, destination, constants.COPYFILE_FICLONE);
	}
}

function activeTracks(document: Record<string, unknown>) {
	const scenes = Array.isArray(document.scenes) ? document.scenes : [];
	const currentSceneId =
		typeof document.currentSceneId === "string"
			? document.currentSceneId
			: null;
	const scene =
		scenes.find(
			(candidate) => isRecord(candidate) && candidate.id === currentSceneId,
		) ??
		scenes.find(
			(candidate) => isRecord(candidate) && candidate.isMain === true,
		) ??
		scenes[0];
	if (!isRecord(scene) || !isRecord(scene.tracks)) return [];
	const tracks = scene.tracks;
	const candidates = [
		...(Array.isArray(tracks.overlay) ? tracks.overlay : []),
		tracks.main,
		...(Array.isArray(tracks.audio) ? tracks.audio : []),
	];
	return candidates.flatMap((candidate) => {
		if (
			!isRecord(candidate) ||
			typeof candidate.id !== "string" ||
			typeof candidate.type !== "string" ||
			!Array.isArray(candidate.elements)
		) {
			return [];
		}
		return [
			{
				id: candidate.id,
				type: candidate.type,
				elements: candidate.elements.flatMap((element) => {
					if (
						!isRecord(element) ||
						typeof element.id !== "string" ||
						typeof element.name !== "string" ||
						typeof element.type !== "string" ||
						!isRecord(element.params)
					) {
						return [];
					}
					return [
						{
							id: element.id,
							name: element.name,
							type: element.type,
							params: element.params,
						},
					];
				}),
			},
		];
	});
}

function captionPayload(document: Record<string, unknown>) {
	return activeTracks(document).flatMap((track) =>
		track.elements.flatMap((element) =>
			element.type === "text" &&
			(element.params["caption.enabled"] === true ||
				/^Caption(?:\s|$)/i.test(element.name))
				? [
						{
							id: element.id,
							name: element.name,
							content:
								typeof element.params["caption.primaryText"] === "string"
									? element.params["caption.primaryText"]
									: element.params.content,
							secondaryText: element.params["caption.secondaryText"],
							speaker: element.params["caption.speaker"],
						},
					]
				: [],
		),
	);
}

// eslint-disable-next-line opencut/prefer-object-params -- Next.js route handlers require (request, context).
export async function GET(_request: Request, { params }: Context) {
	try {
		const { projectId } = await params;
		const packagesDir = path.join(projectDir(projectId), "packages");
		const names = await readdir(packagesDir).catch(() => []);
		const packages = [];
		for (const name of names.filter((entry) => SAFE_PACKAGE.test(entry))) {
			const manifestPath = path.join(packagesDir, name, "manifest.json");
			try {
				const manifest: unknown = JSON.parse(
					await readFile(manifestPath, "utf8"),
				);
				const parsedManifest = parsePortableProjectManifest(manifest);
				if (!parsedManifest) continue;
				const validation = validatePortableProjectManifest(parsedManifest);
				packages.push({
					name,
					path: path.join(packagesDir, name),
					manifest: parsedManifest,
					validation,
				});
			} catch {
				packages.push({
					name,
					path: path.join(packagesDir, name),
					manifest: null,
					validation: { ok: false, errors: ["Manifest could not be read"] },
				});
			}
		}
		return NextResponse.json({ packages });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 400 },
		);
	}
}

// eslint-disable-next-line opencut/prefer-object-params -- Next.js route handlers require (request, context).
export async function POST(request: Request, { params }: Context) {
	const { projectId } = await params;
	const sourceDir = projectDir(projectId);
	const body: unknown = await request.json().catch(() => ({}));
	const mediaMode = mediaModeOf(isRecord(body) ? body.mediaMode : null);
	const documentText = await readFile(
		path.join(sourceDir, "project.json"),
		"utf8",
	);
	const document: unknown = JSON.parse(documentText);
	if (!isRecord(document) || !isRecord(document.metadata)) {
		return NextResponse.json(
			{ error: "Project document is missing metadata" },
			{ status: 400 },
		);
	}
	const projectName =
		typeof document.metadata.name === "string"
			? document.metadata.name
			: "OpenCut project";
	const revision =
		typeof document.revision === "number" ? document.revision : 0;
	const safeBase =
		projectName
			.normalize("NFKC")
			.replace(/[^\p{L}\p{N}_. -]+/gu, "-")
			.trim()
			.slice(0, 70) || "OpenCut-project";
	const packageName = `${safeBase}-r${revision}.opencut`;
	const packagesDir = path.join(sourceDir, "packages");
	const destination = path.join(packagesDir, packageName);
	const temporary = path.join(packagesDir, `.${randomUUID()}.tmp`);

	try {
		await mkdir(path.join(temporary, "media"), { recursive: true });
		await mkdir(path.join(temporary, "captions"), { recursive: true });
		await mkdir(path.join(temporary, "fonts"), { recursive: true });
		await writeFile(path.join(temporary, "project.json"), documentText, "utf8");

		const files: PortableProjectFile[] = [
			{
				path: "project.json",
				sizeBytes: Buffer.byteLength(documentText),
				role: "project",
			},
		];
		const sourceMediaDir = path.join(sourceDir, "media");
		const mediaEntries = await readdir(sourceMediaDir).catch(() => []);
		for (const name of packageFilesForMode({
			entries: mediaEntries,
			mediaMode,
		})) {
			const source = path.join(sourceMediaDir, name);
			const fileInfo = await stat(source);
			if (!fileInfo.isFile()) continue;
			await cloneFile({
				source,
				destination: path.join(temporary, "media", name),
			});
			files.push({
				path: `media/${name}`,
				sizeBytes: fileInfo.size,
				role: /-proxy\.[^.]+$/i.test(name) ? "proxy" : "original",
			});
		}

		const tracks = activeTracks(document);
		const companions = collectPortableProjectCompanions({ tracks });
		const captionsText = JSON.stringify(
			{ captions: captionPayload(document) },
			null,
			2,
		);
		const fontsText = JSON.stringify(
			{
				fonts: companions.fonts,
				note: "Font family references are included. System and licensed font binaries remain external.",
			},
			null,
			2,
		);
		await writeFile(
			path.join(temporary, "captions", "captions.json"),
			captionsText,
			"utf8",
		);
		await writeFile(
			path.join(temporary, "fonts", "font-manifest.json"),
			fontsText,
			"utf8",
		);
		files.push(
			{
				path: "captions/captions.json",
				sizeBytes: Buffer.byteLength(captionsText),
				role: "captions",
			},
			{
				path: "fonts/font-manifest.json",
				sizeBytes: Buffer.byteLength(fontsText),
				role: "fonts",
			},
		);
		const manifest = buildPortableProjectManifest({
			projectId,
			projectName,
			revision,
			createdAt: new Date().toISOString(),
			mediaMode,
			files,
			...companions,
		});
		const validation = validatePortableProjectManifest(manifest);
		if (!validation.ok) {
			throw new Error(validation.errors.join("; "));
		}
		await writeFile(
			path.join(temporary, "manifest.json"),
			JSON.stringify(manifest, null, 2),
			"utf8",
		);
		await rm(destination, { recursive: true, force: true });
		await rename(temporary, destination);
		return NextResponse.json({
			ok: true,
			name: packageName,
			path: destination,
			manifest,
			validation,
		});
	} catch (error) {
		await rm(temporary, { recursive: true, force: true });
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 400 },
		);
	}
}

// eslint-disable-next-line opencut/prefer-object-params -- Next.js route handlers require (request, context).
export async function DELETE(request: Request, { params }: Context) {
	try {
		const { projectId } = await params;
		const body: unknown = await request.json();
		const name =
			isRecord(body) && typeof body.name === "string" ? body.name : "";
		if (!SAFE_PACKAGE.test(name)) throw new Error("Unsafe package name");
		await rm(path.join(projectDir(projectId), "packages", name), {
			recursive: true,
			force: true,
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 400 },
		);
	}
}
