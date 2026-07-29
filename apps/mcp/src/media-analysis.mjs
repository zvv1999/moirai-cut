import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { TICKS_PER_SECOND } from "./document.mjs";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CATALOG_SCHEMA = "opencut.media-catalog.v1";
const RANGE_SCHEMA = "opencut.timeline-inspection.v1";

export class MediaAnalysisError extends Error {
  constructor(message, code = "media_analysis_error") {
    super(message);
    this.name = "MediaAnalysisError";
    this.code = code;
  }
}

function seconds(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value / TICKS_PER_SECOND
    : 0;
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

function allTracks(scene) {
  return [
    ...(scene?.tracks?.main ? [{ ...scene.tracks.main, bucket: "main" }] : []),
    ...(scene?.tracks?.overlay ?? []).map((track) => ({ ...track, bucket: "overlay" })),
    ...(scene?.tracks?.audio ?? []).map((track) => ({ ...track, bucket: "audio" })),
  ];
}

function resolveScene(document, sceneId) {
  const scenes = document?.scenes ?? [];
  const scene =
    (sceneId ? scenes.find((candidate) => candidate.id === sceneId) : null) ??
    scenes.find((candidate) => candidate.id === document?.currentSceneId) ??
    scenes.find((candidate) => candidate.isMain) ??
    scenes[0];
  if (!scene) {
    throw new MediaAnalysisError("The project has no scene to inspect.", "no_scene");
  }
  return scene;
}

function safeRate(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 1;
}

function integrateRetime({ clipSeconds, retime }) {
  if (!retime) return clipSeconds;
  if (typeof retime.freezeFrameAt === "number") {
    return Math.max(0, seconds(retime.freezeFrameAt));
  }
  const points = Array.isArray(retime.curve?.points)
    ? [...retime.curve.points]
        .map((point) => ({ time: seconds(point.time), rate: safeRate(point.rate) }))
        .sort((a, b) => a.time - b.time)
    : [];
  if (points.length === 0) return clipSeconds * safeRate(retime.rate);

  let sourceSeconds = 0;
  let cursor = 0;
  let currentRate = points[0]?.rate ?? safeRate(retime.rate);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (!point || clipSeconds <= cursor) break;
    const segmentEnd = Math.min(clipSeconds, point.time);
    const duration = Math.max(0, segmentEnd - cursor);
    const fullDuration = Math.max(0.001, point.time - cursor);
    const endRate =
      currentRate + (point.rate - currentRate) * (duration / fullDuration);
    sourceSeconds += duration * ((currentRate + endRate) / 2);
    cursor = segmentEnd;
    currentRate = endRate;
    if (clipSeconds <= point.time) return sourceSeconds;
    currentRate = point.rate;
    cursor = point.time;
  }
  if (clipSeconds > cursor) {
    sourceSeconds += (clipSeconds - cursor) * currentRate;
  }
  return sourceSeconds;
}

function sourceSecondsAt({ element, timelineSeconds }) {
  const clipStart = seconds(element.startTime);
  const trimStart = seconds(element.trimStart);
  const clipOffset = Math.max(0, timelineSeconds - clipStart);
  const forward = integrateRetime({ clipSeconds: clipOffset, retime: element.retime });
  if (!element.retime?.reverse) return trimStart + forward;

  const sourceSpan =
    typeof element.sourceDuration === "number"
      ? seconds(element.sourceDuration)
      : integrateRetime({
          clipSeconds: seconds(element.duration),
          retime: { ...element.retime, reverse: false },
        });
  return trimStart + Math.max(0, sourceSpan - forward);
}

function visualSegments(scene) {
  const segments = [];
  for (const track of allTracks(scene)) {
    for (const element of track.elements ?? []) {
      if (
        !element?.mediaId ||
        (element.type !== "video" && element.type !== "image") ||
        element.hidden === true ||
        track.hidden === true
      ) {
        continue;
      }
      const startSeconds = seconds(element.startTime);
      const durationSeconds = seconds(element.duration);
      if (durationSeconds <= 0) continue;
      segments.push({
        trackId: track.id,
        trackBucket: track.bucket,
        element,
        startSeconds,
        endSeconds: startSeconds + durationSeconds,
      });
    }
  }
  return segments;
}

/**
 * Build a deterministic, compact frame plan in timeline time and map every
 * selected moment back to source-media time. The default route is browser-free:
 * the MCP can turn each asset group into a contact sheet with inspectMedia.
 */
export function planTimelineRangeInspection({
  document,
  sceneId,
  startSeconds,
  endSeconds,
  maxFrames = 12,
}) {
  if (
    typeof startSeconds !== "number" ||
    !Number.isFinite(startSeconds) ||
    startSeconds < 0 ||
    typeof endSeconds !== "number" ||
    !Number.isFinite(endSeconds) ||
    endSeconds <= startSeconds
  ) {
    throw new MediaAnalysisError(
      "endSeconds must be greater than a finite, non-negative startSeconds.",
      "invalid_timeline_range",
    );
  }
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 25) {
    throw new MediaAnalysisError(
      "maxFrames must be an integer from 1 to 25.",
      "invalid_timeline_range",
    );
  }
  const scene = resolveScene(document, sceneId);
  const segments = visualSegments(scene).filter(
    (segment) =>
      segment.startSeconds < endSeconds && segment.endSeconds > startSeconds,
  );
  const samples = [];
  const sampleStep = (endSeconds - startSeconds) / maxFrames;
  for (let index = 0; index < maxFrames; index += 1) {
    const timelineSeconds = startSeconds + (index + 0.5) * sampleStep;
    const candidates = segments.filter(
      (segment) =>
        segment.startSeconds <= timelineSeconds &&
        segment.endSeconds > timelineSeconds,
    );
    const selected =
      candidates.find((candidate) => candidate.trackBucket === "main") ??
      candidates.at(-1);
    if (!selected) continue;
    samples.push({
      timelineSeconds: rounded(timelineSeconds),
      sourceSeconds: rounded(
        sourceSecondsAt({ element: selected.element, timelineSeconds }),
      ),
      assetId: selected.element.mediaId,
      trackId: selected.trackId,
      elementId: selected.element.id,
      elementName: selected.element.name ?? selected.element.id,
      mediaType: selected.element.type,
    });
  }

  const byAsset = {};
  for (const sample of samples) {
    const entry =
      byAsset[sample.assetId] ??
      (byAsset[sample.assetId] = {
        assetId: sample.assetId,
        elementIds: [],
        sourceSeconds: [],
        samples: [],
      });
    if (!entry.elementIds.includes(sample.elementId)) {
      entry.elementIds.push(sample.elementId);
    }
    if (!entry.sourceSeconds.includes(sample.sourceSeconds)) {
      entry.sourceSeconds.push(sample.sourceSeconds);
    }
    entry.samples.push({
      timelineSeconds: sample.timelineSeconds,
      sourceSeconds: sample.sourceSeconds,
      elementId: sample.elementId,
    });
  }

  return {
    schemaVersion: RANGE_SCHEMA,
    projectId: document?.metadata?.id ?? null,
    revision: typeof document?.revision === "number" ? document.revision : 0,
    sceneId: scene.id,
    range: { startSeconds, endSeconds },
    samples,
    byAsset,
  };
}

function timelineUsesFor(document, assetId) {
  const uses = [];
  for (const scene of document?.scenes ?? []) {
    for (const track of allTracks(scene)) {
      for (const element of track.elements ?? []) {
        if (element.mediaId !== assetId) continue;
        const timelineStartSeconds = seconds(element.startTime);
        const durationSeconds = seconds(element.duration);
        const sourceAtStart = sourceSecondsAt({
          element,
          timelineSeconds: timelineStartSeconds,
        });
        const sourceAtEnd = sourceSecondsAt({
          element,
          timelineSeconds: timelineStartSeconds + durationSeconds,
        });
        uses.push({
          sceneId: scene.id,
          trackId: track.id,
          elementId: element.id,
          timelineStartSeconds: rounded(timelineStartSeconds),
          timelineEndSeconds: rounded(timelineStartSeconds + durationSeconds),
          sourceStartSeconds: rounded(Math.min(sourceAtStart, sourceAtEnd)),
          sourceEndSeconds: rounded(Math.max(sourceAtStart, sourceAtEnd)),
        });
      }
    }
  }
  return uses;
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

export function buildMediaCatalog({
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
      ...(proxy ? { proxy } : {}),
      timelineUses: timelineUsesFor(document, assetId),
      analysis:
        previous?.analysis && typeof previous.analysis === "object"
          ? previous.analysis
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
  return path.join(projectsRoot(root), projectId, "agent", "media-catalog.json");
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
