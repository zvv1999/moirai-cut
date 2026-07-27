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

test("source audio separation builds a matching audio clip, and re-attaching only flips the flag", () => {
  const withVideo = doc({
    main: [element({ id: "V", startTime: S, duration: 3 * S, trimStart: S, params: { volume: -6 } })],
  });
  const ref = { trackId: "main", elementId: "V" };

  const separated = apply(withVideo, { type: "element.toggleSourceAudio", ...ref });
  const audio = separated.scenes[0].tracks.audio[0].elements[0];
  // The extracted clip must line up with its source exactly, or it drifts.
  assert.equal(audio.type, "audio");
  assert.equal(audio.sourceType, "upload");
  assert.equal(audio.mediaId, "m1");
  assert.equal(audio.startTime, S);
  assert.equal(audio.duration, 3 * S);
  assert.equal(audio.trimStart, S);
  assert.equal(audio.params.volume, -6, "volume carries over in dB");
  assert.equal(separated.scenes[0].tracks.main.elements[0].isSourceAudioEnabled, false);

  // Re-attaching flips the flag and deliberately leaves the audio clip alone —
  // the human may have edited it by then.
  const reattached = apply(separated, { type: "element.toggleSourceAudio", ...ref });
  assert.equal(reattached.scenes[0].tracks.main.elements[0].isSourceAudioEnabled, true);
  assert.equal(reattached.scenes[0].tracks.audio.length, 1, "the extracted clip is kept");
});

test("masks are addressable and freeform-only where that matters", () => {
  const withMask = doc({
    main: [
      element({
        id: "A",
        masks: [
          { id: "m1", type: "rectangle", params: { inverted: false } },
          { id: "m2", type: "freeform", params: { points: [{ id: "p1" }, { id: "p2" }] } },
        ],
      }),
    ],
  });
  const ref = { trackId: "main", elementId: "A" };

  const flipped = apply(withMask, { type: "element.toggleMaskInverted", ...ref, maskId: "m1" });
  assert.equal(flipped.scenes[0].tracks.main.elements[0].masks[0].params.inverted, true);

  // Point editing is meaningless on a shape mask.
  assert.throws(
    () => apply(withMask, { type: "element.deleteMaskPoints", ...ref, maskId: "m1", pointIds: ["p1"] }),
    DocumentOperationError,
  );
  const trimmed = apply(withMask, {
    type: "element.deleteMaskPoints", ...ref, maskId: "m2", pointIds: ["p1"],
  });
  assert.deepEqual(
    trimmed.scenes[0].tracks.main.elements[0].masks[1].params.points.map((p) => p.id),
    ["p2"],
  );

  const removed = apply(withMask, { type: "element.removeMask", ...ref, maskId: "m1" });
  assert.equal(removed.scenes[0].tracks.main.elements[0].masks.length, 1);
  assert.throws(
    () => apply(withMask, { type: "element.removeMask", ...ref, maskId: "nope" }),
    DocumentOperationError,
  );
});

test("a mask can be created without any layout information", () => {
  // Mask geometry is normalised — centerX/width are fractions of the element's
  // bounds, not pixels — so a mask is fully specifiable from the file alone.
  // An earlier version of this layer refused to create masks on the mistaken
  // belief that it needed the element's rendered size.
  const before = doc({ main: [element({ id: "A" })] });
  const ref = { trackId: "main", elementId: "A" };

  const added = apply(before, { type: "element.addMask", ...ref, maskType: "ellipse" });
  const [mask] = added.scenes[0].tracks.main.elements[0].masks;
  assert.equal(mask.type, "ellipse");
  // 0.6 is DEFAULT_SHAPE_MASK_SHORT_SIDE_RATIO, the same value the editor falls
  // back to when it has no element size either.
  assert.equal(mask.params.width, 0.6);
  assert.equal(mask.params.centerX, 0);
  assert.equal(mask.params.inverted, false);

  // Explicit geometry overrides the defaults.
  const custom = apply(before, {
    type: "element.addMask", ...ref, maskType: "rectangle",
    params: { width: 0.25, height: 0.5, centerX: -0.2, feather: 8 },
  });
  assert.deepEqual(
    { w: custom.scenes[0].tracks.main.elements[0].masks[0].params.width,
      f: custom.scenes[0].tracks.main.elements[0].masks[0].params.feather },
    { w: 0.25, f: 8 },
  );

  // Unknown parameters and unknown types are refused rather than written.
  assert.throws(
    () => apply(before, { type: "element.addMask", ...ref, maskType: "rectangle", params: { nope: 1 } }),
    DocumentOperationError,
  );
  assert.throws(
    () => apply(before, { type: "element.addMask", ...ref, maskType: "octagon" }),
    DocumentOperationError,
  );
  // A text mask has no content to show without one.
  assert.throws(
    () => apply(before, { type: "element.addMask", ...ref, maskType: "text" }),
    DocumentOperationError,
  );

  const tuned = apply(added, {
    type: "element.setMaskParams", ...ref, maskId: mask.id, params: { feather: 12, inverted: true },
  });
  const after = tuned.scenes[0].tracks.main.elements[0].masks[0].params;
  assert.equal(after.feather, 12);
  assert.equal(after.inverted, true);
  assert.equal(after.width, 0.6, "unnamed params are left alone");
});

test("masks do not attach to audio", () => {
  const withAudio = doc({
    audio: [{ id: "aud", type: "audio", name: "A", muted: false, elements: [element({ id: "z", type: "audio" })] }],
  });
  assert.throws(
    () => apply(withAudio, { type: "element.addMask", trackId: "aud", elementId: "z", maskType: "rectangle" }),
    DocumentOperationError,
  );
});

test("mask parameters can be keyframed", () => {
  // This needed an engine change: resolveAnimationTarget could not address a
  // mask, and the compositor read the authored params rather than the resolved
  // ones, so an animated mask never moved.
  const withMask = doc({
    main: [element({ id: "A", masks: [{ id: "m1", type: "ellipse", params: { centerX: 0, feather: 0 } }] })],
  });
  const ref = { trackId: "main", elementId: "A" };

  const animated = apply(withMask, {
    type: "element.upsertMaskKeyframe", ...ref, maskId: "m1",
    paramKey: "centerX", timeSeconds: 0, value: -0.35,
  });
  const path = "masks.m1.params.centerX";
  assert.equal(animated.scenes[0].tracks.main.elements[0].animations[path].keys[0].value, -0.35);

  // A parameter the mask type does not declare must be refused, not written.
  assert.throws(
    () => apply(withMask, {
      type: "element.upsertMaskKeyframe", ...ref, maskId: "m1",
      paramKey: "nonsense", timeSeconds: 0, value: 1,
    }),
    DocumentOperationError,
  );
  assert.throws(
    () => apply(withMask, {
      type: "element.upsertMaskKeyframe", ...ref, maskId: "nope",
      paramKey: "centerX", timeSeconds: 0, value: 1,
    }),
    DocumentOperationError,
  );
});

test("ripple delete closes gaps on the deleted clip's own track only", () => {
  const before = doc({
    main: [
      element({ id: "A", startTime: 0 }),
      element({ id: "B", startTime: 2 * S }),
      element({ id: "C", startTime: 4 * S }),
    ],
    audio: [
      {
        id: "a1",
        type: "audio",
        name: "Audio",
        muted: false,
        elements: [{ ...element({ id: "M", startTime: 4 * S }), type: "audio", mediaId: "m2" }],
      },
    ],
  });
  const after = apply(before, {
    type: "element.rippleDelete",
    elements: [{ trackId: "main", elementId: "B" }],
  });
  const byId = Object.fromEntries(elementsOf(after).map((e) => [e.id, e]));
  assert.equal(byId.B, undefined);
  assert.equal(byId.A.startTime, 0, "clips before the cut do not move");
  assert.equal(byId.C.startTime, 2 * S, "clips after the cut slide left by the deleted duration");
  assert.equal(byId.M.startTime, 4 * S, "other tracks are untouched — this is not a global ripple");
});

test("ripple delete of several clips shifts by the sum of spans strictly before each survivor", () => {
  const before = doc({
    main: [
      element({ id: "A", startTime: 0 }),
      element({ id: "B", startTime: 2 * S }),
      element({ id: "C", startTime: 4 * S }),
      element({ id: "D", startTime: 6 * S }),
    ],
  });
  const after = apply(before, {
    type: "element.rippleDelete",
    elements: [
      { trackId: "main", elementId: "A" },
      { trackId: "main", elementId: "C" },
    ],
  });
  const byId = Object.fromEntries(elementsOf(after).map((e) => [e.id, e]));
  assert.equal(byId.B.startTime, 0, "one deleted span (A) precedes B");
  assert.equal(byId.D.startTime, 2 * S, "two deleted spans (A and C) precede D");
});

test("append lands at the end of the timeline, or of the named track", () => {
  const before = doc({
    main: [element({ id: "A", startTime: 0 })],
    audio: [
      {
        id: "a1",
        type: "audio",
        name: "Audio",
        muted: false,
        elements: [
          { ...element({ id: "M", startTime: 0, duration: 7 * S }), type: "audio", mediaId: "m2" },
        ],
      },
    ],
  });
  const everywhere = apply(before, {
    type: "element.append",
    element: { type: "video", name: "tail", mediaId: "m1", durationSeconds: 1, sourceDurationSeconds: 10 },
  });
  const appended = elementsOf(everywhere).find((e) => e.name === "tail");
  assert.equal(appended.startTime, 7 * S, "global end is the audio track's end, not main's");

  const scoped = apply(before, {
    type: "element.append",
    element: { type: "video", name: "tail", mediaId: "m1", durationSeconds: 1, sourceDurationSeconds: 10 },
    trackId: "main",
  });
  const scopedTail = elementsOf(scoped).find((e) => e.name === "tail");
  assert.equal(scopedTail.startTime, 2 * S, "scoped to main, the end is main's end");

  assert.throws(
    () => apply(before, {
      type: "element.append",
      element: { type: "video", name: "tail", mediaId: "m1", durationSeconds: 1 },
      trackId: "nope",
    }),
    /No track/,
  );
});

test("crossfade slides the incoming clip onto an overlay lane and fades it in", () => {
  const before = doc({
    main: [
      element({ id: "OUT", startTime: 0 }),
      element({ id: "IN", startTime: 2 * S, duration: 3 * S }),
    ],
  });
  const after = apply(before, {
    type: "element.crossfade",
    fromTrackId: "main",
    fromElementId: "OUT",
    toTrackId: "main",
    toElementId: "IN",
    durationSeconds: 1,
  });
  const scene = after.scenes[0];
  assert.equal(scene.tracks.main.elements.length, 1, "the incoming clip left the main track");
  assert.equal(scene.tracks.overlay.length, 1, "a new overlay lane was created for it");
  const moved = scene.tracks.overlay[0].elements.find((e) => e.id === "IN");
  assert.equal(moved.startTime, 1 * S, "slid back by the overlap");
  const keys = moved.animations.opacity.keys;
  assert.deepEqual(
    keys.map((k) => [k.time, k.value]),
    [[0, 0], [1 * S, 1]],
    "fade-in spans exactly the overlap, in element-local time",
  );
  // The outgoing clip is untouched.
  assert.equal(scene.tracks.main.elements[0].id, "OUT");
  assert.equal(scene.tracks.main.elements[0].startTime, 0);
});

test("crossfade upserts over existing opacity keys instead of dropping them", () => {
  const before = doc({
    main: [
      element({ id: "OUT", startTime: 0 }),
      element({
        id: "IN",
        startTime: 2 * S,
        duration: 3 * S,
        animations: {
          opacity: {
            keys: [
              { id: "k0", time: 0, value: 0.5, segmentToNext: "linear", tangentMode: "flat" },
              { id: "kLate", time: 2 * S, value: 0.2, segmentToNext: "linear", tangentMode: "flat" },
            ],
          },
        },
      }),
    ],
  });
  const after = apply(before, {
    type: "element.crossfade",
    fromTrackId: "main",
    fromElementId: "OUT",
    toTrackId: "main",
    toElementId: "IN",
    durationSeconds: 1,
  });
  const moved = tracksOf(after).flatMap((t) => t.elements).find((e) => e.id === "IN");
  const keys = moved.animations.opacity.keys;
  assert.deepEqual(
    keys.map((k) => [k.time, k.value]),
    [[0, 0], [1 * S, 1], [2 * S, 0.2]],
    "the key at 0 is replaced, the later key survives",
  );
});

test("crossfade refuses non-adjacent, oversized, and non-visual arrangements", () => {
  const gap = doc({
    main: [element({ id: "OUT", startTime: 0 }), element({ id: "IN", startTime: 3 * S })],
  });
  assert.throws(
    () => apply(gap, {
      type: "element.crossfade",
      fromTrackId: "main", fromElementId: "OUT",
      toTrackId: "main", toElementId: "IN",
      durationSeconds: 1,
    }),
    /adjacent/,
  );

  const tight = doc({
    main: [
      element({ id: "OUT", startTime: 0 }),
      element({ id: "IN", startTime: 2 * S, duration: 1 * S }),
    ],
  });
  assert.throws(
    () => apply(tight, {
      type: "element.crossfade",
      fromTrackId: "main", fromElementId: "OUT",
      toTrackId: "main", toElementId: "IN",
      durationSeconds: 1.5,
    }),
    /longer than the incoming/,
  );

  const audio = doc({
    audio: [
      {
        id: "a1",
        type: "audio",
        name: "Audio",
        muted: false,
        elements: [
          { ...element({ id: "OUT", startTime: 0 }), type: "audio", mediaId: "m2" },
          { ...element({ id: "IN", startTime: 2 * S }), type: "audio", mediaId: "m2" },
        ],
      },
    ],
  });
  assert.throws(
    () => apply(audio, {
      type: "element.crossfade",
      fromTrackId: "a1",
      fromElementId: "OUT",
      toTrackId: "a1",
      toElementId: "IN",
      durationSeconds: 1,
    }),
    /must be visual/,
  );
});

test("summary detail keeps the addressing surface and drops the per-clip payload", async () => {
  const { describeDocument } = await import("../document.mjs");
  const before = doc({
    main: [
      element({ id: "A", startTime: 0 }),
      {
        ...element({ id: "B", startTime: 2 * S, duration: 3 * S }),
        masks: [{ id: "m1", type: "rectangle", params: {} }],
        effects: [{ id: "fx1", type: "blur", params: {} }],
        animations: { opacity: { keys: [
          { id: "k1", time: 0, value: 0 },
          { id: "k2", time: S, value: 1 },
        ] } },
      },
    ],
  });
  const summary = describeDocument({ document: before, detail: "summary" });
  const main = summary.tracks.find((t) => t.id === "main");
  assert.equal(main.elements, undefined, "no per-clip payload in a summary");
  assert.equal(main.elementCount, 2);
  assert.equal(main.spanSeconds, 5, "span is the furthest clip end");
  assert.deepEqual(main.elementTypes, { video: 2 });
  assert.equal(main.keyframeCount, 2);
  assert.equal(main.maskCount, 1);
  assert.equal(main.effectCount, 1);

  const full = describeDocument({ document: before });
  assert.ok(Array.isArray(full.tracks[0].elements), "default stays full");
});

test("summary never invents timing for corrupt elements", async () => {
  const { describeDocument } = await import("../document.mjs");
  const before = doc({
    main: [
      { ...element({ id: "OK", startTime: 0, duration: 2 * S }) },
      { ...element({ id: "BAD" }), startTime: null, duration: 240000 },
    ],
  });
  const summary = describeDocument({ document: before, detail: "summary" });
  const main = summary.tracks.find((t) => t.id === "main");
  assert.equal(main.spanSeconds, 2, "the corrupt element is excluded, not coerced to zero");

  const allBad = describeDocument({
    document: doc({ main: [{ ...element({ id: "B" }), startTime: null, duration: null }] }),
    detail: "summary",
  });
  assert.equal(allBad.tracks.find((t) => t.id === "main").spanSeconds, null);
});
