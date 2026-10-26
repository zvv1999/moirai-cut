import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { agentAnalysis } from "../../../rust/agent-analysis.mjs";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CATALOG_SCHEMA = "opencut.media-catalog.v1";

export class MediaAnalysisError extends Error {
	constructor(message, code = "media_analysis_error") {
		super(message);
		this.name = "MediaAnalysisError";
		this.code = code;
	}
}

export async function planTimelineRangeInspection(input) {
	try {
		return await agentAnalysis({ command: "inspect", ...input });
	} catch (error) {
		const message = String(error?.message ?? error);
		throw new MediaAnalysisError(
			message,
			/endSeconds|maxFrames/.test(message)
				? "invalid_timeline_range"
				: "media_analysis_error",
		);
	}
}

function compactProxy(proxy) {
	if (!proxy || typeof proxy !== "object") return undefined;
	return {
		enabled: proxy.enabled === true,
		...(typeof proxy.name === "string" ? { name: proxy.name } : {}),
		...(typeof proxy.mimeType === "string" ? { mimeType: proxy.mimeType } : {}),
		...(typeof proxy.width === "number" ? { width: proxy.width } : {}),
		...(typeof proxy.height === "number" ? { height: proxy.height } : {}),
		...(typeof proxy.size === "number" ? { sizeBytes: proxy.size } : {}),
	};
}

function technicalMetadata(asset) {
	return {
		durationSeconds:
			typeof asset.duration === "number" && Number.isFinite(asset.duration)
				? asset.duration
				: null,
		width: typeof asset.width === "number" ? asset.width : null,
		height: typeof asset.height === "number" ? asset.height : null,
		fps: typeof asset.fps === "number" ? asset.fps : null,
		hasAudio: typeof asset.hasAudio === "boolean" ? asset.hasAudio : null,
		sizeBytes:
			typeof asset.size === "number"
				? asset.size
				: typeof asset.sizeBytes === "number"
					? asset.sizeBytes
					: null,
	};
}

export async function buildMediaCatalog({
	document,
	mediaIndex,
	existingCatalog,
	generatedAt = new Date().toISOString(),
}) {
	const projectId = document?.metadata?.id;
	if (!projectId) {
		throw new MediaAnalysisError(
			"The project document has no metadata.id.",
			"invalid_project",
		);
	}
	const uses = await agentAnalysis({ command: "uses", document });
	const assets = {};
	for (const [assetId, raw] of Object.entries(mediaIndex ?? {})) {
		const asset = raw ?? {};
		const previous = existingCatalog?.assets?.[assetId];
		const proxy = compactProxy(asset.proxy);
		assets[assetId] = {
			id: assetId,
			name:
				typeof asset.name === "string" && asset.name.length > 0
					? asset.name
					: assetId,
			type: asset.type ?? "unknown",
			uri: `opencut://project/${encodeURIComponent(projectId)}/media/${encodeURIComponent(assetId)}`,
			technical: technicalMetadata(asset),
			...(asset.footage ? { footage: asset.footage } : {}),
			...(proxy ? { proxy } : {}),
			timelineUses: uses[assetId] ?? [],
			analysis:
				previous?.analysis && typeof previous.analysis === "object"
					? previous.analysis
					: asset.footage
						? {
								status: "ready",
								provider: asset.footage.modelId,
								summary: asset.footage.description,
								tags: asset.footage.tags,
								roles: asset.footage.roles,
								unsupportedClaims: asset.footage.unsupportedClaims,
								scenes: [],
							}
						: {
								status: "unprocessed",
								provider: null,
								summary: null,
								scenes: [],
								tags: [],
							},
		};
	}
	return {
		schemaVersion: CATALOG_SCHEMA,
		projectId,
		projectName: document?.metadata?.name ?? null,
		revision: typeof document?.revision === "number" ? document.revision : 0,
		generatedAt,
		assets,
	};
}

function projectsRoot(root) {
	return (
		root ??
		process.env.OPENCUT_PROJECTS_DIR ??
		path.join(homedir(), "OpenCutProjects")
	);
}

function catalogFile({ projectId, root }) {
	if (!SAFE_ID.test(projectId)) {
		throw new MediaAnalysisError("Unsafe project id.", "unsafe_project_id");
	}
	return path.join(
		projectsRoot(root),
		projectId,
		"agent",
		"media-catalog.json",
	);
}

export async function readMediaCatalog({ projectId, root } = {}) {
	try {
		const text = await readFile(catalogFile({ projectId, root }), "utf8");
		return JSON.parse(text);
	} catch (error) {
		if (error?.code === "ENOENT") return null;
		if (error instanceof SyntaxError) {
			throw new MediaAnalysisError(
				"The media catalog is not valid JSON.",
				"invalid_media_catalog",
			);
		}
		throw error;
	}
}

export async function writeMediaCatalog({ projectId, catalog, root } = {}) {
	const target = catalogFile({ projectId, root });
	const directory = path.dirname(target);
	await mkdir(directory, { recursive: true });
	const temporary = path.join(directory, `.media-catalog-${randomUUID()}.tmp`);
	await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
	await rename(temporary, target);
	return { path: target, catalog };
}

export async function saveMediaAnalysis({
	projectId,
	assetId,
	analysis,
	root,
}) {
	const catalog = await readMediaCatalog({ projectId, root });
	if (!catalog?.assets?.[assetId]) {
		throw new MediaAnalysisError(
			`No catalog entry for asset ${assetId}. Run build_media_catalog first.`,
			"unknown_catalog_asset",
		);
	}
	catalog.assets[assetId] = {
		...catalog.assets[assetId],
		analysis: {
			...analysis,
			status: "ready",
			analyzedAt: analysis.analyzedAt ?? new Date().toISOString(),
		},
	};
	catalog.updatedAt = new Date().toISOString();
	return writeMediaCatalog({ projectId, catalog, root });
}
