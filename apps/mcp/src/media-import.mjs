import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { omitArchivedOriginalStub } from "./media-index.mjs";

/**
 * Import a media file into a project, from Node.
 *
 * The editor's own import path needs a `File` from a picker, which is why media
 * used to be the one thing an agent could not do. With the bytes on disk it is
 * just a copy plus an index entry — and the metadata the editor derives in the
 * browser (dimensions, duration, frame rate) can be probed here instead.
 */

const run = promisify(execFile);

const MIME_BY_EXT = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export class MediaImportError extends Error {
  constructor(message, code = "media_import_failed") {
    super(message);
    this.name = "MediaImportError";
    this.code = code;
  }
}

/** Parse ffprobe's rational frame rate ("30000/1001") into a usable pair. */
function parseFrameRate(value) {
  if (typeof value !== "string" || !value.includes("/")) return null;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !denominator) return null;
  if (numerator === 0) return null;
  return { numerator, denominator };
}

/**
 * Probe with ffprobe rather than trusting the extension.
 *
 * The editor derives these in the browser via mediabunny; deriving them from the
 * filename instead would put the wrong duration on the clip and the wrong canvas
 * size on the project.
 */
export async function probeMedia({ filePath }) {
  let stdout;
  try {
    ({ stdout } = await run("ffprobe", [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]));
  } catch (error) {
    throw new MediaImportError(
      `ffprobe could not read ${filePath}: ${error?.stderr ?? error?.message ?? error}`,
      "probe_failed",
    );
  }

  const probed = JSON.parse(stdout);
  const streams = probed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const duration = Number(probed.format?.duration);

  // Rotation. Phone footage carries a displaymatrix (stream side_data) and
  // EXIF photos carry it at FRAME level — in both cases the stored pixels are
  // sideways and every consumer displays them rotated. Reporting the unrotated
  // dimensions here made a 1080x1920 portrait phone clip look like landscape,
  // which flipped the project's adopted canvas the wrong way round.
  let rotation = 0;
  const streamRotation = (video?.side_data_list ?? []).find(
    (entry) => typeof entry.rotation === "number",
  );
  if (streamRotation) {
    rotation = streamRotation.rotation;
  } else if (video) {
    try {
      const { stdout: frameOut } = await run("ffprobe", [
        "-v", "error",
        "-select_streams", "v:0",
        "-read_intervals", "%+#1",
        "-show_entries", "frame_side_data_list",
        "-of", "json",
        filePath,
      ]);
      const frame = JSON.parse(frameOut).frames?.[0];
      const frameRotation = (frame?.side_data_list ?? []).find(
        (entry) => typeof entry.rotation === "number",
      );
      if (frameRotation) rotation = frameRotation.rotation;
    } catch {
      /* no frame side data — keep 0 */
    }
  }
  const isSideways = Math.abs(rotation) % 180 === 90;

  // A still image also reports a video stream. Three tells, because none alone
  // is reliable: an image codec; a single frame; or a sub-half-second "duration"
  // (ffprobe reports one frame at 25fps as 0.04s for plain JPEGs, which slipped
  // past a duration===0 check and classified photos as video).
  const IMAGE_CODECS = new Set(["mjpeg", "png", "webp", "bmp", "tiff", "gif"]);
  const isStill =
    Boolean(video) &&
    (IMAGE_CODECS.has(video.codec_name) ||
      video.nb_frames === "1" ||
      !Number.isFinite(duration) ||
      duration < 0.5);
  const type = isStill ? "image" : video ? "video" : audio ? "audio" : null;
  if (!type) {
    throw new MediaImportError(`${filePath} has no video or audio stream`, "unsupported_media");
  }

  return {
    type,
    // DISPLAY dimensions, not stored ones: a -90 rotation swaps them.
    width: video ? Number(isSideways ? video.height : video.width) : undefined,
    height: video ? Number(isSideways ? video.width : video.height) : undefined,
    // Seconds, matching MediaAsset.duration — NOT ticks. Absent for stills.
    durationSeconds: type === "image" || !Number.isFinite(duration) ? undefined : duration,
    // Stills get a synthetic frame rate from ffprobe (often 25/1). Reporting it
    // would let a still image drive the project's frame rate on first import.
    fps: video && type !== "image" ? parseFrameRate(video.r_frame_rate) : null,
    hasAudio: Boolean(audio),
  };
}

/**
 * Copy a local file into the project's media folder and register it.
 *
 * Returns the asset id, which is what `element.insert` needs as `mediaId`.
 */
/** Same fit algorithm as the editor's thumbnailSize: contain in 1280x720. */
function thumbnailDimensions({ width, height }) {
  const MAX_W = 1280, MAX_H = 720;
  const aspect = width / height;
  let w = width, h = height;
  if (w > MAX_W) { w = MAX_W; h = Math.round(w / aspect); }
  if (h > MAX_H) { h = MAX_H; w = Math.round(h * aspect); }
  // ffmpeg requires even dimensions for yuvj-encoded jpegs on some builds.
  return { width: Math.max(2, w - (w % 2)), height: Math.max(2, h - (h % 2)) };
}

/**
 * A JPEG data URL for the asset, like the browser import path produces.
 *
 * Both the assets panel and the timeline read `thumbnailUrl` — the timeline
 * shows video clips with NO strip at all without one (photos fall back to the
 * raw url, video deliberately does not). Node imports skipped this, which is
 * why file-imported videos showed as grey placeholders.
 */
export async function makeThumbnailDataUrl({ filePath, type, width, height, durationSeconds }) {
  if (!width || !height || type === "audio") return undefined;
  const target = thumbnailDimensions({ width, height });
  const temp = join(tmpdir(), `oc-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  const args = ["-y", "-v", "error"];
  if (type === "video") {
    // A hair in, not frame zero: phone clips often start on a black frame.
    const seek = Math.min(0.5, (durationSeconds ?? 1) * 0.1);
    args.push("-ss", String(seek));
  }
  args.push("-i", filePath, "-frames:v", "1", "-vf", `scale=${target.width}:${target.height}`, "-q:v", "5", temp);
  try {
    await run("ffmpeg", args);
    const bytes = await readFile(temp);
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    // A missing thumbnail degrades to a placeholder; failing the import would not.
    return undefined;
  } finally {
    await unlink(temp).catch(() => {});
  }
}

/**
 * Cameras hand over 8K stills; the editor decodes the served asset on every
 * preview frame. Above this long edge a still gets a downsampled proxy as the
 * SERVED asset, and the untouched original is archived beside it.
 */
const PROXY_LONG_EDGE = 3840;

async function makeStillProxy({ filePath, ext }) {
  // PNG keeps alpha; everything else re-encodes to a high-quality JPEG (which
  // also covers formats ffmpeg can decode but not encode, like HEIC).
  const png = ext === "png";
  const outExt = png ? "png" : "jpg";
  const temp = join(tmpdir(), `oc-proxy-${Date.now()}-${Math.random().toString(36).slice(2)}.${outExt}`);
  const args = [
    "-y", "-v", "error", "-i", filePath, "-frames:v", "1",
    "-vf", `scale=w=${PROXY_LONG_EDGE}:h=${PROXY_LONG_EDGE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    ...(png ? [] : ["-q:v", "2"]),
    temp,
  ];
  try {
    await run("ffmpeg", args);
    const bytes = await readFile(temp);
    // Reprobe rather than compute: EXIF orientation and rounding both change
    // the answer, and the index dims MUST match the served pixels or every
    // transform and mask in the editor lands off-target.
    const reprobed = await probeMedia({ filePath: temp });
    return {
      bytes,
      ext: outExt,
      mimeType: png ? "image/png" : "image/jpeg",
      width: reprobed.width,
      height: reprobed.height,
    };
  } catch {
    // No proxy is a slow preview, not a failed import.
    return null;
  } finally {
    await unlink(temp).catch(() => {});
  }
}

export async function importMedia({ projectId, filePath, name, base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000" }) {
  const bytes = await readFile(filePath).catch((error) => {
    throw new MediaImportError(`Cannot read ${filePath}: ${error.message}`, "file_unreadable");
  });
  const probed = await probeMedia({ filePath });

  const assetId = randomUUID();
  const fileName = name ?? basename(filePath);
  const ext = (extname(fileName).slice(1) || "bin").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  let served = { bytes, ext, mimeType, width: probed.width, height: probed.height };
  let original = null;
  if (
    probed.type === "image" &&
    probed.width && probed.height &&
    Math.max(probed.width, probed.height) > PROXY_LONG_EDGE
  ) {
    const proxy = await makeStillProxy({ filePath, ext });
    if (proxy) {
      // Original first, under "<assetId>-original": archived bytes, findable on
      // disk, deliberately NOT in the index — the editor and every consumer see
      // only the proxy, whose dims the index reports.
      const originalResponse = await fetch(
        `${base}/api/media/${encodeURIComponent(projectId)}/${encodeURIComponent(`${assetId}-original`)}?ext=${encodeURIComponent(ext)}`,
        { method: "PUT", headers: { "content-type": mimeType }, body: bytes },
      );
      if (originalResponse.ok) {
        original = { ext, width: probed.width, height: probed.height, sizeBytes: bytes.length };
        served = proxy;
      }
      // If archiving failed, serve the original rather than orphaning it.
    }
  }

  const bytesResponse = await fetch(
    `${base}/api/media/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}?ext=${encodeURIComponent(served.ext)}`,
    { method: "PUT", headers: { "content-type": served.mimeType }, body: served.bytes },
  );
  if (!bytesResponse.ok) {
    throw new MediaImportError(
      `Writing media bytes failed: ${bytesResponse.status} ${bytesResponse.statusText}`,
    );
  }

  // Metadata second, exactly like the editor's own saveMediaAsset: the index is
  // what enumerates assets, so writing it last means an interrupted import
  // leaves an unreferenced file rather than an entry pointing at nothing.
  const indexResponse = await fetch(`${base}/api/media/${encodeURIComponent(projectId)}`);
  const fetchedIndex = indexResponse.ok ? ((await indexResponse.json()).assets ?? {}) : {};
  const index = original
    ? omitArchivedOriginalStub({ index: fetchedIndex, assetId })
    : fetchedIndex;
  index[assetId] = {
    ...(index[assetId] ?? {}),
    id: assetId,
    name: fileName,
    type: probed.type,
    size: served.bytes.length,
    lastModified: Date.now(),
    // Served asset's ext/mime/dims, which for a proxied still differ from the
    // original's: the index must describe the pixels the editor will decode.
    ext: served.ext,
    mimeType: served.mimeType,
    ...(served.width ? { width: served.width } : {}),
    ...(served.height ? { height: served.height } : {}),
    ...(probed.durationSeconds !== undefined ? { duration: probed.durationSeconds } : {}),
    // MediaAssetData.fps is a NUMBER — the editor calls floatToFrameRate(asset.fps).
    // Storing the rational here would make that call receive an object and the
    // project would silently keep its default frame rate.
    ...(probed.fps ? { fps: probed.fps.numerator / probed.fps.denominator } : {}),
    hasAudio: probed.hasAudio,
    ...(original ? { original } : {}),
  };
  const thumbnailUrl = await makeThumbnailDataUrl({
    filePath,
    type: probed.type,
    width: probed.width,
    height: probed.height,
    durationSeconds: probed.durationSeconds,
  });
  if (thumbnailUrl) index[assetId].thumbnailUrl = thumbnailUrl;
  const writeResponse = await fetch(`${base}/api/media/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(index),
  });
  if (!writeResponse.ok) {
    throw new MediaImportError(`Writing the media index failed: ${writeResponse.statusText}`);
  }

  // Report the SERVED asset — its dims are what timeline math sees. The
  // original's facts ride along under `original` when a proxy was made.
  return {
    assetId,
    ...probed,
    ...(served.width ? { width: served.width, height: served.height } : {}),
    name: fileName,
    sizeBytes: served.bytes.length,
    mimeType: served.mimeType,
    ...(original ? { proxied: true, original } : {}),
  };
}

/** 29.97 is 30000/1001, not 29.97 — report both so a caller can be exact. */
function describeRate(fps) {
  const standards = [
    { value: 24000 / 1001, numerator: 24000, denominator: 1001 },
    { value: 30000 / 1001, numerator: 30000, denominator: 1001 },
    { value: 60000 / 1001, numerator: 60000, denominator: 1001 },
  ];
  const match = standards.find((s) => Math.abs(fps - s.value) < 0.01);
  if (match) return { numerator: match.numerator, denominator: match.denominator };
  return Number.isInteger(fps) ? { numerator: fps, denominator: 1 } : null;
}

/** Raw assetId -> metadata map, for callers that need width/height/fps. */
export async function mediaIndexOf({ projectId, base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000" }) {
  const response = await fetch(`${base}/api/media/${encodeURIComponent(projectId)}`);
  if (!response.ok) return {};
  return (await response.json()).assets ?? {};
}

export async function listMedia({ projectId, base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000" }) {
  const response = await fetch(`${base}/api/media/${encodeURIComponent(projectId)}`);
  if (!response.ok) return [];
  const { assets } = await response.json();
  return Object.values(assets ?? {}).map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    durationSeconds: asset.duration ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    fps: asset.fps ?? null,
    fpsExact: asset.fps ? describeRate(asset.fps) : null,
    hasAudio: asset.hasAudio ?? null,
    sizeBytes: asset.size ?? null,
  }));
}
