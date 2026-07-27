import { randomUUID } from "node:crypto";

/**
 * The edit vocabulary, applied directly to a serialized project document.
 *
 * This is what makes the editor's atomic capabilities callable without a
 * browser. The in-page registry (apps/web/src/agent/operations.ts) drives the
 * editor's own Command classes; this drives the file. Same operation names, same
 * arguments, same seconds-on-the-wire contract — `__tests__/drift.test.mjs`
 * fails if the two vocabularies diverge.
 *
 * Every function here is pure: it takes a document and returns a new one. No
 * I/O, no clock, no randomness except the ids it must mint, so the same
 * operation on the same document always produces the same result.
 */

export const TICKS_PER_SECOND = 120_000;

export class DocumentOperationError extends Error {
  constructor(message, code = "invalid_operation") {
    super(message);
    this.name = "DocumentOperationError";
    this.code = code;
  }
}

const MAX_SECONDS = Number.MAX_SAFE_INTEGER / TICKS_PER_SECOND;

const toTicks = (field, seconds) => {
  if (
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > MAX_SECONDS
  ) {
    throw new DocumentOperationError(
      `${field} must be a finite, non-negative number of seconds; got ${JSON.stringify(seconds)}`,
    );
  }
  return Math.round(seconds * TICKS_PER_SECOND);
};

const toSeconds = (ticks) =>
  typeof ticks === "number" && Number.isFinite(ticks) ? ticks / TICKS_PER_SECOND : null;

/** Which track kind an element may live on. Mirrors ELEMENT_TRACK_MAP in the app. */
const TRACK_FOR_ELEMENT = {
  video: "video",
  image: "video",
  text: "text",
  audio: "audio",
  sticker: "graphic",
  graphic: "graphic",
  effect: "effect",
};

const REQUIRED_SOURCE = {
  video: "mediaId",
  image: "mediaId",
  audio: "mediaId",
  sticker: "stickerId",
  graphic: "definitionId",
};

const DEFAULT_DURATION_TICKS = 5 * TICKS_PER_SECOND;

/**
 * Mirrors the effect registry (effects/definitions/index.ts). Only `blur` is
 * registered today; its defaults come from buildDefaultParamValues over the
 * definition's params, so they must match blur.ts exactly.
 */
const EFFECT_DEFINITIONS = {
  blur: { intensity: 15 },
};

/** Effects attach to visual elements only — VISUAL_ELEMENT_TYPES. */
const VISUAL_ELEMENT_TYPES = new Set(["video", "image", "text", "sticker", "graphic"]);

/**
 * The keyframable built-in element params, mirrored from params/registry.ts.
 *
 * Values are snapped to `step` and clamped into [min, max] exactly as
 * coerceParamValue does — reading back something different from what you wrote
 * is otherwise the first surprise an agent hits. `max: null` means unbounded,
 * which is genuinely the case for position and scale.
 *
 * `__tests__/document.test.mjs` re-parses registry.ts and fails if this drifts.
 * Colour params are keyframable in the editor but NOT here: they decompose
 * through culori into four linearised channels, and approximating that would
 * write wrong colours into the file.
 */
const KEYFRAMABLE_PARAMS = {
  "transform.positionX": { min: -100000, max: null, step: 1 },
  "transform.positionY": { min: -100000, max: null, step: 1 },
  "transform.scaleX": { min: 0.01, max: null, step: 0.01 },
  "transform.scaleY": { min: 0.01, max: null, step: 0.01 },
  "transform.rotate": { min: -360, max: 360, step: 1 },
  opacity: { min: 0, max: 1, step: 0.01 },
  // Decibels, NOT a gain multiplier: 0 is unity, and writing 0.5 means +0.5 dB.
  volume: { min: -60, max: 20, step: 0.01 },
  fontSize: { min: 1, max: null, step: 1 },
  letterSpacing: { min: -100, max: null, step: 0.1 },
  lineHeight: { min: 0.1, max: null, step: 0.1 },
  "background.cornerRadius": { min: 0, max: 100, step: 1 },
  "background.paddingX": { min: 0, max: null, step: 1 },
  "background.paddingY": { min: 0, max: null, step: 1 },
  "background.offsetX": { min: -100000, max: null, step: 1 },
  "background.offsetY": { min: -100000, max: null, step: 1 },
};

/** Exported for the drift test that re-parses the editor's registry. */
export const KEYFRAMABLE_PARAMS_FOR_TEST = KEYFRAMABLE_PARAMS;

/** Keyframable in the editor, but needing culori to decompose — refused here. */
const COLOUR_PARAMS = new Set(["color", "background.color"]);

const INTERPOLATIONS = new Set(["linear", "hold", "bezier"]);

/** Port of coerceParamValue for numbers: snap to step, then clamp. */
function coerceParamNumber(path, value, definition) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DocumentOperationError(`${path} takes a finite number; got ${JSON.stringify(value)}`);
  }
  const snapped = definition.step ? Math.round(value / definition.step) * definition.step : value;
  const clamped = Math.min(
    definition.max ?? Number.POSITIVE_INFINITY,
    Math.max(definition.min ?? Number.NEGATIVE_INFINITY, snapped),
  );
  // Snapping to a fractional step reintroduces float noise (0.1*3 = 0.30000000000000004),
  // so round to the step's own precision.
  const decimals = definition.step && definition.step < 1 ? String(definition.step).split(".")[1].length : 0;
  return Number(clamped.toFixed(decimals));
}

/** registerDefaultGraphics() registers exactly these. */
const BUILT_IN_GRAPHICS = new Set(["rectangle", "ellipse", "polygon", "star"]);

const clone = (value) => JSON.parse(JSON.stringify(value));

const canTrackHaveAudio = (track) => track.type === "audio" || track.type === "video";
const canTrackBeHidden = (track) => track.type !== "audio";

/**
 * Port of cloneAnimations({ shouldRegenerateKeyframeIds: true }).
 *
 * Copying an animated clip must mint fresh keyframe ids, or the copy and the
 * original share them and id-keyed keyframe selection edits both at once.
 *
 * Two upstream behaviours are reproduced deliberately rather than "improved":
 * the id map is built from the FIRST channel of each path only, with a
 * `?? k.id` fallback (so an id unique to a secondary component keeps its old
 * value), and legacy `bindings`/`channels` keys are dropped. Diverging here
 * would make a file-duplicated clip differ from an editor-duplicated one.
 */
const LEGACY_ANIMATION_KEYS = new Set(["bindings", "channels"]);
const isLeafChannel = (data) => Boolean(data) && typeof data === "object" && Array.isArray(data.keys);
const isCompositeChannel = (data) =>
  Boolean(data) && typeof data === "object" && !Array.isArray(data.keys);

function channelsOf(data) {
  if (isLeafChannel(data)) return [data];
  if (isCompositeChannel(data)) return Object.values(data).filter(isLeafChannel);
  return [];
}

/** Drop paths with no keyframes at all, and return undefined for an empty result. */
function toAnimation(object) {
  const kept = Object.entries(object).filter(
    ([key, value]) =>
      !LEGACY_ANIMATION_KEYS.has(key) && channelsOf(value).some((channel) => channel.keys.length > 0),
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

export function cloneAnimations({ animations, shouldRegenerateKeyframeIds = false }) {
  if (!animations) return undefined;
  const next = { ...animations };
  for (const [path, data] of Object.entries(animations)) {
    if (LEGACY_ANIMATION_KEYS.has(path)) continue;
    const channels = channelsOf(data);
    const primary = channels[0];
    const keyIds = new Map();
    if (primary) {
      for (const key of primary.keys) {
        keyIds.set(key.id, shouldRegenerateKeyframeIds ? randomUUID() : key.id);
      }
    }
    const cloneChannel = (channel) => ({
      ...channel,
      // Sorted by time, matching normalizeChannel. Array#sort is stable, which
      // matters when two keyframes share a time.
      keys: channel.keys
        .map((key) => ({ ...key, id: keyIds.get(key.id) ?? key.id }))
        .sort((a, b) => a.time - b.time),
    });

    if (isLeafChannel(data)) {
      next[path] = cloneChannel(data);
    } else if (isCompositeChannel(data)) {
      next[path] = Object.fromEntries(
        Object.entries(data).map(([componentKey, channel]) => [
          componentKey,
          channel ? cloneChannel(channel) : undefined,
        ]),
      );
    }
  }
  return toAnimation(next);
}

/**
 * Refuse to touch elements carrying keyframe animations.
 *
 * Splitting one means dividing its keyframes at the cut, and copying one means
 * minting fresh keyframe ids — the editor does both (splitAnimationsAtTime,
 * cloneAnimations with shouldRegenerateKeyframeIds). Deep-cloning instead would
 * leave both halves holding the full original keyframe set under identical ids,
 * which silently breaks id-keyed keyframe selection. Failing loudly is better
 * than writing a document that looks fine and is not.
 */
function refuseAnimated(element, what) {
  if (element.animations && Object.keys(element.animations).length > 0) {
    throw new DocumentOperationError(
      `${what} an animated element (${element.name}) is not supported from the file API. Splitting keyframes requires the editor's interpolation and bezier subdivision, and an approximation would silently put both halves on the wrong curve. Use apply_operation against the open tab for this clip.`,
      "unsupported_for_file_edit",
    );
  }
}

/** Every track in a scene, in the order the editor reports them. */
function allTracks(tracks) {
  return [tracks.main, ...(tracks.overlay ?? []), ...(tracks.audio ?? [])].filter(Boolean);
}

function activeScene(document) {
  const scenes = document.scenes ?? [];
  // Same fallback order as the app: current, then the MAIN scene, then the first.
  // `currentSceneId` can legitimately be "" after a load, and scenes[0] is not
  // necessarily the main one.
  const scene =
    scenes.find((s) => s.id === document.currentSceneId) ??
    scenes.find((s) => s.isMain) ??
    scenes[0] ??
    null;
  if (!scene) throw new DocumentOperationError("The document has no scene", "no_scene");
  return scene;
}

/**
 * The editor deletes overlay/audio tracks that hold no elements, on a reactor
 * that runs after every command. Mirrored here so a file edit and an in-editor
 * edit converge on the same document rather than the file accumulating empty
 * tracks the editor would have swept away.
 */
function prune(scene) {
  scene.tracks.overlay = (scene.tracks.overlay ?? []).filter(
    (track) => (track.elements ?? []).length > 0,
  );
  scene.tracks.audio = (scene.tracks.audio ?? []).filter(
    (track) => (track.elements ?? []).length > 0,
  );
  return scene;
}

function findElement(scene, { trackId, elementId }) {
  for (const track of allTracks(scene.tracks)) {
    const index = (track.elements ?? []).findIndex((element) => element.id === elementId);
    if (index === -1) continue;
    if (track.id !== trackId) {
      throw new DocumentOperationError(
        `Element ${elementId} is on track ${track.id}, not ${trackId}.`,
        "unresolved_reference",
      );
    }
    return { track, index, element: track.elements[index] };
  }
  throw new DocumentOperationError(
    `No element ${elementId} in the active scene. Re-read the project — ids change when a clip is split or replaced.`,
    "unresolved_reference",
  );
}

function requireRefs(elements) {
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new DocumentOperationError("this operation needs at least one {trackId, elementId}");
  }
  const seen = new Set();
  for (const ref of elements) {
    if (typeof ref?.trackId !== "string" || !ref.trackId)
      throw new DocumentOperationError("trackId must be a non-empty string");
    if (typeof ref?.elementId !== "string" || !ref.elementId)
      throw new DocumentOperationError("elementId must be a non-empty string");
    if (seen.has(ref.elementId))
      throw new DocumentOperationError(`element ${ref.elementId} is named more than once`);
    seen.add(ref.elementId);
  }
  return elements;
}

/**
 * The main track pins its earliest clip to zero — port of enforceMainTrackStart.
 *
 * Two separate places in the app apply this (placement resolution on insert, and
 * the update pipeline on trim), so a file edit that skips it puts the clip at a
 * time the editor would never have allowed, and the next in-editor touch moves it.
 */
function enforceMainTrackStart({ tracks, targetTrackId, requestedStartTime, excludeElementId }) {
  if (tracks.main?.id !== targetTrackId) return requestedStartTime;
  const earliest = (tracks.main.elements ?? [])
    .filter((element) => element.id !== excludeElementId)
    .reduce((best, element) => (best === null || element.startTime < best.startTime ? element : best), null);
  if (!earliest) return 0;
  return requestedStartTime <= earliest.startTime ? 0 : requestedStartTime;
}

const overlaps = (a, b) =>
  a.startTime < b.startTime + b.duration && a.startTime + a.duration > b.startTime;

function trackHasRoom(track, span) {
  return !(track.elements ?? []).some((element) => overlaps(span, element));
}

/** Mirrors DEFAULT_TRACK_NAMES so file-created tracks are labelled like the editor's. */
const TRACK_NAMES = {
  video: "Video track",
  text: "Text track",
  audio: "Audio track",
  graphic: "Graphic track",
  effect: "Effect track",
};

function newTrack(type) {
  return {
    id: randomUUID(),
    name: TRACK_NAMES[type] ?? `${type} track`,
    type,
    elements: [],
    ...(type === "audio" ? { muted: false } : { hidden: false }),
    ...(type === "video" ? { muted: false } : {}),
  };
}

function buildElement(draft) {
  const type = draft?.type;
  if (!TRACK_FOR_ELEMENT[type]) {
    throw new DocumentOperationError(`Unsupported element type: ${JSON.stringify(type)}`);
  }
  const required = REQUIRED_SOURCE[type];
  if (required && !draft[required]) {
    throw new DocumentOperationError(`element.insert of type "${type}" requires ${required}`);
  }
  if (type === "graphic" && !BUILT_IN_GRAPHICS.has(draft.definitionId)) {
    // The editor resolves this against its graphics registry; an unknown id
    // writes an element the renderer cannot draw.
    throw new DocumentOperationError(
      `Unknown graphic definitionId ${JSON.stringify(draft.definitionId)}. Known: ${[...BUILT_IN_GRAPHICS].join(", ")}`,
    );
  }
  if (type === "effect" && !EFFECT_DEFINITIONS[draft.effectType]) {
    throw new DocumentOperationError(
      `element.insert of type "effect" requires a known effectType. Known: ${Object.keys(EFFECT_DEFINITIONS).join(", ")}`,
    );
  }
  if (type === "text" && typeof draft.params?.content !== "string") {
    throw new DocumentOperationError(`element.insert of type "text" requires params.content`);
  }
  if (typeof draft.name !== "string" || !draft.name) {
    throw new DocumentOperationError("element.insert requires a name");
  }
  if (draft.durationSeconds !== undefined && !(draft.durationSeconds > 0)) {
    // A zero-length clip makes the overlap test (start < end) report every track
    // free, so it stacks silently on top of whatever is already there.
    throw new DocumentOperationError(
      `durationSeconds must be greater than 0; got ${draft.durationSeconds}`,
    );
  }

  return {
    id: randomUUID(),
    type,
    name: draft.name,
    // startTime is required, never defaulted: an element with no position is a
    // clip that exists nowhere, and it breaks every later overlap check.
    startTime: toTicks("startTimeSeconds", draft.startTimeSeconds),
    duration:
      draft.durationSeconds === undefined
        ? DEFAULT_DURATION_TICKS
        : toTicks("durationSeconds", draft.durationSeconds),
    trimStart: toTicks("trimStartSeconds", draft.trimStartSeconds ?? 0),
    trimEnd: toTicks("trimEndSeconds", draft.trimEndSeconds ?? 0),
    params: draft.params ?? {},
    ...(draft.mediaId ? { mediaId: draft.mediaId } : {}),
    ...(draft.stickerId ? { stickerId: draft.stickerId } : {}),
    ...(draft.definitionId ? { definitionId: draft.definitionId } : {}),
    ...(draft.effectType ? { effectType: draft.effectType } : {}),
    ...(draft.sourceDurationSeconds !== undefined
      ? { sourceDuration: toTicks("sourceDurationSeconds", draft.sourceDurationSeconds) }
      : {}),
    // `hidden` does not exist on audio elements, and writing it would report a
    // state nothing honours.
    ...(draft.hidden !== undefined && type !== "audio" ? { hidden: draft.hidden } : {}),
    ...(type === "audio" ? { sourceType: "upload" } : {}),
  };
}

/**
 * Place a new element: an explicit track, a compatible existing one, or a new one.
 *
 * Scan order is `[...overlay, main, ...audio]`, matching the editor's placement
 * resolver — overlay tracks win over main, not the other way round. And a newly
 * created non-audio track goes to overlay[0], not the end: scene-builder draws
 * `[...overlay, main]` reversed, so index 0 is the TOPMOST layer. Appending
 * instead would silently put new text underneath existing video.
 */
function placeElement(scene, element, explicitTrackId, { alwaysNewTrack = false } = {}) {
  const wanted = TRACK_FOR_ELEMENT[element.type];
  const tracks = scene.tracks;
  tracks.overlay = tracks.overlay ?? [];
  tracks.audio = tracks.audio ?? [];

  if (explicitTrackId) {
    const track = allTracks(tracks).find((t) => t.id === explicitTrackId);
    if (!track)
      throw new DocumentOperationError(`No track ${explicitTrackId}`, "unresolved_reference");
    if (track.type !== wanted) {
      throw new DocumentOperationError(
        `Track ${explicitTrackId} is a ${track.type} track; a ${element.type} element needs a ${wanted} track.`,
      );
    }
    track.elements.push(element);
    return track;
  }

  if (!alwaysNewTrack) {
    const scanned = [...tracks.overlay, tracks.main, ...tracks.audio].filter(Boolean);
    const existing = scanned.find((t) => t.type === wanted && trackHasRoom(t, element));
    if (existing) {
      existing.elements.push(element);
      return existing;
    }
  }

  const created = newTrack(wanted);
  created.elements.push(element);
  // getHighestInsertIndexForTrack: 0 for non-audio, overlay.length + 1 for audio
  // — which in the flattened [...overlay, main, ...audio] list is audio[0].
  if (wanted === "audio") tracks.audio.unshift(created);
  else tracks.overlay.unshift(created);
  return created;
}

const OPERATIONS = {
  "track.add": (scene, op) => {
    const type = op.trackType;
    if (!type) throw new DocumentOperationError("track.add requires trackType");
    // Kept for vocabulary parity with the editor, and behaves the same way: the
    // prune step removes an element-less track immediately, so this reports no
    // effect on its own. Use element.insert, which creates a track when needed.
    const bucket = type === "audio" ? "audio" : "overlay";
    scene.tracks[bucket] = scene.tracks[bucket] ?? [];
    const track = newTrack(type);
    const index = op.index ?? scene.tracks[bucket].length;
    scene.tracks[bucket].splice(index, 0, track);
  },

  "track.remove": (scene, op) => {
    const id = op.trackId;
    if (scene.tracks.main?.id === id) {
      throw new DocumentOperationError("The main track cannot be removed");
    }
    for (const bucket of ["overlay", "audio"]) {
      scene.tracks[bucket] = (scene.tracks[bucket] ?? []).filter((t) => t.id !== id);
    }
  },

  "track.toggleMute": (scene, op) => {
    const track = allTracks(scene.tracks).find((t) => t.id === op.trackId);
    if (!track) throw new DocumentOperationError(`No track ${op.trackId}`, "unresolved_reference");
    // Only video and audio tracks carry `muted`. Writing it onto a text track
    // would persist a flag nothing honours, and report it back as if it took.
    if (!canTrackHaveAudio(track)) return;
    track.muted = !track.muted;
  },

  "track.toggleVisibility": (scene, op) => {
    const track = allTracks(scene.tracks).find((t) => t.id === op.trackId);
    if (!track) throw new DocumentOperationError(`No track ${op.trackId}`, "unresolved_reference");
    if (!canTrackBeHidden(track)) return;
    track.hidden = !track.hidden;
  },

  "element.insert": (scene, op) => {
    const element = buildElement(op.element);
    const track = placeElement(scene, element, op.trackId);
    // Applied AFTER placement because it depends on which track was chosen.
    element.startTime = enforceMainTrackStart({
      tracks: scene.tracks,
      targetTrackId: track.id,
      requestedStartTime: element.startTime,
      excludeElementId: element.id,
    });
  },

  "element.delete": (scene, op) => {
    for (const ref of requireRefs(op.elements)) {
      const { track, index } = findElement(scene, ref);
      track.elements.splice(index, 1);
    }
  },

  "element.addEffect": (scene, op) => {
    const { element } = findElement(scene, op);
    if (!VISUAL_ELEMENT_TYPES.has(element.type)) {
      throw new DocumentOperationError(
        `Effects attach to visual elements; ${element.name} is ${element.type}.`,
      );
    }
    const defaults = EFFECT_DEFINITIONS[op.effectType];
    if (!defaults) {
      throw new DocumentOperationError(
        `Unknown effect ${JSON.stringify(op.effectType)}. Known: ${Object.keys(EFFECT_DEFINITIONS).join(", ")}`,
      );
    }
    element.effects = [
      ...(element.effects ?? []),
      { id: randomUUID(), type: op.effectType, params: { ...defaults }, enabled: true },
    ];
  },

  "element.removeEffect": (scene, op) => {
    const { element } = findElement(scene, op);
    const before = (element.effects ?? []).length;
    element.effects = (element.effects ?? []).filter((effect) => effect.id !== op.effectId);
    if (element.effects.length === before) {
      throw new DocumentOperationError(
        `No effect ${op.effectId} on ${element.name}.`,
        "unresolved_reference",
      );
    }
  },

  "element.toggleEffect": (scene, op) => {
    const { element } = findElement(scene, op);
    const effect = (element.effects ?? []).find((candidate) => candidate.id === op.effectId);
    if (!effect) {
      throw new DocumentOperationError(
        `No effect ${op.effectId} on ${element.name}.`,
        "unresolved_reference",
      );
    }
    effect.enabled = !effect.enabled;
  },

  "element.setEffectParams": (scene, op) => {
    const { element } = findElement(scene, op);
    const effect = (element.effects ?? []).find((candidate) => candidate.id === op.effectId);
    if (!effect) {
      throw new DocumentOperationError(
        `No effect ${op.effectId} on ${element.name}.`,
        "unresolved_reference",
      );
    }
    if (!op.params || Object.keys(op.params).length === 0) {
      throw new DocumentOperationError("element.setEffectParams names no parameter to change");
    }
    const known = EFFECT_DEFINITIONS[effect.type];
    for (const key of Object.keys(op.params)) {
      if (known && !(key in known)) {
        throw new DocumentOperationError(
          `Effect ${effect.type} has no parameter ${JSON.stringify(key)}. Known: ${Object.keys(known).join(", ")}`,
        );
      }
    }
    // Merged, not replaced: the command applies a Partial<ParamValues>.
    effect.params = { ...effect.params, ...op.params };
  },

  "element.reorderEffect": (scene, op) => {
    const { element } = findElement(scene, op);
    const effects = element.effects ?? [];
    const { fromIndex, toIndex } = op;
    for (const [name, value] of [["fromIndex", fromIndex], ["toIndex", toIndex]]) {
      if (!Number.isInteger(value) || value < 0 || value >= effects.length) {
        throw new DocumentOperationError(
          `${name} must be an index into this element's ${effects.length} effect(s); got ${value}`,
        );
      }
    }
    const [moved] = effects.splice(fromIndex, 1);
    effects.splice(toIndex, 0, moved);
    element.effects = effects;
  },

  "element.upsertKeyframe": (scene, op) => {
    const { element } = findElement(scene, op);
    const path = op.propertyPath;
    if (COLOUR_PARAMS.has(path)) {
      throw new DocumentOperationError(
        `${path} is a colour: it decomposes into four linearised channels through culori, which this layer cannot reproduce faithfully. Use apply_operation against the open tab.`,
        "unsupported_for_file_edit",
      );
    }
    const definition = KEYFRAMABLE_PARAMS[path];
    if (!definition) {
      throw new DocumentOperationError(
        `${JSON.stringify(path)} is not a keyframable property. Known: ${Object.keys(KEYFRAMABLE_PARAMS).join(", ")}`,
      );
    }
    if (op.interpolation !== undefined && !INTERPOLATIONS.has(op.interpolation)) {
      throw new DocumentOperationError(
        `interpolation must be one of ${[...INTERPOLATIONS].join(", ")}; got ${JSON.stringify(op.interpolation)}`,
      );
    }

    // Element-LOCAL time, clamped into the clip, exactly as the command does.
    const requested = toTicks("timeSeconds", op.timeSeconds);
    const time = Math.max(0, Math.min(requested, element.duration ?? 0));
    const value = coerceParamNumber(path, op.value, definition);

    element.animations = element.animations ?? {};
    const channel = element.animations[path] ?? { keys: [] };
    const keys = [...(channel.keys ?? [])];

    // Identity resolution, in the command's order: an explicit id that exists
    // MOVES that key; otherwise a key already at this exact tick wins and the
    // requested id is ignored; otherwise a new key.
    let index = op.keyframeId ? keys.findIndex((key) => key.id === op.keyframeId) : -1;
    if (index === -1) index = keys.findIndex((key) => key.time === time);

    if (index === -1) {
      keys.push({
        id: op.keyframeId ?? randomUUID(),
        time,
        value,
        ...(op.interpolation ? { segmentToNext: op.interpolation } : { segmentToNext: "linear" }),
        tangentMode: "flat",
      });
    } else {
      // Updating preserves handles and tangentMode; segmentToNext changes only
      // when the caller actually asked for a different interpolation.
      keys[index] = {
        ...keys[index],
        time,
        value,
        ...(op.interpolation ? { segmentToNext: op.interpolation } : {}),
      };
    }
    element.animations[path] = { ...channel, keys: keys.sort((a, b) => a.time - b.time) };
  },

  "element.removeKeyframe": (scene, op) => {
    const { element } = findElement(scene, op);
    const channel = element.animations?.[op.propertyPath];
    if (!channel) {
      throw new DocumentOperationError(
        `${element.name} has no keyframes on ${op.propertyPath}.`,
        "unresolved_reference",
      );
    }
    const remaining = (channel.keys ?? []).filter((key) => key.id !== op.keyframeId);
    if (remaining.length === (channel.keys ?? []).length) {
      throw new DocumentOperationError(
        `No keyframe ${op.keyframeId} on ${op.propertyPath}.`,
        "unresolved_reference",
      );
    }
    if (remaining.length > 0) {
      element.animations[op.propertyPath] = { ...channel, keys: remaining };
      return;
    }
    // Last key gone: drop the path, and write the caller's static value into
    // params so the clip keeps looking the way it did — the command's WYSIWYG step.
    delete element.animations[op.propertyPath];
    if (Object.keys(element.animations).length === 0) delete element.animations;
    if (op.valueAtPlayhead !== undefined && op.valueAtPlayhead !== null) {
      const definition = KEYFRAMABLE_PARAMS[op.propertyPath];
      if (definition) {
        element.params = {
          ...(element.params ?? {}),
          [op.propertyPath]: coerceParamNumber(op.propertyPath, op.valueAtPlayhead, definition),
        };
      }
    }
  },

  "element.duplicate": (scene, op) => {
    for (const ref of requireRefs(op.elements)) {
      const { element } = findElement(scene, ref);
      const copy = { ...clone(element), id: randomUUID(), name: `${element.name} (copy)` };
      if (element.animations) {
        const animations = cloneAnimations({
          animations: clone(element.animations),
          shouldRegenerateKeyframeIds: true,
        });
        if (animations) copy.animations = animations;
        else delete copy.animations;
      }
      // DuplicateElementsCommand uses alwaysNew/highest — it never reuses an
      // existing track, so the copy is visibly separate rather than merged into
      // whatever happened to have room.
      placeElement(scene, copy, undefined, { alwaysNewTrack: true });
    }
  },

  "element.move": (scene, op) => {
    const moves = op.moves ?? [];
    requireRefs(moves.map(({ trackId, elementId }) => ({ trackId, elementId })));

    // Resolve everything BEFORE mutating, and then remove by IDENTITY rather
    // than by index. Splicing with indices captured up front is wrong the moment
    // two moves come from the same track: the first splice shifts the rest, so
    // the second removes a bystander and the moved element gets duplicated under
    // its original id. MoveElementCommand avoids this by filtering once against
    // a set of moved ids, which is what this now does.
    const planned = moves.map((move) => {
      const found = findElement(scene, { trackId: move.trackId, elementId: move.elementId });
      const targetId = move.targetTrackId ?? move.trackId;
      const targetTrack = allTracks(scene.tracks).find((t) => t.id === targetId);
      if (!targetTrack) {
        throw new DocumentOperationError(
          `No track ${targetId} to move onto in the active scene.`,
          "unresolved_reference",
        );
      }
      const wanted = TRACK_FOR_ELEMENT[found.element.type];
      if (targetTrack.type !== wanted) {
        // The editor throws here too; without the check a video element ends up
        // inside an audio track's element list, which nothing downstream expects.
        throw new DocumentOperationError(
          `Track ${targetId} is a ${targetTrack.type} track; a ${found.element.type} element needs a ${wanted} track.`,
        );
      }
      return {
        element: found.element,
        targetTrack,
        startTime: enforceMainTrackStart({
          tracks: scene.tracks,
          targetTrackId: targetTrack.id,
          requestedStartTime: toTicks("startTimeSeconds", move.startTimeSeconds),
          excludeElementId: found.element.id,
        }),
      };
    });

    const movedIds = new Set(planned.map((entry) => entry.element.id));
    for (const track of allTracks(scene.tracks)) {
      track.elements = (track.elements ?? []).filter((element) => !movedIds.has(element.id));
    }
    for (const { element, targetTrack, startTime } of planned) {
      targetTrack.elements.push({ ...element, startTime });
    }
  },

  "element.trim": (scene, op) => {
    const elements = op.elements ?? [];
    requireRefs(elements.map(({ trackId, elementId }) => ({ trackId, elementId })));
    for (const entry of elements) {
      const { element } = findElement(scene, entry);
      const patch = {};
      if (entry.startTimeSeconds !== undefined)
        patch.startTime = toTicks("startTimeSeconds", entry.startTimeSeconds);
      if (entry.durationSeconds !== undefined) {
        if (!(entry.durationSeconds > 0))
          throw new DocumentOperationError(
            `durationSeconds must be greater than 0; got ${entry.durationSeconds}`,
          );
        patch.duration = toTicks("durationSeconds", entry.durationSeconds);
      }
      if (entry.trimStartSeconds !== undefined)
        patch.trimStart = toTicks("trimStartSeconds", entry.trimStartSeconds);
      if (entry.trimEndSeconds !== undefined)
        patch.trimEnd = toTicks("trimEndSeconds", entry.trimEndSeconds);
      if (Object.keys(patch).length === 0) {
        throw new DocumentOperationError(
          `element.trim for ${entry.elementId} names no field to change`,
        );
      }
      // Only named fields are assigned: writing undefined would erase a real value.
      Object.assign(element, patch);
      if (patch.startTime !== undefined) {
        // The update pipeline applies the same pin the placement resolver does.
        const owner = allTracks(scene.tracks).find((t) =>
          (t.elements ?? []).some((e) => e.id === element.id),
        );
        element.startTime = enforceMainTrackStart({
          tracks: scene.tracks,
          targetTrackId: owner?.id,
          requestedStartTime: element.startTime,
          excludeElementId: element.id,
        });
      }

      const sourceDuration = element.sourceDuration;
      if (typeof sourceDuration === "number" && sourceDuration > 0) {
        const used = element.trimStart + element.duration + element.trimEnd;
        if (used > sourceDuration + 1) {
          throw new DocumentOperationError(
            `element ${entry.elementId}: trimStart + duration + trimEnd (${toSeconds(used)}s) exceeds the source media length of ${toSeconds(sourceDuration)}s.`,
          );
        }
      }
    }
  },

  "element.rename": (scene, op) => {
    const elements = op.elements ?? [];
    requireRefs(elements.map(({ trackId, elementId }) => ({ trackId, elementId })));
    for (const entry of elements) {
      if (typeof entry.name !== "string" || !entry.name) {
        throw new DocumentOperationError("element.rename requires a non-empty name");
      }
      findElement(scene, entry).element.name = entry.name;
    }
  },

  "element.split": (scene, op) => {
    const refs = requireRefs(op.elements);
    const at = toTicks("splitTimeSeconds", op.splitTimeSeconds);
    const retain = op.retainSide ?? "both";
    for (const ref of refs) {
      const { track, index, element } = findElement(scene, ref);
      const start = element.startTime;
      const end = start + element.duration;
      // SplitElementsCommand leaves a clip untouched when the cut misses it, so
      // "split everything at 10s" trims the crossing clips and ignores the rest.
      // Throwing here would abort a whole batch over a clip the caller never
      // meant to cut.
      if (at <= start || at >= end) continue;
      refuseAnimated(element, "Splitting");

      const leftDuration = at - start;
      // Trims are measured in SOURCE time, which is not clip time when the clip
      // is retimed: a 2x clip consumes two seconds of footage per timeline
      // second. Using the visible duration here puts both halves on the wrong
      // frames.
      const rate = element.retime?.rate ?? 1;
      const consumed = Math.round(leftDuration * rate);
      const remaining = Math.round((element.duration - leftDuration) * rate);

      const left = {
        ...clone(element),
        name: `${element.name} (left)`,
        duration: leftDuration,
        trimEnd: element.trimEnd + remaining,
      };
      const right = {
        ...clone(element),
        id: randomUUID(),
        name: `${element.name} (right)`,
        startTime: at,
        duration: end - at,
        trimStart: element.trimStart + consumed,
      };
      const replacement =
        retain === "left" ? [left] : retain === "right" ? [right] : [left, right];
      track.elements.splice(index, 1, ...replacement);
    }
  },

  "scene.rename": (scene, op, document) => {
    const target = (document.scenes ?? []).find((s) => s.id === op.sceneId);
    if (!target)
      throw new DocumentOperationError(`No scene ${op.sceneId}`, "unresolved_reference");
    if (typeof op.newName !== "string" || !op.newName) {
      throw new DocumentOperationError("scene.rename requires a non-empty newName");
    }
    target.name = op.newName;
  },
};

/**
 * Build a fresh project document, matching createNewProject + buildDefaultScene.
 *
 * Deliberately a plain builder rather than a driven browser: a new project is
 * static JSON with no File, no AudioBuffer and no canvas in it, so needing a
 * live Chrome to produce one would be pure ceremony. Every constant here is
 * mirrored from the app and pinned by a test — a wrong CURRENT_PROJECT_VERSION
 * in particular would send the document through a migration it does not need.
 */
export const CURRENT_PROJECT_VERSION = 31;
const DEFAULT_CANVAS_SIZE = { width: 1920, height: 1080 };
const DEFAULT_FPS = { numerator: 30, denominator: 1 };
const DEFAULT_BACKGROUND_COLOR = "#000000";
const MAIN_TRACK_NAME = "Main Track";

export function buildNewProjectDocument({ name, id, sceneId, mainTrackId, now, fps, canvasSize }) {
  const timestamp = now ?? new Date().toISOString();
  const scene = {
    id: sceneId ?? randomUUID(),
    name: "Main scene",
    isMain: true,
    tracks: {
      overlay: [],
      main: {
        id: mainTrackId ?? randomUUID(),
        name: MAIN_TRACK_NAME,
        type: "video",
        elements: [],
        muted: false,
        hidden: false,
      },
      audio: [],
    },
    bookmarks: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const projectId = id ?? randomUUID();
  return {
    metadata: {
      id: projectId,
      name,
      // A fresh project has no elements, so the derived duration is zero.
      duration: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    scenes: [scene],
    currentSceneId: scene.id,
    settings: {
      fps: fps ?? DEFAULT_FPS,
      canvasSize: canvasSize ?? DEFAULT_CANVAS_SIZE,
      canvasSizeMode: "preset",
      lastCustomCanvasSize: null,
      originalCanvasSize: null,
      background: { type: "color", color: DEFAULT_BACKGROUND_COLOR },
    },
    version: CURRENT_PROJECT_VERSION,
  };
}

export function supportedOperationTypes() {
  return Object.keys(OPERATIONS);
}

/**
 * Apply one operation to a document.
 *
 * Returns a NEW document plus whether anything actually changed — the same
 * `noEffect` contract the in-page layer reports, and for the same reason: a
 * command the editor neutralises (an element-less track, a rename to the current
 * name) must not read as a successful edit.
 */
/**
 * Port of floatToFrameRate: standard broadcast rates snap to their exact
 * rational, integers stay integers, anything else is reduced over 1e6.
 */
function floatToFrameRate(fps) {
  // Must match STANDARD_FRAME_RATES in fps/utils.ts exactly. An earlier version
  // of this table omitted 48 and 120, so 47.995 became {9599,200} here and
  // {48,1} in the editor — the same project at two different frame rates.
  const standards = [
    { value: 24000 / 1001, rate: { numerator: 24000, denominator: 1001 } },
    { value: 30000 / 1001, rate: { numerator: 30000, denominator: 1001 } },
    { value: 60000 / 1001, rate: { numerator: 60000, denominator: 1001 } },
    { value: 24, rate: { numerator: 24, denominator: 1 } },
    { value: 25, rate: { numerator: 25, denominator: 1 } },
    { value: 30, rate: { numerator: 30, denominator: 1 } },
    { value: 48, rate: { numerator: 48, denominator: 1 } },
    { value: 50, rate: { numerator: 50, denominator: 1 } },
    { value: 60, rate: { numerator: 60, denominator: 1 } },
    { value: 120, rate: { numerator: 120, denominator: 1 } },
  ];
  const standard = standards.find((c) => Math.abs(fps - c.value) <= 0.01);
  if (standard) return standard.rate;
  if (Number.isInteger(fps)) return { numerator: fps, denominator: 1 };
  const DENOM = 1_000_000;
  const scaled = Math.round(fps * DENOM);
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(scaled, DENOM);
  return { numerator: scaled / divisor, denominator: DENOM / divisor };
}

/**
 * Adopt the footage's dimensions and frame rate for the FIRST visual clip.
 *
 * InsertElementCommand does this in the editor: dropping a 4K 23.976 clip into a
 * fresh project makes the project 4K 23.976. Without it a file-built project
 * exports at the default 1080p/30 no matter what the source was — the edit looks
 * right in the timeline and comes out wrong.
 */
function adoptSettingsFromFirstClip({ document, scene, element, mediaIndex }) {
  if (element.type !== "video" && element.type !== "image") return;
  const asset = mediaIndex?.[element.mediaId];
  if (!asset) return;

  const clipCount = allTracks(scene.tracks).reduce(
    (total, track) => total + (track.elements ?? []).length,
    0,
  );
  // The clip has already been placed, so "first" means it is the only one.
  if (clipCount !== 1) return;

  if (asset.width && asset.height) {
    const canvasSize = { width: asset.width, height: asset.height };
    document.settings = {
      ...document.settings,
      canvasSize,
      // originalCanvasSize is only ever set once, so a later import cannot
      // overwrite what the project was authored against.
      ...(document.settings?.originalCanvasSize ? {} : { originalCanvasSize: canvasSize }),
    };
  }
  if (asset.type === "video" && typeof asset.fps === "number" && asset.fps > 0) {
    document.settings = { ...document.settings, fps: floatToFrameRate(asset.fps) };
  }
}

export function applyOperationToDocument({ document, operation, mediaIndex }) {
  const type = operation?.type;
  const handler = OPERATIONS[type];
  if (!handler) {
    throw new DocumentOperationError(`Unknown operation type: ${JSON.stringify(type)}`, "unknown_operation");
  }

  const next = clone(document);
  const scene = activeScene(next);
  handler(scene, operation, next);
  if (operation.type === "element.insert") {
    const inserted = allTracks(scene.tracks)
      .flatMap((track) => track.elements ?? [])
      .find((element) => !documentHasElement(document, element.id));
    if (inserted) adoptSettingsFromFirstClip({ document: next, scene, element: inserted, mediaIndex });
  }
  prune(scene);

  // Compare ignoring the fields every save stamps, so "the document changed"
  // means the content changed and not merely that time passed.
  const before = fingerprint(document);
  const after = fingerprint(next);
  return { document: next, changed: before !== after };
}

/**
 * Recompute what the editor recomputes on every save.
 *
 * `metadata.duration` and `metadata.updatedAt` are derived, not authored: the
 * projects list sorts on them. A file edit that leaves them stale shows the
 * wrong length and the wrong "last edited" until a human happens to touch the
 * project in the editor.
 */
export function refreshDerivedMetadata({ document, now }) {
  const next = clone(document);
  next.metadata = { ...next.metadata, duration: projectDuration(next), updatedAt: now };
  return next;
}

/**
 * Port of getProjectDurationFromScenes.
 *
 * Note it measures the MAIN scene only — `getMainScene({scenes}) ?? scenes[0]` —
 * not every scene. Summing across all of them would report a longer project than
 * the editor does the moment a second scene exists.
 */
function projectDuration(document) {
  const scenes = document.scenes ?? [];
  const mainScene = scenes.find((scene) => scene.isMain) ?? scenes[0] ?? null;
  if (!mainScene?.tracks) return 0;
  let maxEnd = 0;
  for (const track of allTracks(mainScene.tracks)) {
    for (const element of track.elements ?? []) {
      const end = (element.startTime ?? 0) + (element.duration ?? 0);
      if (end > maxEnd) maxEnd = end;
    }
  }
  return maxEnd;
}

/** Fingerprint of the whole document, for callers batching several operations. */
export function documentFingerprint(document) {
  return fingerprint(document);
}

function documentHasElement(document, elementId) {
  return (document.scenes ?? []).some((scene) =>
    allTracks(scene.tracks).some((track) =>
      (track.elements ?? []).some((element) => element.id === elementId),
    ),
  );
}

function fingerprint(document) {
  return JSON.stringify(document, (key, value) =>
    key === "updatedAt" || key === "revision" ? undefined : value,
  );
}

/** The readable state an agent composes operations against. */
export function describeDocument({ document }) {
  const scene = activeScene(document);
  const describeElement = (element) => {
    const start = toSeconds(element.startTime);
    const duration = toSeconds(element.duration);
    return {
      id: element.id,
      type: element.type,
      name: element.name,
      startTimeSeconds: start,
      durationSeconds: duration,
      endTimeSeconds: start !== null && duration !== null ? start + duration : null,
      trimStartSeconds: toSeconds(element.trimStart),
      trimEndSeconds: toSeconds(element.trimEnd),
      ...(element.mediaId ? { mediaId: element.mediaId } : {}),
      ...(typeof element.hidden === "boolean" ? { hidden: element.hidden } : {}),
      ...(element.effectType ? { effectType: element.effectType } : {}),
      ...(element.params && Object.keys(element.params).length > 0
        ? { params: element.params }
        : {}),
      // Without the effect ids here an agent can attach an effect and then never
      // address it again — every remove/toggle/tune operation needs this id.
      // Without this, keyframes are write-only: an agent can create one and
      // then never see, move, or delete it.
      ...(element.animations && Object.keys(element.animations).length > 0
        ? {
            animations: Object.fromEntries(
              Object.entries(element.animations).map(([path, channel]) => [
                path,
                (channel?.keys ?? []).map((key) => ({
                  id: key.id,
                  timeSeconds: toSeconds(key.time),
                  value: key.value,
                  interpolation: key.segmentToNext ?? "linear",
                })),
              ]),
            ),
          }
        : {}),
      ...(Array.isArray(element.effects) && element.effects.length > 0
        ? {
            effects: element.effects.map((effect) => ({
              id: effect.id,
              type: effect.type,
              enabled: effect.enabled !== false,
              params: effect.params ?? {},
            })),
          }
        : {}),
    };
  };
  return {
    revision: typeof document.revision === "number" ? document.revision : 0,
    projectId: document.metadata?.id ?? null,
    projectName: document.metadata?.name ?? null,
    sceneId: scene.id,
    sceneName: scene.name,
    fps: document.settings?.fps ?? null,
    tracks: allTracks(scene.tracks).map((track) => ({
      id: track.id,
      type: track.type,
      name: track.name,
      muted: track.muted,
      hidden: track.hidden,
      elementCount: (track.elements ?? []).length,
      elements: (track.elements ?? []).map(describeElement),
    })),
  };
}
