import type { EditorCore } from "@/core";
import {
  buildCommand,
  OperationConflictError,
  ProjectMismatchError,
  InvalidOperationError,
  elementRefsOf,
  supportedOperationTypes,
  UnresolvedReferenceError,
  type Operation,
  type OperationEnvelope,
  type OperationResult,
  type OperationType,
} from "./operations";
import { TICKS_PER_SECOND, toMediaTime, toSeconds } from "./time";

/** How many idempotency keys to remember. Bounded so a long session can't leak. */
const IDEMPOTENCY_HISTORY = 256;

/** Frames are full-canvas PNGs; a large batch would blow the CDP response. */
const MAX_FRAMES_PER_CALL = 8;

export type RenderedFrame =
  | {
      atSeconds: number;
      /** May differ from `atSeconds`: the renderer clamps past the last frame. */
      renderedAtSeconds: number;
      width: number;
      height: number;
      pngBase64: string;
    }
  | { atSeconds: number; error: string };

export interface RenderFramesResult {
  /** The revision these pixels depict. Without it an image proves nothing. */
  revision: number;
  /** False if the document changed mid-batch, i.e. the frames disagree. */
  stable: boolean;
  frames: RenderedFrame[];
}

/** One clip, addressable. Times are seconds — see ./time.ts. */
export interface ElementSummary {
  id: string;
  type: string;
  name: string;
  startTimeSeconds: number | null;
  durationSeconds: number | null;
  endTimeSeconds: number | null;
  trimStartSeconds: number | null;
  trimEndSeconds: number | null;
  mediaId?: string;
  hidden?: boolean;
  /** Only for effect elements. */
  effectType?: string;
  /** Built-in element params, e.g. text content. */
  params?: Record<string, unknown>;
  /**
   * Effects attached to this clip, in render order. The `id` here is what
   * element.removeEffect / toggleEffect / setEffectParams address — without it
   * an agent can add an effect and then never touch it again.
   */
  effects?: Array<{ id: string; type: string; enabled: boolean; params: Record<string, unknown> }>;
  /**
   * Keyframes per animated property, times in seconds from the CLIP's start.
   * Without these an agent can create a keyframe and never address it again.
   */
  animations?: Record<
    string,
    Array<{ id: string; timeSeconds: number | null; value: unknown; interpolation: string }>
  >;
}

export interface TrackSummary {
  id: string;
  type: string;
  name?: string;
  muted?: boolean;
  hidden?: boolean;
  elementCount: number;
  elements: ElementSummary[];
}

export interface ProjectStateSummary {
  revision: number;
  projectId: string | null;
  projectName: string | null;
  sceneId: string | null;
  sceneName: string | null;
  /**
   * Frame rate as the editor stores it — a rational, because the broadcast rates
   * are not integers (29.97 is exactly 30000/1001). `decimal` is a convenience
   * for display; `numerator/denominator` is the truth.
   */
  fps: { numerator: number; denominator: number; decimal: number } | null;
  /** Every scene, so scene.delete has something real to address. */
  scenes: Array<{ id: string; name: string; isMain: boolean; isActive: boolean }>;
  /** Bookmarks on the active scene. Addressed by TIME, not by id. */
  bookmarks: Array<{ timeSeconds: number | null; note?: string; color?: string; durationSeconds?: number | null }>;
  settings: { canvasSize: unknown; background: unknown };
  tracks: TrackSummary[];
  /**
   * The file revision this editor last read or wrote, when the document is
   * file-backed. A caller comparing it against the file's current revision can
   * tell whether the editor has caught up — exporting before it has produces a
   * video of the previous cut, with no error anywhere.
   */
  loadedFileRevision: number | null;
  /** Importable media, so `element.insert` can name a real source. */
  media: Array<{ id: string; name: string; type: string; durationSeconds: number | null }>;
}

function describeFrameRate(
  fps: { numerator: number; denominator: number } | undefined,
): ProjectStateSummary["fps"] {
  if (!fps || typeof fps.numerator !== "number" || !fps.denominator) return null;
  return {
    numerator: fps.numerator,
    denominator: fps.denominator,
    decimal: fps.numerator / fps.denominator,
  };
}

/**
 * The agent-facing edit gate.
 *
 * Everything an external caller does goes through `applyOperation`, which adds
 * the three guarantees the editor's own CommandManager does not provide:
 *
 *   1. **Revision** — a monotonic counter so a caller can name the state it read.
 *   2. **Optimistic concurrency** — an operation built against a stale revision is
 *      rejected instead of silently clobbering whatever the human just did.
 *   3. **Idempotency** — a retried call (dropped response, reconnect) is applied
 *      exactly once.
 *
 * The mutation itself is delegated to the SAME Command objects the UI uses, so
 * agent edits are undoable, ripple-aware, and indistinguishable from human ones.
 */
export class AgentManager {
  private revisionValue = 0;
  private appliedKeys: string[] = [];
  private appliedKeySet = new Set<string>();

  constructor(private editor: EditorCore) {}

  get revision(): number {
    return this.revisionValue;
  }

  /**
   * Called when the tab switches to a different document (load/close).
   *
   * The counter ADVANCES rather than resetting. Resetting to 0 made revisions
   * ambiguous across documents: every project load started at 0, so a caller
   * still holding revision 0 from project A would pass the CAS check against
   * project B and edit the wrong document. Advancing means any revision held
   * across a switch is stale, which is exactly the truth.
   *
   * Idempotency keys are cleared: they are scoped to a document, and an edit
   * already applied to A has certainly not been applied to B.
   */
  onDocumentSwitched(): void {
    this.revisionValue += 1;
    this.appliedKeys = [];
    this.appliedKeySet.clear();
  }

  supportedOperations(): OperationType[] {
    return supportedOperationTypes();
  }

  applyOperation({
    operation,
    baseRevision,
    idempotencyKey,
    expectedProjectId,
  }: OperationEnvelope): OperationResult {
    // Checked before dedupe: if the caller is aimed at a different document,
    // even "you already did this" is the wrong answer.
    if (expectedProjectId !== undefined) {
      const actual = this.editor.project.getActiveOrNull()?.metadata?.id ?? null;
      if (actual !== expectedProjectId) {
        throw new ProjectMismatchError(expectedProjectId, actual);
      }
    }
    if (this.appliedKeySet.has(idempotencyKey)) {
      return {
        applied: false,
        revision: this.revisionValue,
        deduplicated: true,
        noEffect: false,
      };
    }
    if (baseRevision !== this.revisionValue) {
      throw new OperationConflictError(baseRevision, this.revisionValue);
    }

    // Resolve references against the live document first. The element commands
    // filter on (trackId, elementId) and silently skip anything that does not
    // match, so a stale or mispaired ref would surface only as `noEffect: true`
    // — truthful, but it tells the caller nothing about WHY. Checking here turns
    // that into "element X is on track Z, not track Y".
    this.validateReferences(operation);
    this.validateTiming(operation);
    operation = this.withSourceDuration(operation);

    // Executing a command is not proof that anything changed. The editor runs
    // reactors after every execute() — notably one that prunes element-less
    // tracks (core/index.ts) — so a command can be fully undone by the editor
    // itself the instant it lands. Reporting `applied: true` in that case would
    // make the agent believe in an edit that does not exist, which is the one
    // failure mode this layer exists to prevent. So: verify, don't assume.
    const before = this.documentFingerprint();
    // null (not "") so that "the callback never ran" is distinguishable from
    // "the document is empty". If CommandManager ever returns before calling it,
    // this must not silently read as a no-op — or as a bogus success.
    let after: string | null = null;
    const command = buildCommand({ operation });
    // Passing the check to execute() rather than testing afterwards is what lets
    // the command manager keep a no-op out of the undo history entirely; doing it
    // here would leave a phantom entry that also wiped the redo stack.
    this.editor.command.execute({
      command,
      verifyEffect: () => {
        after = this.documentFingerprint();
        return after !== before;
      },
    });

    if (after !== null && before === after) {
      // No revision bump and no idempotency record: nothing happened, so a
      // later retry under different conditions must still be allowed.
      return {
        applied: false,
        revision: this.revisionValue,
        deduplicated: false,
        noEffect: true,
      };
    }

    this.revisionValue += 1;
    this.rememberKey(idempotencyKey);
    return {
      applied: true,
      revision: this.revisionValue,
      deduplicated: false,
      noEffect: false,
    };
  }

  /**
   * Structural signature of the WHOLE document, used to tell a real edit from a
   * command the editor immediately neutralised.
   *
   * This must cover everything any command can reach, not just the part the
   * current vocabulary usually touches, because the two failure directions are
   * not symmetric:
   *
   *   - Missing a real change is severe. `execute()` skips the history entry when
   *     this reports "unchanged", so a mutation the fingerprint cannot see is
   *     applied, autosaved, and left permanently un-undoable — while the caller
   *     is told it never happened. `RenameSceneCommand` accepts any sceneId, so
   *     an active-scene-only fingerprint did exactly this to a non-active scene.
   *   - Seeing a spurious change is benign: one extra undo entry.
   *
   * So: serialise the entire project and fail toward "changed". `updatedAt` is
   * the one deliberate exclusion — `setScenes`/`updateSceneTracks` stamp it on
   * every mutation including neutralised ones, so keeping it would make every
   * command look like an edit and defeat the check entirely. A diff of only
   * `updatedAt` is by definition not a semantic edit.
   *
   * O(document) per call, and only on the agent path — `execute()` skips it
   * entirely when no `verifyEffect` is passed, so interactive editing is
   * unaffected.
   */
  private documentFingerprint(): string {
    const project = this.editor.project.getActiveOrNull();
    if (!project) return "";
    try {
      return JSON.stringify(project, (key, value) =>
        key === "updatedAt" ? undefined : value,
      );
    } catch {
      // Cyclic/exotic values: fall back to "always different" so we never
      // silently claim a real edit was a no-op.
      return `unserialisable:${Math.random()}`;
    }
  }

  /**
   * Undo/redo also move the revision forward: the document changed, so any
   * operation a caller built against the previous number is now stale.
   *
   * An empty stack is a no-op in CommandManager, so the revision must not move
   * either — bumping it there would invalidate every operation a caller is
   * holding and report a change that never happened.
   */
  undo(): number {
    if (!this.editor.command.canUndo()) return this.revisionValue;
    this.editor.command.undo();
    this.revisionValue += 1;
    return this.revisionValue;
  }

  redo(): number {
    if (!this.editor.command.canRedo()) return this.revisionValue;
    this.editor.command.redo();
    this.revisionValue += 1;
    return this.revisionValue;
  }

  /** What a caller reads before composing an operation. */
  getState(): ProjectStateSummary {
    const project = this.editor.project.getActiveOrNull();
    const scene = this.editor.scenes.getActiveSceneOrNull();
    const tracks = scene?.tracks;

    // SceneTracks is { overlay: OverlayTrack[], main: VideoTrack, audio: AudioTrack[] }
    // — `main` is a single track, not a list, so it cannot be iterated generically.
    const flattened: TrackSummary[] = [];
    const describe = (track: {
      id: string;
      type?: string;
      name?: string;
      muted?: boolean;
      hidden?: boolean;
      elements?: unknown[];
    }, fallbackType: string) => {
      const elements = Array.isArray(track.elements) ? track.elements : [];
      flattened.push({
        id: track.id,
        type: track.type ?? fallbackType,
        name: track.name,
        muted: track.muted,
        hidden: track.hidden,
        elementCount: elements.length,
        // Element ids are the whole point: without them a caller can see that a
        // track holds N clips but cannot name one, so every element-level
        // operation is unreachable.
        elements: elements.map((raw) => this.describeElement(raw)),
      });
    };
    if (tracks) {
      describe(tracks.main, "main");
      for (const track of tracks.overlay) describe(track, "overlay");
      for (const track of tracks.audio) describe(track, "audio");
    }

    return {
      revision: this.revisionValue,
      projectId: project?.metadata?.id ?? null,
      projectName: project?.metadata?.name ?? null,
      sceneId: scene?.id ?? null,
      sceneName: scene?.name ?? null,
      fps: describeFrameRate(project?.settings?.fps),
      scenes: (project?.scenes ?? []).map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        isMain: Boolean(candidate.isMain),
        isActive: candidate.id === scene?.id,
      })),
      bookmarks: (scene?.bookmarks ?? []).map((bookmark) => ({
        timeSeconds: toSeconds(bookmark.time),
        ...(bookmark.note !== undefined ? { note: bookmark.note } : {}),
        ...(bookmark.color !== undefined ? { color: bookmark.color } : {}),
        ...(bookmark.duration !== undefined
          ? { durationSeconds: toSeconds(bookmark.duration) }
          : {}),
      })),
      settings: {
        canvasSize: project?.settings?.canvasSize ?? null,
        background: project?.settings?.background ?? null,
      },
      loadedFileRevision: project?.metadata?.id
        ? this.editor.project.getKnownFileRevision(project.metadata.id)
        : null,
      tracks: flattened,
      media: this.describeMedia(),
    };
  }

  /**
   * Render frames so a caller can check what an edit actually produced.
   *
   * Each frame is stamped with the revision it was drawn at, and `stable` says
   * whether the document held still for the whole batch. That matters more than
   * it might seem: rendering is async, the human can edit during the await, and
   * an unstamped image is not evidence of anything — it is a picture of an
   * unknown document state. A caller comparing against an expected result must
   * check `revision` matches the edit it is verifying.
   *
   * The pixels come from the same `buildScene` + `CanvasRenderer` path the
   * exporter uses, so this is what the export would produce, not an approximation.
   */
  async renderFrames({ atSeconds }: { atSeconds: number[] }): Promise<RenderFramesResult> {
    if (!Array.isArray(atSeconds) || atSeconds.length === 0) {
      throw new InvalidOperationError("renderFrames needs at least one time in seconds");
    }
    if (atSeconds.length > MAX_FRAMES_PER_CALL) {
      throw new InvalidOperationError(
        `renderFrames accepts at most ${MAX_FRAMES_PER_CALL} times per call; got ${atSeconds.length}`,
      );
    }

    const revisionBefore = this.revisionValue;
    const frames: RenderedFrame[] = [];
    for (const seconds of atSeconds) {
      const time = toMediaTime("atSeconds", seconds);
      const result = await this.editor.renderer.renderFrame({ time });
      if (!result.success) {
        frames.push({ atSeconds: seconds, error: result.error });
        continue;
      }
      frames.push({
        atSeconds: seconds,
        // Reported separately because the renderer clamps past the last frame —
        // silently returning a different moment than asked for would make a
        // pixel comparison meaningless.
        renderedAtSeconds: toSeconds(result.time) ?? seconds,
        width: result.width,
        height: result.height,
        pngBase64: result.dataUrl.replace(/^data:image\/png;base64,/, ""),
      });
    }

    return {
      revision: this.revisionValue,
      stable: this.revisionValue === revisionBefore,
      frames,
    };
  }

  /**
   * Refuse a trim that would run past the end of the underlying media.
   *
   * The four timing fields are a coupled set: the UI's own trim always emits all
   * of them from a single snapped delta, and clamps that delta so the clip can
   * never claim more footage than exists. Exposing them as independent knobs
   * loses that, and nothing downstream restores it — a lone `durationSeconds`
   * of 3600 on a five-second clip is accepted and stored. Elements with no
   * known source extent (text, graphics) are unbounded and skipped.
   */
  private validateTiming(operation: Operation): void {
    if (operation.type !== "element.trim") return;
    const byId = new Map<string, Record<string, unknown>>();
    const tracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
    if (tracks) {
      for (const track of [tracks.main, ...tracks.overlay, ...tracks.audio]) {
        for (const element of track?.elements ?? []) {
          byId.set(element.id, element as unknown as Record<string, unknown>);
        }
      }
    }

    for (const entry of operation.elements) {
      const element = byId.get(entry.elementId);
      const sourceDuration = toSeconds(element?.sourceDuration as number | undefined);
      if (sourceDuration === null || !(sourceDuration > 0)) continue;

      const trimStart = entry.trimStartSeconds ?? toSeconds(element?.trimStart as number) ?? 0;
      const trimEnd = entry.trimEndSeconds ?? toSeconds(element?.trimEnd as number) ?? 0;
      const duration = entry.durationSeconds ?? toSeconds(element?.duration as number) ?? 0;
      const used = trimStart + duration + trimEnd;
      // Tolerance of one tick: the fields round independently.
      if (used > sourceDuration + 1 / TICKS_PER_SECOND) {
        throw new InvalidOperationError(
          `element ${entry.elementId}: trimStart ${trimStart}s + duration ${duration}s + trimEnd ${trimEnd}s = ${used}s exceeds the source media length of ${sourceDuration}s.`,
        );
      }
    }
  }

  /**
   * Fill in a new clip's `sourceDuration` from the media library.
   *
   * The UI's own insert path always sets it, and the resize controller uses it
   * to stop a drag at the end of the real footage — `computeResize` skips that
   * clamp entirely when it is null. So a clip inserted without it is not just an
   * agent-side gap: the human can afterwards drag its edge past the end of the
   * media. Filling it here keeps agent-created clips indistinguishable from
   * hand-created ones.
   */
  private withSourceDuration(operation: Operation): Operation {
    if (operation.type !== "element.insert") return operation;
    const { element } = operation;
    if (element.sourceDurationSeconds !== undefined || !element.mediaId) return operation;
    const asset = this.describeMedia().find((m) => m.id === element.mediaId);
    if (!asset || asset.durationSeconds === null || !(asset.durationSeconds > 0)) return operation;
    return {
      ...operation,
      element: { ...element, sourceDurationSeconds: asset.durationSeconds },
    };
  }

  /**
   * Check every (trackId, elementId) pair in an operation against the live
   * document, and say precisely what is wrong when one does not resolve.
   */
  private validateReferences(operation: Operation): void {
    const refs = elementRefsOf(operation);
    if (refs.length === 0 && operation.type !== "element.move") return;

    const trackOfElement = new Map<string, string>();
    const trackIds = new Set<string>();
    const scene = this.editor.scenes.getActiveSceneOrNull();
    const tracks = scene?.tracks;
    if (tracks) {
      const all = [tracks.main, ...tracks.overlay, ...tracks.audio];
      for (const track of all) {
        if (!track) continue;
        trackIds.add(track.id);
        for (const element of track.elements ?? []) trackOfElement.set(element.id, track.id);
      }
    }

    if (operation.type === "element.move") {
      for (const move of operation.moves) {
        if (move.targetTrackId !== undefined && !trackIds.has(move.targetTrackId)) {
          throw new UnresolvedReferenceError(
            `No track ${move.targetTrackId} to move onto in the active scene.`,
          );
        }
      }
    }

    for (const ref of refs) {
      const actualTrack = trackOfElement.get(ref.elementId);
      if (actualTrack === undefined) {
        throw new UnresolvedReferenceError(
          `No element ${ref.elementId} in the active scene. Re-read get_state — ids change when a clip is split or replaced.`,
        );
      }
      if (actualTrack !== ref.trackId) {
        throw new UnresolvedReferenceError(
          `Element ${ref.elementId} is on track ${actualTrack}, not ${ref.trackId}.` +
            (trackIds.has(ref.trackId) ? "" : ` Track ${ref.trackId} does not exist.`),
        );
      }
    }
  }

  private describeElement(raw: unknown): ElementSummary {
    const element = (raw ?? {}) as Record<string, unknown>;
    const start = toSeconds(element.startTime as number | undefined);
    const duration = toSeconds(element.duration as number | undefined);
    return {
      id: String(element.id ?? ""),
      type: String(element.type ?? "unknown"),
      name: String(element.name ?? ""),
      startTimeSeconds: start,
      durationSeconds: duration,
      // `duration` is the visible span on the timeline, not the source length,
      // so end is start + duration. Reported because "where does this clip end"
      // is the question every trim and split actually asks.
      endTimeSeconds: start !== null && duration !== null ? start + duration : null,
      trimStartSeconds: toSeconds(element.trimStart as number | undefined),
      trimEndSeconds: toSeconds(element.trimEnd as number | undefined),
      ...(typeof element.mediaId === "string" ? { mediaId: element.mediaId } : {}),
      ...(typeof element.hidden === "boolean" ? { hidden: element.hidden } : {}),
      ...(typeof element.effectType === "string" ? { effectType: element.effectType } : {}),
      ...(element.params && typeof element.params === "object"
        ? { params: element.params as Record<string, unknown> }
        : {}),
      ...(element.animations && typeof element.animations === "object"
        ? {
            animations: Object.fromEntries(
              Object.entries(element.animations as Record<string, { keys?: Array<Record<string, unknown>> }>)
                .filter(([, channel]) => Array.isArray(channel?.keys) && channel.keys.length > 0)
                .map(([path, channel]) => [
                  path,
                  (channel.keys ?? []).map((key) => ({
                    id: String(key.id ?? ""),
                    timeSeconds: toSeconds(key.time as number | undefined),
                    value: key.value,
                    interpolation: String(key.segmentToNext ?? "linear"),
                  })),
                ]),
            ),
          }
        : {}),
      ...(Array.isArray(element.effects) && element.effects.length > 0
        ? {
            effects: (element.effects as Array<Record<string, unknown>>).map((effect) => ({
              id: String(effect.id ?? ""),
              type: String(effect.type ?? ""),
              enabled: effect.enabled !== false,
              params: (effect.params ?? {}) as Record<string, unknown>,
            })),
          }
        : {}),
    };
  }

  private describeMedia(): ProjectStateSummary["media"] {
    // Media lives on its own manager, and its shape is not part of this layer's
    // contract, so read defensively rather than assuming.
    const manager = this.editor.media as unknown as {
      getAssets?: () => Array<Record<string, unknown>>;
    };
    const assets = typeof manager?.getAssets === "function" ? manager.getAssets() : [];
    if (!Array.isArray(assets)) return [];
    return assets.map((asset) => ({
      id: String(asset.id ?? ""),
      name: String(asset.name ?? ""),
      type: String(asset.type ?? asset.mediaType ?? "unknown"),
      // NOT toSeconds(): a MediaAsset's duration is already in seconds — it comes
      // straight from mediabunny's computeDuration() and every other consumer
      // feeds it to mediaTimeFromSeconds. Only timeline ELEMENTS store ticks.
      durationSeconds:
        typeof asset.duration === "number" && Number.isFinite(asset.duration)
          ? asset.duration
          : null,
    }));
  }

  private rememberKey(key: string): void {
    this.appliedKeys.push(key);
    this.appliedKeySet.add(key);
    while (this.appliedKeys.length > IDEMPOTENCY_HISTORY) {
      const evicted = this.appliedKeys.shift();
      if (evicted !== undefined) this.appliedKeySet.delete(evicted);
    }
  }
}

export type { Operation, OperationEnvelope, OperationResult };
