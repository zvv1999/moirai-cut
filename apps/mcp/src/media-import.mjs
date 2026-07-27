import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

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
export async function importMedia({ projectId, filePath, name, base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000" }) {
  const bytes = await readFile(filePath).catch((error) => {
    throw new MediaImportError(`Cannot read ${filePath}: ${error.message}`, "file_unreadable");
  });
  const probed = await probeMedia({ filePath });

  const assetId = randomUUID();
  const fileName = name ?? basename(filePath);
  const ext = (extname(fileName).slice(1) || "bin").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  const bytesResponse = await fetch(
    `${base}/api/media/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}?ext=${encodeURIComponent(ext)}`,
    { method: "PUT", headers: { "content-type": mimeType }, body: bytes },
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
  const index = indexResponse.ok ? ((await indexResponse.json()).assets ?? {}) : {};
  index[assetId] = {
    ...(index[assetId] ?? {}),
    id: assetId,
    name: fileName,
    type: probed.type,
    size: bytes.length,
    lastModified: Date.now(),
    ext,
    mimeType,
    ...(probed.width ? { width: probed.width } : {}),
    ...(probed.height ? { height: probed.height } : {}),
    ...(probed.durationSeconds !== undefined ? { duration: probed.durationSeconds } : {}),
    // MediaAssetData.fps is a NUMBER — the editor calls floatToFrameRate(asset.fps).
    // Storing the rational here would make that call receive an object and the
    // project would silently keep its default frame rate.
    ...(probed.fps ? { fps: probed.fps.numerator / probed.fps.denominator } : {}),
    hasAudio: probed.hasAudio,
  };
  const writeResponse = await fetch(`${base}/api/media/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(index),
  });
  if (!writeResponse.ok) {
    throw new MediaImportError(`Writing the media index failed: ${writeResponse.statusText}`);
  }

  return { assetId, ...probed, name: fileName, sizeBytes: bytes.length, mimeType };
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
