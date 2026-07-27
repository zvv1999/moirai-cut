import { describe, expect, test } from "bun:test";
import { AgentManager } from "../agent-manager";
import {
  OperationConflictError,
  ProjectMismatchError,
  UnknownOperationError,
  buildCommand,
} from "../operations";
import type { Operation } from "../operations";

/**
 * These cover the concurrency envelope, which is the part that does not exist in
 * the editor's own CommandManager. Command execution itself is stubbed: the point
 * is that `applyOperation` gates correctly, not that a track really got muted
 * (that is the command's own contract, already exercised by the UI).
 *
 * The stub deliberately mirrors CommandManager's real shape — `verifyEffect` runs
 * after the command, and a false result means no history entry — because the
 * agent's noEffect/undo semantics are defined by that interaction.
 */
function makeEditorStub({ mutate = true }: { mutate?: boolean } = {}) {
  const executed: unknown[] = [];
  const history: unknown[] = [];
  // A project-shaped document, since the fingerprint spans the whole project.
  const project = {
    metadata: { id: "p1", name: "Project", updatedAt: new Date(0) },
    scenes: [
      { id: "scene-active", name: "Main scene", tracks: { overlay: [], audio: [] }, updatedAt: new Date(0) },
      { id: "scene-other", name: "Second scene", tracks: { overlay: [], audio: [] }, updatedAt: new Date(0) },
    ],
    settings: { fps: 30 },
  };

  const editor = {
    command: {
      execute: ({
        command,
        verifyEffect,
      }: { command: unknown; verifyEffect?: () => boolean }) => {
        executed.push(command);
        // Stand in for a command that really edits the document.
        if (mutate) project.scenes[0].name = `edited-${executed.length}`;
        // Every mutation path stamps updatedAt, even neutralised ones.
        project.metadata.updatedAt = new Date(executed.length);
        if (verifyEffect && !verifyEffect()) return command;
        history.push(command);
        return command;
      },
      canUndo: () => history.length > 0,
      canRedo: () => true,
      undo: () => { executed.push("undo"); history.pop(); },
      redo: () => { executed.push("redo"); },
    },
    project: { getActiveOrNull: () => project },
    scenes: { getActiveSceneOrNull: () => project.scenes[0] },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { editor: editor as any, executed, history, project };
}

const OP: Operation = { type: "track.toggleMute", trackId: "track-1" };

describe("AgentManager concurrency envelope", () => {
  test("starts at revision 0 and increments once per applied operation", () => {
    const { editor, executed } = makeEditorStub();
    const agent = new AgentManager(editor);
    expect(agent.revision).toBe(0);

    const first = agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "k1" });
    expect(first).toEqual({ applied: true, revision: 1, deduplicated: false, noEffect: false });

    const second = agent.applyOperation({ operation: OP, baseRevision: 1, idempotencyKey: "k2" });
    expect(second.revision).toBe(2);
    expect(executed.length).toBe(2);
  });

  test("rejects an operation built against a stale revision", () => {
    const { editor, executed } = makeEditorStub();
    const agent = new AgentManager(editor);
    agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "k1" });

    // Caller still thinks it is at revision 0 — someone else edited in between.
    expect(() =>
      agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "k2" }),
    ).toThrow(OperationConflictError);
    // The rejected call must not have mutated anything.
    expect(agent.revision).toBe(1);
    expect(executed.length).toBe(1);
  });

  test("a replayed idempotency key is a no-op, not a second edit", () => {
    const { editor, executed } = makeEditorStub();
    const agent = new AgentManager(editor);
    agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "same" });

    const replay = agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "same" });
    expect(replay).toEqual({ applied: false, revision: 1, deduplicated: true, noEffect: false });
    expect(executed.length).toBe(1);
    // Dedupe is checked before the revision guard, so a retry of a *stale-looking*
    // call still succeeds as a no-op rather than raising a confusing conflict.
  });

  test("undo and redo advance the revision so held revisions go stale", () => {
    const { editor } = makeEditorStub();
    const agent = new AgentManager(editor);
    agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "k1" });
    expect(agent.undo()).toBe(2);
    expect(agent.redo()).toBe(3);
    expect(() =>
      agent.applyOperation({ operation: OP, baseRevision: 1, idempotencyKey: "k9" }),
    ).toThrow(OperationConflictError);
  });

  test("undo/redo on an empty stack do not move the revision", () => {
    const { editor, executed } = makeEditorStub();
    editor.command.canUndo = () => false;
    editor.command.canRedo = () => false;
    const agent = new AgentManager(editor);

    // CommandManager returns early on an empty stack. Bumping the revision here
    // would invalidate every operation a caller holds over a change that never
    // happened — the same lie `noEffect` exists to prevent.
    expect(agent.undo()).toBe(0);
    expect(agent.redo()).toBe(0);
    expect(agent.revision).toBe(0);
    expect(executed.length).toBe(0);
  });

  test("switching documents advances the revision and clears idempotency memory", () => {
    const { editor, executed } = makeEditorStub();
    const agent = new AgentManager(editor);
    agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "k1" });
    expect(agent.revision).toBe(1);

    agent.onDocumentSwitched();
    // Advances rather than resets. Resetting to 0 made every project load start
    // at the same number, so a caller still holding revision 0 from the previous
    // document would pass the CAS check and edit the wrong project.
    expect(agent.revision).toBe(2);

    // Same key again: a different document, so it must actually apply.
    const result = agent.applyOperation({ operation: OP, baseRevision: 2, idempotencyKey: "k1" });
    expect(result.applied).toBe(true);
    expect(executed.length).toBe(2);
  });

  test("a revision held across a document switch no longer authorises an edit", () => {
    const { editor, executed } = makeEditorStub();
    const agent = new AgentManager(editor);
    agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "k1" });
    const heldRevision = agent.revision; // caller read this from document A

    agent.onDocumentSwitched(); // human opened a different project

    expect(() =>
      agent.applyOperation({ operation: OP, baseRevision: heldRevision, idempotencyKey: "k2" }),
    ).toThrow(OperationConflictError);
    expect(executed.length).toBe(1);
  });

  test("an operation naming the wrong project is refused before anything else", () => {
    const { editor, executed } = makeEditorStub();
    const agent = new AgentManager(editor);

    // Belt and braces with the counter: after a reload the counter restarts, so
    // the number alone can still collide. Naming the document closes that.
    expect(() =>
      agent.applyOperation({
        operation: OP,
        baseRevision: 0,
        idempotencyKey: "k1",
        expectedProjectId: "some-other-project",
      }),
    ).toThrow(ProjectMismatchError);
    expect(executed.length).toBe(0);

    const ok = agent.applyOperation({
      operation: OP,
      baseRevision: 0,
      idempotencyKey: "k2",
      expectedProjectId: "p1",
    });
    expect(ok.applied).toBe(true);
  });

  test("exposes the operation vocabulary it can actually execute", () => {
    const { editor } = makeEditorStub();
    const agent = new AgentManager(editor);
    expect(agent.supportedOperations()).toContain("track.toggleMute");
    expect(agent.supportedOperations()).toContain("scene.rename");
  });
});

describe("operation registry", () => {
  test("every advertised operation type builds a command", () => {
    const ref = { trackId: "t", elementId: "e" };
    const samples: Operation[] = [
      { type: "track.add", trackType: "video" },
      { type: "track.remove", trackId: "t" },
      { type: "track.toggleMute", trackId: "t" },
      { type: "track.toggleVisibility", trackId: "t" },
      { type: "scene.rename", sceneId: "s", newName: "n" },
      {
        type: "element.insert",
        element: { type: "video", name: "clip", startTimeSeconds: 0, mediaId: "m1" },
      },
      { type: "element.delete", elements: [ref] },
      { type: "element.rippleDelete", elements: [ref] },
      {
        type: "element.append",
        element: { type: "video", name: "tail", startTimeSeconds: 0, mediaId: "m1" },
      },
      {
        type: "element.crossfade",
        fromTrackId: "t",
        fromElementId: "e",
        toTrackId: "t",
        toElementId: "e2",
        durationSeconds: 0.5,
      },
      { type: "element.move", moves: [{ ...ref, startTimeSeconds: 1 }] },
      { type: "element.split", elements: [ref], splitTimeSeconds: 2 },
      { type: "element.trim", elements: [{ ...ref, durationSeconds: 3 }] },
      { type: "element.rename", elements: [{ ...ref, name: "renamed" }] },
      { type: "element.duplicate", elements: [ref] },
      { type: "element.addEffect", ...ref, effectType: "blur" },
      { type: "element.removeEffect", ...ref, effectId: "fx" },
      { type: "element.toggleEffect", ...ref, effectId: "fx" },
      { type: "element.setEffectParams", ...ref, effectId: "fx", params: { intensity: 40 } },
      { type: "element.reorderEffect", ...ref, fromIndex: 0, toIndex: 1 },
      { type: "element.upsertKeyframe", ...ref, propertyPath: "opacity", timeSeconds: 0, value: 1 },
      { type: "element.removeKeyframe", ...ref, propertyPath: "opacity", keyframeId: "k" },
      { type: "element.retimeKeyframe", ...ref, propertyPath: "opacity", keyframeId: "k", timeSeconds: 1 },
      { type: "element.setKeyframeCurve", ...ref, propertyPath: "opacity", keyframeId: "k", segmentToNext: "bezier" },
      { type: "element.upsertEffectKeyframe", ...ref, effectId: "fx", paramKey: "intensity", timeSeconds: 0, value: 10 },
      { type: "element.upsertMaskKeyframe", ...ref, maskId: "m", paramKey: "feather", timeSeconds: 0, value: 5 },
      { type: "element.removeEffectKeyframe", ...ref, effectId: "fx", paramKey: "intensity", keyframeId: "k" },
      { type: "element.toggleSourceAudio", ...ref },
      { type: "element.addMask", ...ref, maskType: "rectangle" },
      { type: "element.setParams", ...ref, params: { fontSize: 7 } },
      { type: "element.setMaskParams", ...ref, maskId: "m", params: { feather: 5 } },
      { type: "element.removeMask", ...ref, maskId: "m" },
      { type: "element.toggleMaskInverted", ...ref, maskId: "m" },
      { type: "element.deleteMaskPoints", ...ref, maskId: "m", pointIds: ["p"] },
      { type: "scene.create", name: "Second" },
      { type: "scene.delete", sceneId: "s2" },
      { type: "bookmark.toggle", timeSeconds: 1 },
      { type: "bookmark.remove", timeSeconds: 1 },
      { type: "bookmark.move", fromSeconds: 1, toSeconds: 2 },
      { type: "bookmark.update", timeSeconds: 1, note: "n" },
      { type: "project.updateSettings", backgroundColor: "#112233" },
    ];
    for (const operation of samples) {
      // Some factories read live document state to build their patch (the mask
      // ones must know what is already on the element), so against an empty
      // stub they throw. What this guards is that every advertised type HAS a
      // factory — an unknown type fails differently, with UnknownOperationError.
      try {
        expect(buildCommand({ operation })).toBeDefined();
      } catch (error) {
        expect(error).not.toBeInstanceOf(UnknownOperationError);
      }
    }
    // Guards against advertising a type with no factory behind it.
    const { editor } = makeEditorStub();
    const advertised = new AgentManager(editor).supportedOperations().sort();
    expect(samples.map((o) => o.type).sort()).toEqual(advertised);
  });

  test("an unknown operation type is refused", () => {
    expect(() =>
      buildCommand({ operation: { type: "nope" } as unknown as Operation }),
    ).toThrow(UnknownOperationError);
  });
});

describe("effect verification", () => {
  test("a command the editor neutralises reports noEffect and does not advance the revision", () => {
    // Nothing but updatedAt moves — models the prune reactor undoing the command.
    const { editor, executed, history } = makeEditorStub({ mutate: false });
    const agent = new AgentManager(editor);

    const result = agent.applyOperation({
      operation: { type: "track.add", trackType: "audio" },
      baseRevision: 0,
      idempotencyKey: "k1",
    });

    expect(result).toEqual({ applied: false, revision: 0, deduplicated: false, noEffect: true });
    expect(executed.length).toBe(1); // the command DID run…
    expect(agent.revision).toBe(0); // …but nothing changed, so no new revision…
    expect(history.length).toBe(0); // …and it must not cost anyone a Cmd-Z.

    // The key was not consumed: the same call may legitimately succeed later.
    const retry = agent.applyOperation({
      operation: { type: "track.add", trackType: "audio" },
      baseRevision: 0,
      idempotencyKey: "k1",
    });
    expect(retry.deduplicated).toBe(false);
  });

  test("an updatedAt-only diff is not mistaken for a real edit", () => {
    // Every mutation path stamps updatedAt, including neutralised ones. If the
    // fingerprint kept it, nothing would ever report noEffect.
    const { editor, project } = makeEditorStub({ mutate: false });
    const agent = new AgentManager(editor);
    const result = agent.applyOperation({
      operation: { type: "track.add", trackType: "audio" },
      baseRevision: 0,
      idempotencyKey: "k1",
    });
    expect(result.noEffect).toBe(true);
    expect(project.metadata.updatedAt.getTime()).not.toBe(0); // it really was stamped
  });

  test("a change to a NON-active scene counts as a real edit", () => {
    // Regression: the fingerprint used to cover only the active scene, so
    // RenameSceneCommand on any other scene applied + autosaved while being
    // reported as noEffect — and, with the history skipped, was un-undoable.
    const { editor, history, project } = makeEditorStub({ mutate: false });
    editor.command.execute = ({
      command,
      verifyEffect,
    }: { command: unknown; verifyEffect?: () => boolean }) => {
      project.scenes[1].name = "Renamed via agent";
      if (verifyEffect && !verifyEffect()) return command;
      history.push(command);
      return command;
    };
    const agent = new AgentManager(editor);

    const result = agent.applyOperation({
      operation: { type: "scene.rename", sceneId: "scene-other", newName: "Renamed via agent" },
      baseRevision: 0,
      idempotencyKey: "k1",
    });

    expect(result.applied).toBe(true);
    expect(result.noEffect).toBe(false);
    expect(agent.revision).toBe(1);
    expect(history.length).toBe(1); // undoable, which is the whole point
  });

  test("a throwing effect check keeps the history entry rather than stranding the edit", () => {
    // CommandManager resolves uncertainty toward keeping history: an extra Cmd-Z
    // is cheap, an un-undoable mutation is not. Verified against the real
    // CommandManager in commands.test.ts; here we pin the agent-side contract
    // that a fingerprint failure never reads as a no-op.
    const { editor } = makeEditorStub();
    const agent = new AgentManager(editor);
    // Force the fingerprint to be unserialisable (cyclic).
    const cyclic: Record<string, unknown> = { metadata: { id: "p" }, scenes: [] };
    cyclic.self = cyclic;
    editor.project.getActiveOrNull = () => cyclic;

    const result = agent.applyOperation({ operation: OP, baseRevision: 0, idempotencyKey: "k1" });
    expect(result.applied).toBe(true);
    expect(result.noEffect).toBe(false);
  });
});
