import { strict as assert } from "node:assert";
import test from "node:test";
import { applyOperationToDocument, DocumentOperationError, TICKS_PER_SECOND } from "../document.mjs";

/**
 * These pin the places where the file implementation must agree with the
 * editor's own Command classes. Every one of them started as a real divergence
 * found by reading the two side by side — a file edit that looked fine and
 * produced a document the editor would never have written.
 */

const S = TICKS_PER_SECOND;

const element = (over = {}) => ({
  id: over.id ?? "e1",
  type: "video",
  name: "clip",
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
  scenes: [
    {
      id: "s1",
      name: "Main scene",
      isMain: true,
      bookmarks: [],
      tracks: {
        main: { id: "main", type: "video", name: "Main", elements: main, muted: false, hidden: false },
        overlay,
        audio,
      },
    },
  ],
  settings: { fps: { numerator: 30, denominator: 1 } },
  version: 1,
  revision: 1,
});

const apply = (document, operation) => applyOperationToDocument({ document, operation }).document;
const tracksOf = (d) => {
  const s = d.scenes[0].tracks;
  return [s.main, ...s.overlay, ...s.audio];
};
const elementsOf = (d) => tracksOf(d).flatMap((t) => t.elements);

test("moving two clips off the same track does not lose or duplicate one", () => {
  // Splicing by indices captured before any mutation is wrong the moment the
  // first splice shifts the rest: the second removes a bystander, and the moved
  // element survives twice under one id.
  const before = doc({
    main: [
      element({ id: "A", startTime: 0 }),
      element({ id: "B", startTime: 5 * S }),
      element({ id: "C", startTime: 10 * S }),
    ],
  });
  const after = apply(before, {
    type: "element.move",
    moves: [
      { trackId: "main", elementId: "A", startTimeSeconds: 20 },
      { trackId: "main", elementId: "B", startTimeSeconds: 30 },
    ],
  });
  const ids = elementsOf(after).map((e) => e.id).sort();
  assert.deepEqual(ids, ["A", "B", "C"]);
  assert.equal(new Set(ids).size, 3, "no element may appear twice");
});

test("an element cannot be moved onto an incompatible track", () => {
  const before = doc({
    main: [element({ id: "A" })],
    audio: [{ id: "aud", type: "audio", name: "A", elements: [element({ id: "z", type: "audio" })], muted: false }],
  });
  assert.throws(
    () =>
      apply(before, {
        type: "element.move",
        moves: [{ trackId: "main", elementId: "A", targetTrackId: "aud", startTimeSeconds: 0 }],
      }),
    DocumentOperationError,
  );
});

test("the main track pins its earliest clip to zero", () => {
  // enforceMainTrackStart, applied by the editor on both insert and trim. Without
  // it the clip sits where the editor would never have allowed, and the next
  // in-editor touch silently moves it.
  const inserted = apply(doc(), {
    type: "element.insert",
    element: { type: "video", name: "v", startTimeSeconds: 5, mediaId: "m1" },
  });
  assert.equal(inserted.scenes[0].tracks.main.elements[0].startTime, 0);

  const trimmed = apply(doc({ main: [element({ id: "A", startTime: 0 })] }), {
    type: "element.trim",
    elements: [{ trackId: "main", elementId: "A", startTimeSeconds: 30 }],
  });
  assert.equal(trimmed.scenes[0].tracks.main.elements[0].startTime, 0);
});

test("a new overlay track goes on top, not at the bottom", () => {
  // scene-builder draws [...overlay, main] reversed, so overlay[0] is the
  // TOPMOST layer. Appending would put new text underneath existing video.
  const before = doc({
    overlay: [{ id: "ovV", type: "video", name: "V", elements: [element({ id: "x" })], muted: false, hidden: false }],
  });
  const after = apply(before, {
    type: "element.insert",
    element: { type: "text", name: "t", startTimeSeconds: 0, params: { content: "hi" } },
  });
  assert.equal(after.scenes[0].tracks.overlay[0].type, "text");
});

test("auto placement prefers an overlay track over main", () => {
  const before = doc({
    main: [element({ id: "m", startTime: 0, duration: 2 * S })],
    overlay: [{ id: "ovV", type: "video", name: "V", elements: [element({ id: "x", duration: 2 * S })], muted: false, hidden: false }],
  });
  const after = apply(before, {
    type: "element.insert",
    element: { type: "video", name: "v2", startTimeSeconds: 10, mediaId: "m1" },
  });
  assert.equal(after.scenes[0].tracks.main.elements.length, 1, "main must be left alone");
  assert.equal(after.scenes[0].tracks.overlay[0].elements.length, 2);
});

test("duplicate always creates a new track rather than reusing one with room", () => {
  const before = doc({ main: [element({ id: "A", startTime: 0, duration: 2 * S })] });
  const after = apply(before, {
    type: "element.duplicate",
    elements: [{ trackId: "main", elementId: "A" }],
  });
  assert.equal(after.scenes[0].tracks.overlay.length, 1);
  assert.equal(after.scenes[0].tracks.main.elements.length, 1);
});

test("track flags are not written onto tracks that cannot carry them", () => {
  const before = doc({
    overlay: [{ id: "txt", type: "text", name: "T", elements: [element({ id: "t1", type: "text" })], hidden: false }],
  });
  const muted = applyOperationToDocument({
    document: before,
    operation: { type: "track.toggleMute", trackId: "txt" },
  });
  // A text track has no `muted`; writing one persists a flag nothing honours.
  assert.equal(muted.document.scenes[0].tracks.overlay[0].muted, undefined);
  assert.equal(muted.changed, false);
});

test("split accounts for retime when computing trims", () => {
  // Trims are source time. A 2x clip consumes two seconds of footage per
  // timeline second, so a cut one second in has eaten two seconds of source.
  const before = doc({
    main: [element({ id: "A", startTime: 0, duration: 4 * S, trimStart: S, trimEnd: S, retime: { rate: 2 } })],
  });
  const after = apply(before, {
    type: "element.split",
    elements: [{ trackId: "main", elementId: "A" }],
    splitTimeSeconds: 1,
  });
  const [left, right] = after.scenes[0].tracks.main.elements;
  assert.equal(left.trimEnd, S + 6 * S);
  assert.equal(right.trimStart, S + 2 * S);
});

test("a split that misses a clip skips it instead of failing the batch", () => {
  const before = doc({ main: [element({ id: "A", startTime: 0, duration: 2 * S })] });
  const result = applyOperationToDocument({
    document: before,
    operation: {
      type: "element.split",
      elements: [{ trackId: "main", elementId: "A" }],
      splitTimeSeconds: 60,
    },
  });
  assert.equal(result.changed, false);
  assert.equal(result.document.scenes[0].tracks.main.elements.length, 1);
});

test("splitting an animated element is refused rather than approximated", () => {
  // Splitting keyframes needs the editor's interpolation and bezier
  // subdivision; an approximation puts both halves on the wrong curve and looks
  // fine in the timeline.
  const animated = doc({
    main: [element({ id: "A", animations: { opacity: { keys: [{ id: "k1", time: 0, value: 1 }] } } })],
  });
  assert.throws(
    () =>
      apply(animated, {
        type: "element.split",
        elements: [{ trackId: "main", elementId: "A" }],
        splitTimeSeconds: 1,
      }),
    DocumentOperationError,
  );
});

test("duplicating an animated element mints fresh keyframe ids", async () => {
  // Sharing keyframe ids between the copy and the original makes id-keyed
  // keyframe selection edit both at once.
  const animated = doc({
    main: [
      element({
        id: "A",
        animations: {
          opacity: { keys: [{ id: "k1", time: 0, value: 1 }, { id: "k2", time: 100, value: 0 }] },
          // A composite path: every component shares the primary channel's map.
          color: {
            r: { keys: [{ id: "k1", time: 0, value: 1 }] },
            g: { keys: [{ id: "k1", time: 0, value: 0 }] },
          },
          // Legacy keys are dropped by the editor's own clone.
          bindings: { keys: [{ id: "old", time: 0, value: 0 }] },
        },
      }),
    ],
  });
  const after = apply(animated, {
    type: "element.duplicate",
    elements: [{ trackId: "main", elementId: "A" }],
  });
  const original = after.scenes[0].tracks.main.elements[0];
  const copy = after.scenes[0].tracks.overlay[0].elements[0];

  const originalIds = original.animations.opacity.keys.map((k) => k.id);
  const copyIds = copy.animations.opacity.keys.map((k) => k.id);
  assert.deepEqual(originalIds, ["k1", "k2"], "the original is untouched");
  assert.equal(copyIds.length, 2);
  assert.ok(copyIds.every((id) => !originalIds.includes(id)), "the copy has fresh ids");
  // Composite components share one map per path, so r and g stay in step.
  assert.equal(copy.animations.color.r.keys[0].id, copy.animations.color.g.keys[0].id);
  assert.equal(copy.animations.bindings, undefined, "legacy keys are dropped");
});

test("unknown graphic definitions and effect elements are refused", () => {
  assert.throws(
    () =>
      apply(doc(), {
        type: "element.insert",
        element: { type: "graphic", name: "g", startTimeSeconds: 0, definitionId: "nope" },
      }),
    DocumentOperationError,
  );
  assert.throws(
    () =>
      apply(doc(), {
        type: "element.insert",
        element: { type: "effect", name: "fx", startTimeSeconds: 0 },
      }),
    DocumentOperationError,
  );
});

test("a time beyond the editor's tick range is refused", () => {
  assert.throws(
    () =>
      apply(doc(), {
        type: "element.insert",
        element: { type: "text", name: "t", startTimeSeconds: 1e15, params: { content: "x" } },
      }),
    DocumentOperationError,
  );
});

test("the active scene falls back to the main scene, not merely the first", () => {
  const document = doc();
  document.currentSceneId = "";
  document.scenes = [
    { id: "other", name: "Other", isMain: false, bookmarks: [], tracks: { main: { id: "m2", type: "video", name: "M", elements: [] }, overlay: [], audio: [] } },
    document.scenes[0],
  ];
  const after = apply(document, { type: "scene.rename", sceneId: "s1", newName: "renamed" });
  // The rename targets s1 explicitly; what matters is that resolving the active
  // scene did not pick "other" and edit the wrong tracks.
  assert.equal(after.scenes.find((s) => s.id === "s1").name, "renamed");
});

test("derived metadata matches what the editor recomputes on save", async () => {
  const { refreshDerivedMetadata } = await import("../document.mjs");
  // getProjectDurationFromScenes measures the MAIN scene only. Summing across
  // every scene would overstate the project the moment a second one exists.
  const document = doc({ main: [element({ id: "A", startTime: 0, duration: 3 * S })] });
  document.scenes.push({
    id: "s2",
    name: "Other",
    isMain: false,
    bookmarks: [],
    tracks: {
      main: { id: "m2", type: "video", name: "M", elements: [element({ id: "B", startTime: 0, duration: 99 * S })] },
      overlay: [],
      audio: [],
    },
  });

  const refreshed = refreshDerivedMetadata({ document, now: "2026-01-01T00:00:00.000Z" });
  assert.equal(refreshed.metadata.duration, 3 * S, "the 99s clip is in a non-main scene");
  assert.equal(refreshed.metadata.updatedAt, "2026-01-01T00:00:00.000Z");
});

test("the first visual clip adopts the footage's resolution and frame rate", async () => {
  // InsertElementCommand does this in the editor. Without it a file-built project
  // exports at the default 1080p/30 whatever the source was — the timeline looks
  // right and the output is wrong.
  const mediaIndex = {
    m1: { id: "m1", type: "video", width: 3840, height: 2160, fps: 23.976 },
  };
  const result = applyOperationToDocument({
    document: doc(),
    operation: {
      type: "element.insert",
      element: { type: "video", name: "v", startTimeSeconds: 0, mediaId: "m1" },
    },
    mediaIndex,
  });
  assert.deepEqual(result.document.settings.canvasSize, { width: 3840, height: 2160 });
  assert.deepEqual(result.document.settings.originalCanvasSize, { width: 3840, height: 2160 });
  // 23.976 is exactly 24000/1001, not a rounded decimal.
  assert.deepEqual(result.document.settings.fps, { numerator: 24000, denominator: 1001 });
});

test("a second clip does not re-adopt settings", async () => {
  const mediaIndex = { m1: { id: "m1", type: "video", width: 640, height: 360, fps: 60 } };
  const before = doc({ main: [element({ id: "A" })] });
  const result = applyOperationToDocument({
    document: before,
    operation: {
      type: "element.insert",
      element: { type: "video", name: "v2", startTimeSeconds: 10, mediaId: "m1" },
    },
    mediaIndex,
  });
  assert.deepEqual(result.document.settings.fps, { numerator: 30, denominator: 1 });
  assert.equal(result.document.settings.canvasSize, undefined);
});

test("effects attach only to visual elements, and their params are validated", () => {
  const withClip = doc({ main: [element({ id: "A" })] });
  const ref = { trackId: "main", elementId: "A" };

  const added = apply(withClip, { type: "element.addEffect", ...ref, effectType: "blur" });
  const [effect] = added.scenes[0].tracks.main.elements[0].effects;
  // buildDefaultEffectInstance shape: id, type, params from the definition, enabled.
  assert.equal(effect.type, "blur");
  assert.equal(effect.enabled, true);
  assert.deepEqual(effect.params, { intensity: 15 });

  // An unknown effect, and an unknown parameter, must both be refused rather
  // than written into the document where nothing will honour them.
  assert.throws(
    () => apply(withClip, { type: "element.addEffect", ...ref, effectType: "nope" }),
    DocumentOperationError,
  );
  assert.throws(
    () =>
      apply(added, { type: "element.setEffectParams", ...ref, effectId: effect.id, params: { nope: 1 } }),
    DocumentOperationError,
  );

  const tuned = apply(added, {
    type: "element.setEffectParams",
    ...ref,
    effectId: effect.id,
    params: { intensity: 60 },
  });
  assert.deepEqual(tuned.scenes[0].tracks.main.elements[0].effects[0].params, { intensity: 60 });

  const toggled = apply(tuned, { type: "element.toggleEffect", ...ref, effectId: effect.id });
  assert.equal(toggled.scenes[0].tracks.main.elements[0].effects[0].enabled, false);

  const removed = apply(toggled, { type: "element.removeEffect", ...ref, effectId: effect.id });
  assert.equal(removed.scenes[0].tracks.main.elements[0].effects.length, 0);
});

test("effects cannot be attached to audio", () => {
  const withAudio = doc({
    audio: [{ id: "aud", type: "audio", name: "A", muted: false, elements: [element({ id: "z", type: "audio" })] }],
  });
  assert.throws(
    () => apply(withAudio, { type: "element.addEffect", trackId: "aud", elementId: "z", effectType: "blur" }),
    DocumentOperationError,
  );
});

test("the keyframable param table matches the editor's registry", async () => {
  // A second copy of the registry is exactly the kind of thing that rots
  // silently — a changed min/max would clamp an agent's value differently from
  // the editor's, and nothing would report it.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(
    fileURLToPath(new URL("../../../web/src/params/registry.ts", import.meta.url)),
    "utf8",
  );
  const constants = { MIN_TRANSFORM_SCALE: 0.01, VOLUME_DB_MIN: -60, VOLUME_DB_MAX: 20, CORNER_RADIUS_MIN: 0, CORNER_RADIUS_MAX: 100 };
  const num = (raw) =>
    raw === undefined ? null : raw in constants ? constants[raw] : Number(raw.replace(/_/g, ""));

  const blocks = [...source.matchAll(/\{\s*key:\s*"([^"]+)",([\s\S]*?)\n\t*\}/g)];
  const registry = new Map();
  for (const [, key, body] of blocks) {
    if (registry.has(key)) continue;
    if (!/type:\s*"number"/.test(body)) continue;
    if (/keyframable:\s*false/.test(body)) continue;
    registry.set(key, {
      min: num(/min:\s*([-\w.]+)/.exec(body)?.[1]),
      max: num(/max:\s*([-\w.]+)/.exec(body)?.[1]),
      step: num(/step:\s*([-\w.]+)/.exec(body)?.[1]),
    });
  }
  assert.ok(registry.size > 10, `parsed only ${registry.size} params — the parser is broken, not the code`);

  const { KEYFRAMABLE_PARAMS_FOR_TEST } = await import("../document.mjs");
  assert.deepEqual(
    Object.keys(KEYFRAMABLE_PARAMS_FOR_TEST).sort(),
    [...registry.keys()].sort(),
    "the set of keyframable number params drifted",
  );
  for (const [key, expected] of registry) {
    assert.deepEqual(KEYFRAMABLE_PARAMS_FOR_TEST[key], expected, `${key} bounds drifted`);
  }
});

test("scenes and bookmarks are addressable and guarded", () => {
  const before = doc();
  // The main scene is the project's spine — canDeleteScene refuses it.
  assert.throws(
    () => apply(before, { type: "scene.delete", sceneId: "s1" }),
    DocumentOperationError,
  );

  const withScene = apply(before, { type: "scene.create", name: "Second" });
  assert.equal(withScene.scenes.length, 2);
  assert.equal(withScene.scenes[1].isMain, false, "a second main scene would make getMainScene ambiguous");

  // Deleting the ACTIVE scene must leave currentSceneId pointing somewhere real.
  const active = { ...withScene, currentSceneId: withScene.scenes[1].id };
  const deleted = apply(active, { type: "scene.delete", sceneId: withScene.scenes[1].id });
  assert.equal(deleted.currentSceneId, "s1");

  // Bookmarks are keyed by time, and toggle is add-or-remove.
  const marked = apply(before, { type: "bookmark.toggle", timeSeconds: 1.5 });
  assert.equal(marked.scenes[0].bookmarks.length, 1);
  assert.equal(marked.scenes[0].bookmarks[0].time, 1.5 * S);
  const unmarked = apply(marked, { type: "bookmark.toggle", timeSeconds: 1.5 });
  assert.equal(unmarked.scenes[0].bookmarks.length, 0);

  const moved = apply(marked, { type: "bookmark.move", fromSeconds: 1.5, toSeconds: 4 });
  assert.equal(moved.scenes[0].bookmarks[0].time, 4 * S);
  const noted = apply(marked, { type: "bookmark.update", timeSeconds: 1.5, note: "cut here" });
  assert.equal(noted.scenes[0].bookmarks[0].note, "cut here");
  assert.throws(
    () => apply(marked, { type: "bookmark.update", timeSeconds: 99 }),
    DocumentOperationError,
  );
});

test("project settings change only what is named, and mark a custom canvas", () => {
  const after = apply(doc(), {
    type: "project.updateSettings",
    canvasSize: { width: 1080, height: 1920 },
  });
  assert.deepEqual(after.settings.canvasSize, { width: 1080, height: 1920 });
  // An explicit size is custom; leaving the mode at "preset" would make the UI
  // show a preset that no longer matches the canvas.
  assert.equal(after.settings.canvasSizeMode, "custom");
  assert.deepEqual(after.settings.lastCustomCanvasSize, { width: 1080, height: 1920 });
  assert.deepEqual(after.settings.fps, { numerator: 30, denominator: 1 }, "fps untouched");
  assert.throws(() => apply(doc(), { type: "project.updateSettings" }), DocumentOperationError);
});
