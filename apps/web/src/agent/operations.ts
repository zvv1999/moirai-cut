import { AddTrackCommand } from "@/commands/timeline/track/add-track";
import { RemoveTrackCommand } from "@/commands/timeline/track/remove-track";
import { ToggleTrackMuteCommand } from "@/commands/timeline/track/toggle-track-mute";
import { ToggleTrackVisibilityCommand } from "@/commands/timeline/track/toggle-track-visibility";
import { RenameSceneCommand } from "@/commands/scene/rename-scene";
import { InsertElementCommand } from "@/commands/timeline/element/insert-element";
import { DeleteElementsCommand } from "@/commands/timeline/element/delete-elements";
import { DuplicateElementsCommand } from "@/commands/timeline/element/duplicate-elements";
import { MoveElementCommand } from "@/commands/timeline/element/move-elements";
import { SplitElementsCommand } from "@/commands/timeline/element/split-elements";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import { AddClipEffectCommand } from "@/commands/timeline/element/effects/add-effect";
import { RemoveClipEffectCommand } from "@/commands/timeline/element/effects/remove-effect";
import { ToggleClipEffectCommand } from "@/commands/timeline/element/effects/toggle-effect";
import { UpdateClipEffectParamsCommand } from "@/commands/timeline/element/effects/update-effect-params";
import { ReorderClipEffectsCommand } from "@/commands/timeline/element/effects/reorder-effect";
import { UpsertKeyframeCommand } from "@/commands/timeline/element/keyframes/upsert-keyframe";
import { RemoveKeyframeCommand } from "@/commands/timeline/element/keyframes/remove-keyframe";
import { RetimeKeyframeCommand } from "@/commands/timeline/element/keyframes/retime-keyframe";
import { UpdateScalarKeyframeCurveCommand } from "@/commands/timeline/element/keyframes/update-scalar-keyframe-curve";
import { UpsertEffectParamKeyframeCommand } from "@/commands/timeline/element/keyframes/upsert-effect-param-keyframe";
import { RemoveEffectParamKeyframeCommand } from "@/commands/timeline/element/keyframes/remove-effect-param-keyframe";
import { CreateSceneCommand } from "@/commands/scene/create-scene";
import { DeleteSceneCommand } from "@/commands/scene/delete-scene";
import { ToggleBookmarkCommand } from "@/commands/scene/toggle-bookmark";
import { RemoveBookmarkCommand } from "@/commands/scene/remove-bookmark";
import { MoveBookmarkCommand } from "@/commands/scene/move-bookmark";
import { UpdateBookmarkCommand } from "@/commands/scene/update-bookmark";
import { UpdateProjectSettingsCommand } from "@/commands/project/update-project-settings";
import { ToggleSourceAudioSeparationCommand } from "@/commands/timeline/element/toggle-source-audio-separation";
import { RemoveMaskCommand } from "@/commands/timeline/element/masks/remove-mask";
import { ToggleMaskInvertedCommand } from "@/commands/timeline/element/masks/toggle-mask-inverted";
import { DeleteFreeformPathMaskPointsCommand } from "@/commands/timeline/element/masks/delete-custom-mask-points";
import type { TProjectSettings } from "@/project/types";
import type { MediaTime } from "@/wasm";
import type { Command } from "@/commands";
import type { CreateTimelineElement, TimelineElement, TrackType } from "@/timeline/types";
import { toMediaTime } from "./time";

/**
 * Serializable edit vocabulary for external (agent) callers.
 *
 * The editor's own `Command` classes are memento-style: they capture a whole
 * `SceneTracks` snapshot at execute() time and hold live object graphs, so they
 * can be *executed* but never *transmitted*. An `Operation` is the transmittable
 * half — plain JSON that names an intent and its arguments. The registry below
 * is the only place that turns one into the other, which keeps the agent surface
 * from drifting away from what the UI actually does: both go through the exact
 * same command objects and therefore the same undo/redo and ripple behaviour.
 */
/**
 * How a caller names one clip. Mirrors the editor's own `ElementRef`: the
 * element id alone is not enough, because every element command is constructed
 * from the (trackId, elementId) pair.
 */
export interface ElementRefInput {
  trackId: string;
  elementId: string;
}

/** A clip to create. Times are SECONDS — see ./time.ts for why. */
export interface ElementDraftInput {
  type: "video" | "image" | "text" | "audio" | "sticker" | "graphic";
  name: string;
  startTimeSeconds: number;
  durationSeconds?: number;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  /** Built-in element params, e.g. `{ content: "Hello" }` for text. */
  params?: Record<string, number | string | boolean>;
  /** Required for video/image/audio: an id from `getState().media`. */
  mediaId?: string;
  /** Required for sticker / graphic respectively. */
  stickerId?: string;
  definitionId?: string;
  hidden?: boolean;
  /**
   * Length of the underlying media. Normally filled in automatically from the
   * media library — it is what bounds edge-dragging, so a clip without it can be
   * stretched past the end of its own footage BY THE HUMAN, not just by an agent.
   */
  sourceDurationSeconds?: number;
}

export type Operation =
  | { type: "track.add"; trackType: TrackType; index?: number }
  | { type: "track.remove"; trackId: string }
  | { type: "track.toggleMute"; trackId: string }
  | { type: "track.toggleVisibility"; trackId: string }
  | { type: "scene.rename"; sceneId: string; newName: string }
  | {
      type: "element.insert";
      element: ElementDraftInput;
      /** Omit to let the editor pick or create a compatible track. */
      trackId?: string;
    }
  | { type: "element.delete"; elements: ElementRefInput[] }
  | {
      type: "element.move";
      moves: Array<ElementRefInput & { targetTrackId?: string; startTimeSeconds: number }>;
    }
  | {
      type: "element.split";
      elements: ElementRefInput[];
      splitTimeSeconds: number;
      retainSide?: "both" | "left" | "right";
    }
  | {
      type: "element.trim";
      elements: Array<
        ElementRefInput & {
          startTimeSeconds?: number;
          durationSeconds?: number;
          trimStartSeconds?: number;
          trimEndSeconds?: number;
        }
      >;
    }
  | {
      type: "element.rename";
      elements: Array<ElementRefInput & { name: string }>;
    }
  | { type: "element.duplicate"; elements: ElementRefInput[] }
  | (ElementRefInput & { type: "element.addEffect"; effectType: string })
  | (ElementRefInput & { type: "element.removeEffect"; effectId: string })
  | (ElementRefInput & { type: "element.toggleEffect"; effectId: string })
  | (ElementRefInput & {
      type: "element.setEffectParams";
      effectId: string;
      params: Record<string, number | string | boolean>;
    })
  | (ElementRefInput & { type: "element.reorderEffect"; fromIndex: number; toIndex: number })
  | (ElementRefInput & {
      type: "element.upsertKeyframe";
      propertyPath: string;
      /** SECONDS from the element's own start, not the timeline origin. */
      timeSeconds: number;
      value: number;
      interpolation?: "linear" | "hold" | "bezier";
      keyframeId?: string;
    })
  | (ElementRefInput & {
      type: "element.removeKeyframe";
      propertyPath: string;
      keyframeId: string;
      /** Written into params when the last keyframe goes, so the look is kept. */
      valueAtPlayhead?: number | null;
    })
  | (ElementRefInput & {
      type: "element.retimeKeyframe";
      propertyPath: string;
      keyframeId: string;
      timeSeconds: number;
    })
  | (ElementRefInput & {
      type: "element.setKeyframeCurve";
      propertyPath: string;
      keyframeId: string;
      segmentToNext?: "step" | "linear" | "bezier";
      tangentMode?: "auto" | "aligned" | "broken" | "flat";
    })
  | (ElementRefInput & {
      type: "element.upsertEffectKeyframe";
      effectId: string;
      paramKey: string;
      timeSeconds: number;
      value: number;
      interpolation?: "linear" | "hold" | "bezier";
      keyframeId?: string;
    })
  | (ElementRefInput & {
      type: "element.removeEffectKeyframe";
      effectId: string;
      paramKey: string;
      keyframeId: string;
    })
  | (ElementRefInput & { type: "element.toggleSourceAudio" })
  | (ElementRefInput & { type: "element.removeMask"; maskId: string })
  | (ElementRefInput & { type: "element.toggleMaskInverted"; maskId: string })
  | (ElementRefInput & {
      type: "element.deleteMaskPoints";
      maskId: string;
      pointIds: string[];
    })
  | { type: "scene.create"; name: string }
  | { type: "scene.delete"; sceneId: string }
  | { type: "bookmark.toggle"; timeSeconds: number }
  | { type: "bookmark.remove"; timeSeconds: number }
  | { type: "bookmark.move"; fromSeconds: number; toSeconds: number }
  | {
      type: "bookmark.update";
      timeSeconds: number;
      note?: string;
      color?: string;
      durationSeconds?: number;
    }
  | {
      type: "project.updateSettings";
      fps?: { numerator: number; denominator: number };
      canvasSize?: { width: number; height: number };
      backgroundColor?: string;
    };

export type OperationType = Operation["type"];

/** Every operation carries the concurrency envelope, not just its payload. */
export interface OperationEnvelope {
  operation: Operation;
  /** The revision the caller believes it is editing. Rejected if stale. */
  baseRevision: number;
  /** Replay guard: the same key is never applied twice. */
  idempotencyKey: string;
  /**
   * The project the caller read `baseRevision` from. A revision number alone
   * does not identify a document: the human can switch the tab to another
   * project, and a held number could then authorise an edit against the wrong
   * one. Naming the document closes that.
   */
  expectedProjectId?: string;
}

export interface OperationResult {
  applied: boolean;
  /** Revision AFTER this call. Unchanged unless the document actually changed. */
  revision: number;
  /** True when the key had already been applied and the call was a no-op. */
  deduplicated: boolean;
  /**
   * True when the command ran but left the document byte-identical — e.g. the
   * editor's prune reactor removed the element-less track that was just added.
   * The caller MUST treat this as "the edit did not happen".
   */
  noEffect: boolean;
}

export class OperationConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Revision conflict: operation was built against revision ${expectedRevision}, but the project is at ${actualRevision}. Re-read the project and retry.`,
    );
    this.name = "OperationConflictError";
  }
}

export class ProjectMismatchError extends Error {
  constructor(
    readonly expectedProjectId: string,
    readonly actualProjectId: string | null,
  ) {
    super(
      `Project mismatch: this operation was built against project ${expectedProjectId}, but the editor now has ${actualProjectId ?? "no project"} open. Re-read the project and retry.`,
    );
    this.name = "ProjectMismatchError";
  }
}

export class UnknownOperationError extends Error {
  constructor(type: string) {
    super(`Unknown operation type: ${type}`);
    this.name = "UnknownOperationError";
  }
}

export class InvalidOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperationError";
  }
}

function requireId(field: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidOperationError(`${field} must be a non-empty string; got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireRefs(elements: ElementRefInput[]): ElementRefInput[] {
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new InvalidOperationError("this operation needs at least one {trackId, elementId}");
  }
  const refs = elements.map((ref) => ({
    trackId: requireId("trackId", ref.trackId),
    elementId: requireId("elementId", ref.elementId),
  }));
  // Naming the same element twice is never meaningful, and MoveElementCommand
  // actively corrupts on it: it dedupes when resolving but re-iterates the raw
  // list when rebuilding tracks, so the element is inserted once per mention
  // while being removed only once — leaving two clips sharing one id, after
  // which every id-keyed lookup can only ever reach the first.
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.elementId)) {
      throw new InvalidOperationError(`element ${ref.elementId} is named more than once`);
    }
    seen.add(ref.elementId);
  }
  return refs;
}

/** Per-element-type required id, so a missing one fails here and not silently. */
const REQUIRED_SOURCE: Partial<Record<ElementDraftInput["type"], keyof ElementDraftInput>> = {
  video: "mediaId",
  image: "mediaId",
  audio: "mediaId",
  sticker: "stickerId",
  graphic: "definitionId",
};

/**
 * Turn wire JSON into the editor's `CreateTimelineElement`.
 *
 * `startTime` is required rather than defaulted, and that is deliberate:
 * InsertElementCommand does NOT supply one. Its placement resolver returns the
 * requested start unchanged, so an omitted value survives all the way into the
 * stored element as `startTime: undefined` — a clip that exists but has no
 * position, and whose overlap checks then misbehave. Refusing up front turns a
 * corrupt document into an error message.
 */
function buildElementDraft(draft: ElementDraftInput): CreateTimelineElement {
  const required = REQUIRED_SOURCE[draft.type];
  if (required && !draft[required]) {
    throw new InvalidOperationError(
      `element.insert of type "${draft.type}" requires ${String(required)}`,
    );
  }
  if (draft.type === "text" && typeof draft.params?.content !== "string") {
    // InsertElementCommand reads params.content unguarded for text elements.
    throw new InvalidOperationError(`element.insert of type "text" requires params.content`);
  }

  const base = {
    name: requireId("name", draft.name),
    startTime: toMediaTime("startTimeSeconds", draft.startTimeSeconds),
    trimStart: toMediaTime("trimStartSeconds", draft.trimStartSeconds ?? 0),
    trimEnd: toMediaTime("trimEndSeconds", draft.trimEndSeconds ?? 0),
    // The editor defaults duration only on null/undefined, so leaving it out is
    // safe; passing 0 explicitly is not, and is rejected by toMediaTime's caller
    // contract only if negative — so guard the degenerate case here.
    ...(draft.durationSeconds !== undefined
      ? { duration: toMediaTime("durationSeconds", requirePositive(draft.durationSeconds)) }
      : {}),
    ...(draft.sourceDurationSeconds !== undefined
      ? { sourceDuration: toMediaTime("sourceDurationSeconds", draft.sourceDurationSeconds) }
      : {}),
    params: draft.params ?? {},
    // AudioElement has no `hidden`. Setting it anyway would be echoed back by
    // getState and would move the fingerprint, so the caller would be told an
    // edit landed that nothing in the editor honours.
    ...(draft.hidden !== undefined && draft.type !== "audio" ? { hidden: draft.hidden } : {}),
  };

  switch (draft.type) {
    case "video":
      return { ...base, type: "video", mediaId: draft.mediaId as string } as CreateTimelineElement;
    case "image":
      return { ...base, type: "image", mediaId: draft.mediaId as string } as CreateTimelineElement;
    case "audio":
      return {
        ...base,
        type: "audio",
        sourceType: "upload",
        mediaId: draft.mediaId as string,
      } as CreateTimelineElement;
    case "text":
      return { ...base, type: "text" } as CreateTimelineElement;
    case "sticker":
      return {
        ...base,
        type: "sticker",
        stickerId: draft.stickerId as string,
      } as CreateTimelineElement;
    case "graphic":
      return {
        ...base,
        type: "graphic",
        definitionId: draft.definitionId as string,
      } as CreateTimelineElement;
    default:
      throw new InvalidOperationError(`Unsupported element type: ${String(draft.type)}`);
  }
}

function requirePositive(seconds: number): number {
  if (!(seconds > 0)) {
    // A zero-length clip makes the editor's overlap test (start < end) always
    // report the track free, so it silently stacks on top of existing clips.
    throw new InvalidOperationError(`durationSeconds must be greater than 0; got ${seconds}`);
  }
  return seconds;
}

type CommandFactory = (operation: Operation) => Command;

/**
 * operation type -> the SAME command class the UI uses. Adding an entry here is
 * how an editor capability becomes agent-drivable; nothing else is required.
 */
const COMMAND_FACTORIES: { [K in OperationType]: CommandFactory } = {
  "track.add": (operation) => {
    const { trackType, index } = operation as Extract<Operation, { type: "track.add" }>;
    return new AddTrackCommand({ type: trackType, index });
  },
  "track.remove": (operation) => {
    const { trackId } = operation as Extract<Operation, { type: "track.remove" }>;
    return new RemoveTrackCommand(trackId);
  },
  "track.toggleMute": (operation) => {
    const { trackId } = operation as Extract<Operation, { type: "track.toggleMute" }>;
    return new ToggleTrackMuteCommand(trackId);
  },
  "track.toggleVisibility": (operation) => {
    const { trackId } = operation as Extract<Operation, { type: "track.toggleVisibility" }>;
    return new ToggleTrackVisibilityCommand(trackId);
  },
  "scene.rename": (operation) => {
    const { sceneId, newName } = operation as Extract<Operation, { type: "scene.rename" }>;
    return new RenameSceneCommand({ sceneId, newName });
  },

  "element.insert": (operation) => {
    const { element, trackId } = operation as Extract<Operation, { type: "element.insert" }>;
    return new InsertElementCommand({
      element: buildElementDraft(element),
      placement: trackId ? { mode: "explicit", trackId } : { mode: "auto" },
    });
  },

  "element.delete": (operation) => {
    const { elements } = operation as Extract<Operation, { type: "element.delete" }>;
    return new DeleteElementsCommand({ elements: requireRefs(elements) });
  },

  "element.move": (operation) => {
    const { moves } = operation as Extract<Operation, { type: "element.move" }>;
    if (moves.length === 0) throw new InvalidOperationError("element.move needs at least one move");
    requireRefs(moves.map(({ trackId, elementId }) => ({ trackId, elementId })));
    return new MoveElementCommand({
      moves: moves.map((move) => ({
        sourceTrackId: requireId("trackId", move.trackId),
        // Staying on the same track is the common case; not defaulting it would
        // make every trim-by-move need a redundant argument.
        targetTrackId: move.targetTrackId ?? requireId("trackId", move.trackId),
        elementId: requireId("elementId", move.elementId),
        newStartTime: toMediaTime("startTimeSeconds", move.startTimeSeconds),
      })),
    });
  },

  "element.split": (operation) => {
    const { elements, splitTimeSeconds, retainSide } = operation as Extract<
      Operation,
      { type: "element.split" }
    >;
    return new SplitElementsCommand({
      elements: requireRefs(elements),
      splitTime: toMediaTime("splitTimeSeconds", splitTimeSeconds),
      ...(retainSide ? { retainSide } : {}),
    });
  },

  "element.trim": (operation) => {
    const { elements } = operation as Extract<Operation, { type: "element.trim" }>;
    requireRefs(elements.map(({ trackId, elementId }) => ({ trackId, elementId })));
    return new UpdateElementsCommand({
      updates: elements.map((entry) => {
        const patch: Record<string, unknown> = {};
        // Only fields the caller actually named are patched: spreading undefined
        // would overwrite real times with undefined and silently unposition the
        // clip, which the editor does not defend against.
        if (entry.startTimeSeconds !== undefined)
          patch.startTime = toMediaTime("startTimeSeconds", entry.startTimeSeconds);
        if (entry.durationSeconds !== undefined)
          // Same reason as insert: a zero-length clip makes the editor's
          // `start < end` overlap test report every track free.
          patch.duration = toMediaTime("durationSeconds", requirePositive(entry.durationSeconds));
        if (entry.trimStartSeconds !== undefined)
          patch.trimStart = toMediaTime("trimStartSeconds", entry.trimStartSeconds);
        if (entry.trimEndSeconds !== undefined)
          patch.trimEnd = toMediaTime("trimEndSeconds", entry.trimEndSeconds);
        if (Object.keys(patch).length === 0) {
          throw new InvalidOperationError(
            `element.trim for ${entry.elementId} names no field to change`,
          );
        }
        return {
          trackId: requireId("trackId", entry.trackId),
          elementId: requireId("elementId", entry.elementId),
          patch: patch as Partial<TimelineElement>,
        };
      }),
    });
  },

  "element.rename": (operation) => {
    const { elements } = operation as Extract<Operation, { type: "element.rename" }>;
    requireRefs(elements.map(({ trackId, elementId }) => ({ trackId, elementId })));
    return new UpdateElementsCommand({
      updates: elements.map((entry) => ({
        trackId: requireId("trackId", entry.trackId),
        elementId: requireId("elementId", entry.elementId),
        // requireId, not a bare pass-through: the patch is spread over the
        // element, so a missing name would set `name: undefined` and erase it.
        patch: { name: requireId("name", entry.name) } as Partial<TimelineElement>,
      })),
    });
  },

  "element.addEffect": (operation) => {
    const { trackId, elementId, effectType } = operation as Extract<
      Operation,
      { type: "element.addEffect" }
    >;
    return new AddClipEffectCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      effectType: requireId("effectType", effectType),
    });
  },

  "element.removeEffect": (operation) => {
    const { trackId, elementId, effectId } = operation as Extract<
      Operation,
      { type: "element.removeEffect" }
    >;
    return new RemoveClipEffectCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      effectId: requireId("effectId", effectId),
    });
  },

  "element.toggleEffect": (operation) => {
    const { trackId, elementId, effectId } = operation as Extract<
      Operation,
      { type: "element.toggleEffect" }
    >;
    return new ToggleClipEffectCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      effectId: requireId("effectId", effectId),
    });
  },

  "element.setEffectParams": (operation) => {
    const { trackId, elementId, effectId, params } = operation as Extract<
      Operation,
      { type: "element.setEffectParams" }
    >;
    if (!params || Object.keys(params).length === 0) {
      throw new InvalidOperationError("element.setEffectParams names no parameter to change");
    }
    return new UpdateClipEffectParamsCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      effectId: requireId("effectId", effectId),
      params,
    });
  },

  "element.reorderEffect": (operation) => {
    const { trackId, elementId, fromIndex, toIndex } = operation as Extract<
      Operation,
      { type: "element.reorderEffect" }
    >;
    for (const [name, value] of [["fromIndex", fromIndex], ["toIndex", toIndex]] as const) {
      if (!Number.isInteger(value) || (value as number) < 0) {
        throw new InvalidOperationError(`${name} must be a non-negative integer; got ${value}`);
      }
    }
    return new ReorderClipEffectsCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      fromIndex: fromIndex as number,
      toIndex: toIndex as number,
    });
  },

  "element.upsertKeyframe": (operation) => {
    const { trackId, elementId, propertyPath, timeSeconds, value, interpolation, keyframeId } =
      operation as Extract<Operation, { type: "element.upsertKeyframe" }>;
    return new UpsertKeyframeCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      propertyPath: requireId("propertyPath", propertyPath),
      // Element-local, and the command clamps it into [0, element.duration].
      time: toMediaTime("timeSeconds", timeSeconds),
      value,
      ...(interpolation ? { interpolation } : {}),
      ...(keyframeId ? { keyframeId } : {}),
    });
  },

  "element.removeKeyframe": (operation) => {
    const { trackId, elementId, propertyPath, keyframeId, valueAtPlayhead } = operation as Extract<
      Operation,
      { type: "element.removeKeyframe" }
    >;
    return new RemoveKeyframeCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      propertyPath: requireId("propertyPath", propertyPath),
      keyframeId: requireId("keyframeId", keyframeId),
      // Required by the constructor even when null — it is what gets written
      // into params once the last keyframe is gone.
      valueAtPlayhead: valueAtPlayhead ?? null,
    });
  },

  "element.retimeKeyframe": (operation) => {
    const { trackId, elementId, propertyPath, keyframeId, timeSeconds } = operation as Extract<
      Operation,
      { type: "element.retimeKeyframe" }
    >;
    return new RetimeKeyframeCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      propertyPath: requireId("propertyPath", propertyPath),
      keyframeId: requireId("keyframeId", keyframeId),
      nextTime: toMediaTime("timeSeconds", timeSeconds),
    });
  },

  "element.setKeyframeCurve": (operation) => {
    const { trackId, elementId, propertyPath, keyframeId, segmentToNext, tangentMode } =
      operation as Extract<Operation, { type: "element.setKeyframeCurve" }>;
    const patch: { segmentToNext?: "step" | "linear" | "bezier"; tangentMode?: "auto" | "aligned" | "broken" | "flat" } = {};
    if (segmentToNext !== undefined) patch.segmentToNext = segmentToNext;
    if (tangentMode !== undefined) patch.tangentMode = tangentMode;
    if (Object.keys(patch).length === 0) {
      throw new InvalidOperationError("element.setKeyframeCurve names no field to change");
    }
    return new UpdateScalarKeyframeCurveCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      propertyPath: requireId("propertyPath", propertyPath),
      // Scalar params have a single component, named "value" by the channel layout.
      componentKey: "value",
      keyframeId: requireId("keyframeId", keyframeId),
      patch,
    });
  },

  "element.upsertEffectKeyframe": (operation) => {
    const { trackId, elementId, effectId, paramKey, timeSeconds, value, interpolation, keyframeId } =
      operation as Extract<Operation, { type: "element.upsertEffectKeyframe" }>;
    return new UpsertEffectParamKeyframeCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      effectId: requireId("effectId", effectId),
      paramKey: requireId("paramKey", paramKey),
      time: toMediaTime("timeSeconds", timeSeconds),
      value,
      ...(interpolation ? { interpolation } : {}),
      ...(keyframeId ? { keyframeId } : {}),
    });
  },

  "element.removeEffectKeyframe": (operation) => {
    const { trackId, elementId, effectId, paramKey, keyframeId } = operation as Extract<
      Operation,
      { type: "element.removeEffectKeyframe" }
    >;
    return new RemoveEffectParamKeyframeCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      effectId: requireId("effectId", effectId),
      paramKey: requireId("paramKey", paramKey),
      keyframeId: requireId("keyframeId", keyframeId),
    });
  },

  "element.toggleSourceAudio": (operation) => {
    const { trackId, elementId } = operation as Extract<
      Operation,
      { type: "element.toggleSourceAudio" }
    >;
    // Positional object, unlike its siblings.
    return new ToggleSourceAudioSeparationCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
    });
  },

  "element.removeMask": (operation) => {
    const { trackId, elementId, maskId } = operation as Extract<
      Operation,
      { type: "element.removeMask" }
    >;
    return new RemoveMaskCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      maskId: requireId("maskId", maskId),
    });
  },

  "element.toggleMaskInverted": (operation) => {
    const { trackId, elementId, maskId } = operation as Extract<
      Operation,
      { type: "element.toggleMaskInverted" }
    >;
    return new ToggleMaskInvertedCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      maskId: requireId("maskId", maskId),
    });
  },

  "element.deleteMaskPoints": (operation) => {
    const { trackId, elementId, maskId, pointIds } = operation as Extract<
      Operation,
      { type: "element.deleteMaskPoints" }
    >;
    if (!Array.isArray(pointIds) || pointIds.length === 0) {
      throw new InvalidOperationError("element.deleteMaskPoints needs at least one pointId");
    }
    return new DeleteFreeformPathMaskPointsCommand({
      trackId: requireId("trackId", trackId),
      elementId: requireId("elementId", elementId),
      maskId: requireId("maskId", maskId),
      pointIds,
    });
  },

  "scene.create": (operation) => {
    const { name } = operation as Extract<Operation, { type: "scene.create" }>;
    return new CreateSceneCommand({ name: requireId("name", name) });
  },

  "scene.delete": (operation) => {
    const { sceneId } = operation as Extract<Operation, { type: "scene.delete" }>;
    // Positional, unlike its siblings.
    return new DeleteSceneCommand(requireId("sceneId", sceneId));
  },

  "bookmark.toggle": (operation) => {
    const { timeSeconds } = operation as Extract<Operation, { type: "bookmark.toggle" }>;
    return new ToggleBookmarkCommand(toMediaTime("timeSeconds", timeSeconds));
  },

  "bookmark.remove": (operation) => {
    const { timeSeconds } = operation as Extract<Operation, { type: "bookmark.remove" }>;
    return new RemoveBookmarkCommand(toMediaTime("timeSeconds", timeSeconds));
  },

  "bookmark.move": (operation) => {
    const { fromSeconds, toSeconds } = operation as Extract<Operation, { type: "bookmark.move" }>;
    return new MoveBookmarkCommand({
      fromTime: toMediaTime("fromSeconds", fromSeconds),
      toTime: toMediaTime("toSeconds", toSeconds),
    });
  },

  "bookmark.update": (operation) => {
    const { timeSeconds, note, color, durationSeconds } = operation as Extract<
      Operation,
      { type: "bookmark.update" }
    >;
    const updates: { note?: string; color?: string; duration?: MediaTime } = {};
    if (note !== undefined) updates.note = note;
    if (color !== undefined) updates.color = color;
    if (durationSeconds !== undefined) {
      updates.duration = toMediaTime("durationSeconds", durationSeconds);
    }
    if (Object.keys(updates).length === 0) {
      throw new InvalidOperationError("bookmark.update names no field to change");
    }
    return new UpdateBookmarkCommand({
      time: toMediaTime("timeSeconds", timeSeconds),
      updates,
    });
  },

  "project.updateSettings": (operation) => {
    const { fps, canvasSize, backgroundColor } = operation as Extract<
      Operation,
      { type: "project.updateSettings" }
    >;
    // Positional, and a Partial — only the named settings change.
    const updates: Record<string, unknown> = {};
    if (fps !== undefined) updates.fps = fps;
    if (canvasSize !== undefined) {
      updates.canvasSize = canvasSize;
      updates.canvasSizeMode = "custom";
      updates.lastCustomCanvasSize = canvasSize;
    }
    if (backgroundColor !== undefined) {
      updates.background = { type: "color", color: backgroundColor };
    }
    if (Object.keys(updates).length === 0) {
      throw new InvalidOperationError("project.updateSettings names no setting to change");
    }
    return new UpdateProjectSettingsCommand(updates as Partial<TProjectSettings>);
  },

  "element.duplicate": (operation) => {
    const { elements } = operation as Extract<Operation, { type: "element.duplicate" }>;
    return new DuplicateElementsCommand({ elements: requireRefs(elements) });
  },
};

export function buildCommand({ operation }: { operation: Operation }): Command {
  const factory = COMMAND_FACTORIES[operation.type];
  if (!factory) throw new UnknownOperationError(operation.type);
  return factory(operation);
}

export function supportedOperationTypes(): OperationType[] {
  return Object.keys(COMMAND_FACTORIES) as OperationType[];
}

export class UnresolvedReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnresolvedReferenceError";
  }
}

/**
 * Every (trackId, elementId) pair an operation depends on.
 *
 * Kept here beside the union so a new element operation cannot be added without
 * this switch failing to compile — the alternative, a lookup that silently
 * returns [] for unknown shapes, would skip validation for exactly the newest
 * and least-tested operation.
 */
export function elementRefsOf(operation: Operation): ElementRefInput[] {
  switch (operation.type) {
    case "element.delete":
    case "element.split":
    case "element.duplicate":
      return operation.elements;
    case "element.trim":
    case "element.rename":
      return operation.elements.map(({ trackId, elementId }) => ({ trackId, elementId }));
    case "element.move":
      return operation.moves.map(({ trackId, elementId }) => ({ trackId, elementId }));
    case "element.addEffect":
    case "element.removeEffect":
    case "element.toggleEffect":
    case "element.setEffectParams":
    case "element.reorderEffect":
    case "element.upsertKeyframe":
    case "element.removeKeyframe":
    case "element.retimeKeyframe":
    case "element.setKeyframeCurve":
    case "element.upsertEffectKeyframe":
    case "element.removeEffectKeyframe":
    case "element.toggleSourceAudio":
    case "element.removeMask":
    case "element.toggleMaskInverted":
    case "element.deleteMaskPoints":
      return [{ trackId: operation.trackId, elementId: operation.elementId }];
    case "scene.create":
    case "scene.delete":
    case "bookmark.toggle":
    case "bookmark.remove":
    case "bookmark.move":
    case "bookmark.update":
    case "project.updateSettings":
    case "element.insert":
    case "track.add":
    case "track.remove":
    case "track.toggleMute":
    case "track.toggleVisibility":
    case "scene.rename":
      return [];
    default: {
      const exhaustive: never = operation;
      void exhaustive;
      return [];
    }
  }
}
