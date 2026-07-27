import { TICKS_PER_SECOND } from "./document.mjs";

/**
 * Mechanical lint of a cut: every defect that needs neither eyes nor ears.
 *
 * During the real-footage acceptance run, review attention was spent
 * DISCOVERING mechanical problems — a gap on the main track, a four-frame
 * sliver, a clip trimmed past its footage — before any editorial judgment
 * could start. Each of those is interval arithmetic over the document. Caught
 * here in milliseconds, they stop costing a render, an export, or a
 * multimodal look.
 *
 * Advisory by design: findings never block a write. A lint-clean cut can
 * still be boring — this is the gate before review, never the judge.
 */

const S = TICKS_PER_SECOND;

const seconds = (ticks) => Math.round((ticks / S) * 1000) / 1000;

function activeScene(document) {
  const scenes = document.scenes ?? [];
  return (
    scenes.find((scene) => scene.id === document.currentSceneId) ??
    scenes.find((scene) => scene.isMain) ??
    scenes[0]
  );
}

export function lintDocument({
  document,
  mediaIndex = {},
  targetDurationSeconds,
  minClipSeconds = 0.5,
}) {
  const scene = activeScene(document);
  if (!scene) {
    return {
      findings: [{
        severity: "error",
        code: "no_scene",
        message: "The document has no scenes.",
      }],
      counts: { error: 1, warning: 0, note: 0 },
      timelineSeconds: 0,
    };
  }
  const tracks = [scene.tracks.main, ...(scene.tracks.overlay ?? []), ...(scene.tracks.audio ?? [])];
  const findings = [];
  const add = (severity, code, message, extra = {}) => findings.push({ severity, code, message, ...extra });

  // One frame at 30fps: below this, a distinct clip cannot even display.
  const EPS = S / 30;
  const minClipTicks = minClipSeconds * S;
  let timelineEnd = 0;
  const covered = [];

  for (const track of tracks) {
    const elements = [...(track.elements ?? [])].sort((a, b) => a.startTime - b.startTime);
    for (const element of elements) {
      const end = element.startTime + element.duration;
      timelineEnd = Math.max(timelineEnd, end);
      covered.push([element.startTime, end]);

      if (element.duration < minClipTicks) {
        add("warning", "sliver_clip",
          `"${element.name}" is ${seconds(element.duration)}s — below ${minClipSeconds}s it reads as a glitch, not a cut.`,
          { trackId: track.id, elementId: element.id, atSeconds: seconds(element.startTime) });
      }

      if (element.mediaId) {
        const asset = mediaIndex[element.mediaId];
        if (!asset) {
          add("error", "missing_media",
            `"${element.name}" references media ${element.mediaId} that is not in the library.`,
            { trackId: track.id, elementId: element.id, atSeconds: seconds(element.startTime) });
        } else if (typeof asset.duration === "number" && asset.duration > 0 && element.type !== "image") {
          // Source consumed = trimStart + timeline duration × retime rate.
          const rate = element.retime?.rate ?? 1;
          const consumedEnd = element.trimStart + element.duration * rate;
          if (consumedEnd > asset.duration * S + EPS) {
            add("error", "trim_past_source",
              `"${element.name}" claims footage up to ${seconds(consumedEnd)}s of a ${asset.duration}s source — the tail will freeze or go black.`,
              { trackId: track.id, elementId: element.id, atSeconds: seconds(element.startTime) });
          }
        }
      }
    }

    // Same-track overlap is a document the editor itself would never write.
    for (let i = 1; i < elements.length; i += 1) {
      const previous = elements[i - 1];
      const current = elements[i];
      const previousEnd = previous.startTime + previous.duration;
      if (current.startTime < previousEnd - EPS) {
        add("error", "overlap",
          `"${previous.name}" and "${current.name}" overlap on ${track.name} — the editor cannot represent this.`,
          { trackId: track.id, elementId: current.id, atSeconds: seconds(current.startTime) });
      }
    }

    if (track.id === scene.tracks.main.id) {
      if (elements.length > 0 && elements[0].startTime > EPS) {
        add("warning", "main_track_gap",
          `${seconds(elements[0].startTime)}s hole on the main track — black frames in the export. element.move closes it.`,
          { trackId: track.id, atSeconds: 0, endSeconds: seconds(elements[0].startTime) });
      }
      for (let i = 1; i < elements.length; i += 1) {
        const previousEnd = elements[i - 1].startTime + elements[i - 1].duration;
        const gap = elements[i].startTime - previousEnd;
        if (gap > EPS) {
          add("warning", "main_track_gap",
            `${seconds(gap)}s hole on the main track — black frames in the export. element.rippleDelete or element.move closes it.`,
            { trackId: track.id, atSeconds: seconds(previousEnd), endSeconds: seconds(elements[i].startTime) });
        }
      }
    }

    if (track.muted === true && elements.length > 0 && (track.type === "audio" || track.type === "video")) {
      add("note", "muted_with_content",
        `${track.name} is muted but carries ${elements.length} clip(s) — intended?`, { trackId: track.id });
    }
    if (track.hidden === true && elements.length > 0) {
      add("note", "hidden_with_content",
        `${track.name} is hidden but carries ${elements.length} clip(s) — intended?`, { trackId: track.id });
    }
  }

  // Moments where NOTHING exists on any track: no picture, no sound.
  covered.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [start, end] of covered) {
    if (start - cursor > EPS && cursor < timelineEnd) {
      add("warning", "dead_span",
        `Nothing at all on the timeline from ${seconds(cursor)}s to ${seconds(start)}s.`,
        { atSeconds: seconds(cursor), endSeconds: seconds(start) });
    }
    cursor = Math.max(cursor, end);
  }

  if (typeof targetDurationSeconds === "number" && targetDurationSeconds > 0) {
    const total = seconds(timelineEnd);
    const drift = Math.abs(total - targetDurationSeconds);
    if (drift > Math.max(1, targetDurationSeconds * 0.1)) {
      add("warning", "duration_off_target",
        `The cut runs ${total}s against a ${targetDurationSeconds}s brief (${total > targetDurationSeconds ? "+" : "-"}${Math.round(drift * 10) / 10}s).`);
    }
  }

  const rank = { error: 0, warning: 1, note: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return {
    findings,
    counts: {
      error: findings.filter((f) => f.severity === "error").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      note: findings.filter((f) => f.severity === "note").length,
    },
    timelineSeconds: seconds(timelineEnd),
  };
}
