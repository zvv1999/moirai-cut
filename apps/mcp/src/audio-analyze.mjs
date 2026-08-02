import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MediaImportError, mediaIndexOf } from "./media-import.mjs";

const run = promisify(execFile);

/**
 * Ears for the agent: where is there sound, and how loud is it.
 *
 * A cut decision is usually an audio decision — trim the dead air, cut on the
 * pause, duck the music under the voice — and none of that is possible when the
 * agent can only see durations. One ffmpeg pass with silencedetect+volumedetect
 * answers the questions that matter, as intervals in source-media seconds that
 * can be fed straight into trims and splits.
 *
 * Reads the media over the editor's own /api/media route rather than guessing
 * at paths: the route owns the filesystem layout, serves real byte ranges, and
 * ffmpeg's http demuxer seeks through it exactly as it would a local file.
 */

const SILENCE_START = /silence_start:\s*(-?[\d.]+)/;
const SILENCE_END = /silence_end:\s*(-?[\d.]+)/;
const MEAN_VOLUME = /mean_volume:\s*(-?[\d.]+)\s*dB/;
const MAX_VOLUME = /max_volume:\s*(-?[\d.]+)\s*dB/;

const round = (value) => Math.round(value * 1000) / 1000;

export async function analyzeAudio({
  projectId,
  assetId,
  noiseFloorDb = -35,
  minSilenceSeconds = 0.35,
  base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000",
}) {
  const index = await mediaIndexOf({ projectId, base });
  const asset = index[assetId];
  if (!asset) {
    throw new MediaImportError(
      `No asset ${assetId} in project ${projectId}. Use list_media for the ids.`,
      "unknown_asset",
    );
  }
  if (asset.hasAudio === false) {
    throw new MediaImportError(
      `${asset.name ?? assetId} has no audio stream — nothing to analyze.`,
      "no_audio_stream",
    );
  }

  const url = `${base}/api/media/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}`;
  let stderr;
  try {
    ({ stderr } = await run(
      "ffmpeg",
      [
        "-hide_banner", "-nostats",
        "-i", url,
        "-map", "a:0",
        "-af", `silencedetect=noise=${noiseFloorDb}dB:d=${minSilenceSeconds},volumedetect`,
        "-f", "null", "-",
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    ));
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error);
    if (/matches no streams/.test(detail)) {
      throw new MediaImportError(
        `${asset.name ?? assetId} has no audio stream — nothing to analyze.`,
        "no_audio_stream",
      );
    }
    throw new MediaImportError(`ffmpeg could not analyze ${assetId}: ${detail.slice(-400)}`);
  }

  const durationSeconds = typeof asset.duration === "number" ? asset.duration : null;
  const silences = [];
  let openStart = null;
  for (const line of stderr.split("\n")) {
    const start = line.match(SILENCE_START);
    if (start) openStart = Number(start[1]);
    const end = line.match(SILENCE_END);
    if (end && openStart !== null) {
      silences.push({ startSeconds: round(Math.max(0, openStart)), endSeconds: round(Number(end[1])) });
      openStart = null;
    }
  }
  // Silence still running when the file ends produces a start with no end.
  if (openStart !== null) {
    silences.push({
      startSeconds: round(Math.max(0, openStart)),
      endSeconds: durationSeconds !== null ? round(durationSeconds) : null,
    });
  }

  // The complement is what a cut actually wants: the spans worth keeping.
  const sounded = [];
  if (durationSeconds !== null) {
    let cursor = 0;
    for (const { startSeconds, endSeconds } of silences) {
      if (startSeconds - cursor > 0.05) {
        sounded.push({ startSeconds: round(cursor), endSeconds: round(startSeconds) });
      }
      cursor = Math.max(cursor, endSeconds ?? durationSeconds);
    }
    if (durationSeconds - cursor > 0.05) {
      sounded.push({ startSeconds: round(cursor), endSeconds: round(durationSeconds) });
    }
  }

  return {
    assetId,
    name: asset.name,
    durationSeconds,
    loudness: {
      meanDb: stderr.match(MEAN_VOLUME) ? Number(stderr.match(MEAN_VOLUME)[1]) : null,
      maxDb: stderr.match(MAX_VOLUME) ? Number(stderr.match(MAX_VOLUME)[1]) : null,
    },
    noiseFloorDb,
    minSilenceSeconds,
    silences,
    sounded,
  };
}
