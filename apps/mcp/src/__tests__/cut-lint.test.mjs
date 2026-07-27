import { strict as assert } from "node:assert";
import test from "node:test";
import { lintDocument } from "../cut-lint.mjs";
import { TICKS_PER_SECOND } from "../document.mjs";

const S = TICKS_PER_SECOND;

const element = (over = {}) => ({
  id: over.id ?? "e1",
  type: "video",
  name: over.id ?? "clip",
  startTime: 0,
  duration: 2 * S,
  trimStart: 0,
  trimEnd: 0,
  params: {},
  mediaId: "m1",
  ...over,
});

const doc = ({ main = [], overlay = [], audio = [] } = {}) => ({
  metadata: { id: "p1", name: "P", duration: 0, updatedAt: "1970-01-01T00:00:00.000Z" },
  currentSceneId: "s1",
  scenes: [{
    id: "s1", name: "Main", isMain: true, bookmarks: [],
    tracks: {
      main: { id: "main", type: "video", name: "Main", elements: main, muted: false, hidden: false },
      overlay, audio,
    },
  }],
  settings: { fps: { numerator: 30, denominator: 1 } },
  version: 1, revision: 1,
});

const MEDIA = { m1: { id: "m1", duration: 5, type: "video" } };
const codes = (result) => result.findings.map((f) => f.code);

test("a clean cut lints clean", () => {
  const result = lintDocument({
    document: doc({ main: [element({ id: "A" }), element({ id: "B", startTime: 2 * S })] }),
    mediaIndex: MEDIA,
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.timelineSeconds, 4);
});

test("main-track gaps are found; overlay gaps are not gaps", () => {
  const gapped = lintDocument({
    document: doc({
      main: [element({ id: "A" }), element({ id: "B", startTime: 3 * S })],
      overlay: [{
        id: "ov", type: "video", name: "V", muted: false, hidden: false,
        elements: [element({ id: "C", startTime: 0 }), element({ id: "D", startTime: 3 * S })],
      }],
    }),
    mediaIndex: MEDIA,
  });
  const gaps = gapped.findings.filter((f) => f.code === "main_track_gap");
  assert.equal(gaps.length, 1, "only the MAIN track's hole is a gap");
  assert.equal(gaps[0].atSeconds, 2);
  assert.equal(gaps[0].endSeconds, 3);
});

test("a leading main-track gap is reported from timeline zero", () => {
  const result = lintDocument({
    document: doc({ main: [element({ id: "LATE", startTime: 2 * S })] }),
    mediaIndex: MEDIA,
  });
  const gap = result.findings.find((f) => f.code === "main_track_gap");
  assert.ok(gap);
  assert.equal(gap.atSeconds, 0);
  assert.equal(gap.endSeconds, 2);
});

test("sliver clips, missing media, and trims past the source are flagged", () => {
  const result = lintDocument({
    document: doc({
      main: [
        element({ id: "SLIVER", duration: Math.round(0.2 * S) }),
        element({ id: "GHOST", startTime: 2 * S, mediaId: "nope" }),
        // 2s at rate 2 consumes 4s starting at trim 2 → needs 6s of a 5s source.
        element({ id: "OVERRUN", startTime: 4 * S, trimStart: 2 * S, retime: { rate: 2 } }),
      ],
    }),
    mediaIndex: MEDIA,
  });
  assert.ok(codes(result).includes("sliver_clip"));
  assert.ok(codes(result).includes("missing_media"));
  assert.ok(codes(result).includes("trim_past_source"));
  // Errors sort before warnings so the worst news reads first.
  assert.equal(result.findings[0].severity, "error");
});

test("retime rate 1 within the source is not an overrun", () => {
  const result = lintDocument({
    document: doc({ main: [element({ id: "A", duration: 5 * S })] }),
    mediaIndex: MEDIA,
  });
  assert.ok(!codes(result).includes("trim_past_source"));
});

test("images are never trim-checked — a still has no extent to overrun", () => {
  const result = lintDocument({
    document: doc({ main: [element({ id: "PIC", type: "image", duration: 60 * S })] }),
    mediaIndex: { m1: { id: "m1", duration: 0.04, type: "image" } },
  });
  assert.ok(!codes(result).includes("trim_past_source"));
});

test("dead spans and duration drift are reported against the brief", () => {
  const result = lintDocument({
    document: doc({
      main: [element({ id: "A" })],
      audio: [{
        id: "au", type: "audio", name: "A", muted: false,
        elements: [{ ...element({ id: "M", startTime: 5 * S }), type: "audio" }],
      }],
    }),
    mediaIndex: MEDIA,
    targetDurationSeconds: 30,
  });
  const dead = result.findings.find((f) => f.code === "dead_span");
  assert.ok(dead, "the 2s..5s hole exists on no track at all");
  assert.equal(dead.atSeconds, 2);
  assert.equal(dead.endSeconds, 5);
  assert.ok(codes(result).includes("duration_off_target"));
});

test("muted and hidden tracks that still carry clips get a note", () => {
  const result = lintDocument({
    document: doc({
      overlay: [{
        id: "ov", type: "video", name: "V", muted: true, hidden: true,
        elements: [element({ id: "C" })],
      }],
    }),
    mediaIndex: MEDIA,
  });
  assert.ok(codes(result).includes("muted_with_content"));
  assert.ok(codes(result).includes("hidden_with_content"));
});

test("a document with no scene returns the same stable result shape", () => {
  const result = lintDocument({
    document: { currentSceneId: null, scenes: [] },
    mediaIndex: {},
  });
  assert.deepEqual(result, {
    findings: [{
      severity: "error",
      code: "no_scene",
      message: "The document has no scenes.",
    }],
    counts: { error: 1, warning: 0, note: 0 },
    timelineSeconds: 0,
  });
});
