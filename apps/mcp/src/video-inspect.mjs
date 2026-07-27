import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaImportError, mediaIndexOf } from "./media-import.mjs";

const run = promisify(execFile);

/**
 * A contact sheet for the agent's eyes.
 *
 * The driving agent is multimodal — its own vision is the best CV available
 * here — but looking was expensive: one frame per round-trip, at full
 * resolution. This tool samples N moments of a SOURCE asset, burns the source
 * timecode into each cell, and returns one modest JPEG. Sixteen moments of a
 * clip for the cost of one image; three calls to survey a rushes folder.
 *
 * Frames are extracted with per-time input seeks rather than one fps-filtered
 * pass: seeks land on exact, caller-known timestamps (the burned label and
 * the returned map are then trustworthy), and keyframe seeking skips decoding
 * everything in between.
 */

const FONT = "/System/Library/Fonts/Helvetica.ttc";
const MAX_CELLS = 25;

/**
 * Decide which source-media seconds to inspect before paying for ffmpeg.
 *
 * Explicit times are deliberately rejected at the source end instead of being
 * silently clamped: the returned cell→seconds map is an editing decision aid,
 * so claiming a different timestamp than the frame actually depicts is worse
 * than a clear input error.
 */
export function planInspectionTimes({
  type,
  durationSeconds,
  count = 16,
  atSeconds,
}) {
  if (type === "image") return [0];

  if (Array.isArray(atSeconds) && atSeconds.length > 0) {
    if (atSeconds.length > MAX_CELLS) {
      throw new MediaImportError(
        `inspect_media accepts at most ${MAX_CELLS} explicit times; got ${atSeconds.length}.`,
        "invalid_inspection_request",
      );
    }
    for (const time of atSeconds) {
      if (typeof time !== "number" || !Number.isFinite(time) || time < 0) {
        throw new MediaImportError(
          `Inspection times must be finite, non-negative source seconds; got ${JSON.stringify(time)}.`,
          "invalid_inspection_request",
        );
      }
      if (
        typeof durationSeconds === "number" &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0 &&
        time >= durationSeconds
      ) {
        throw new MediaImportError(
          `Inspection times must be before the ${durationSeconds}s source end; got ${time}s.`,
          "inspection_time_out_of_range",
        );
      }
    }
    return [...atSeconds];
  }

  if (!Number.isInteger(count) || count < 1 || count > MAX_CELLS) {
    throw new MediaImportError(
      `Inspection count must be an integer from 1 to ${MAX_CELLS}; got ${JSON.stringify(count)}.`,
      "invalid_inspection_request",
    );
  }
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return [0];
  }

  // Midpoints, not endpoints: frame 0 is often black on phone footage and the
  // exact end may not decode.
  return Array.from(
    { length: count },
    (_, index) => ((index + 0.5) * durationSeconds) / count,
  );
}

export async function inspectMedia({
  projectId,
  assetId,
  count = 16,
  atSeconds,
  cellWidth = 320,
  base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000",
}, {
  loadMediaIndex = mediaIndexOf,
  runCommand = run,
} = {}) {
  const index = await loadMediaIndex({ projectId, base });
  const asset = index[assetId];
  if (!asset) {
    throw new MediaImportError(`No asset ${assetId} in project ${projectId}. Use list_media for the ids.`, "unknown_asset");
  }
  if (asset.type === "audio") {
    throw new MediaImportError(`${asset.name ?? assetId} is audio — nothing to look at. Use analyze_audio.`, "no_video_stream");
  }
  if (!Number.isInteger(cellWidth) || cellWidth < 160 || cellWidth > 640) {
    throw new MediaImportError(
      `Cell width must be an integer from 160 to 640; got ${JSON.stringify(cellWidth)}.`,
      "invalid_inspection_request",
    );
  }

  const url = `${base.replace(/\/+$/, "")}/api/media/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}`;
  const duration = typeof asset.duration === "number" && asset.duration > 0 ? asset.duration : null;
  const times = planInspectionTimes({
    type: asset.type,
    durationSeconds: duration,
    count,
    atSeconds,
  });

  const dir = await mkdtemp(join(tmpdir(), "oc-sheet-"));
  try {
    // Extract each cell; a failed drawtext (missing font) degrades to an
    // unlabeled cell rather than a failed look — the text map still has times.
    let labeled = true;
    for (const [i, t] of times.entries()) {
      const out = join(dir, `cell-${String(i).padStart(3, "0")}.jpg`);
      const label = `${Math.round(t * 100) / 100}s`;
      const drawtext = `drawtext=fontfile=${FONT}:text='${label}':x=6:y=h-th-6:fontsize=${Math.max(14, Math.round(cellWidth / 16))}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4`;
      const seek = asset.type === "image" ? [] : ["-ss", String(t)];
      const attempt = (vf) =>
        runCommand("ffmpeg", ["-y", "-v", "error", ...seek, "-i", url, "-frames:v", "1", "-vf", vf, "-q:v", "4", out], {
          maxBuffer: 4 * 1024 * 1024,
        });
      try {
        await attempt(`scale=${cellWidth}:-2,${drawtext}`);
      } catch {
        labeled = false;
        await attempt(`scale=${cellWidth}:-2`).catch((error) => {
          throw new MediaImportError(
            `ffmpeg could not extract a frame at ${label} from ${asset.name ?? assetId}: ${String(error?.stderr ?? error?.message ?? "").slice(-300)}`,
          );
        });
      }
    }

    const columns = Math.ceil(Math.sqrt(times.length));
    const rows = Math.ceil(times.length / columns);
    // The tile filter wants a full grid; duplicate the last cell into the
    // remainder so the layout is deterministic instead of decoder-dependent.
    for (let i = times.length; i < columns * rows; i += 1) {
      await copyFile(
        join(dir, `cell-${String(times.length - 1).padStart(3, "0")}.jpg`),
        join(dir, `cell-${String(i).padStart(3, "0")}.jpg`),
      );
    }

    const sheet = join(dir, "sheet.jpg");
    await runCommand("ffmpeg", [
      "-y", "-v", "error",
      "-framerate", "1", "-i", join(dir, "cell-%03d.jpg"),
      "-vf", `tile=${columns}x${rows}:padding=2`,
      "-frames:v", "1", "-q:v", "4", sheet,
    ]);
    const jpegBase64 = (await readFile(sheet)).toString("base64");

    return {
      jpegBase64,
      labeled,
      grid: { columns, rows, cellWidth },
      cells: times.map((t, i) => ({
        cell: `r${Math.floor(i / columns) + 1}c${(i % columns) + 1}`,
        sourceSeconds: Math.round(t * 1000) / 1000,
      })),
      asset: { id: assetId, name: asset.name, durationSeconds: duration, width: asset.width, height: asset.height },
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
