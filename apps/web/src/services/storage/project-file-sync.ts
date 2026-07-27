import { EditorCore } from "@/core";
import { projectStoreMode } from "./service";

/**
 * Keeps the open editor in step with the project file on disk.
 *
 * Once the document is a file, the editor is no longer its only writer — an
 * agent, another window, or a `git checkout` can change it. Two things then go
 * wrong without this: the editor never shows the change, and its next autosave
 * silently overwrites it. The compare-and-swap in the projects route turns the
 * second into a loud conflict; this turns the first into a reload.
 *
 * The rule is deliberately conservative: reload only when the editor has nothing
 * unsaved. Reloading over unsaved work would trade the agent's lost edit for the
 * human's, which is not an improvement.
 */

export interface ProjectFileSyncState {
  externalRevision: number | null;
  /** True when disk moved ahead but local changes block an automatic reload. */
  blockedByUnsavedChanges: boolean;
}

const listeners = new Set<(state: ProjectFileSyncState) => void>();
let state: ProjectFileSyncState = {
  externalRevision: null,
  blockedByUnsavedChanges: false,
};

function publish(next: Partial<ProjectFileSyncState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

export function subscribeToProjectFileSync(
  listener: (state: ProjectFileSyncState) => void,
): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getProjectFileSyncState(): ProjectFileSyncState {
  return state;
}

/**
 * Watch one project file. Returns an unsubscribe function.
 * A no-op unless the project store is file-backed.
 */
export function watchProjectFile({ projectId }: { projectId: string }): () => void {
  if (typeof window === "undefined" || projectStoreMode() !== "file") return () => {};

  const source = new EventSource(`/api/project-events/${encodeURIComponent(projectId)}`);
  let disposed = false;
  // A reload takes a second or two, during which more revisions can arrive — an
  // agent writing a batch of edits produces several in a row. Firing reload()
  // again for each one stacks navigations and can leave the page wedged, so the
  // first one wins and the rest are ignored; whatever landed in between is on
  // disk anyway and will be read by the reload already in flight.
  let reloading = false;

  source.onmessage = (event) => {
    if (disposed) return;
    let payload: { type?: string; revision?: number };
    try {
      payload = JSON.parse(event.data) as typeof payload;
    } catch {
      return;
    }
    if (payload.type !== "revision" || typeof payload.revision !== "number") return;

    const editor = EditorCore.getInstance();
    const active = editor.project.getActiveOrNull();
    if (!active || active.metadata.id !== projectId) return;

    // Our own saves move the revision too. The adapter records what it wrote, so
    // anything at or below that number is this editor's own work echoing back.
    const known = editor.project.getKnownFileRevision?.(projectId) ?? null;
    if (known !== null && payload.revision <= known) return;

    if (editor.save.getIsDirty()) {
      publish({ externalRevision: payload.revision, blockedByUnsavedChanges: true });
      return;
    }

    publish({ externalRevision: payload.revision, blockedByUnsavedChanges: false });
    if (reloading) return;
    reloading = true;
    // A full page reload, NOT an in-place loadProject. Three preview hooks read
    // `scenes.getActiveScene()`, which throws rather than returning null, and
    // tearing the scene down under a mounted preview crashes the app. Upstream
    // never hits this because loading only ever happens before the preview
    // mounts — a full reload keeps that ordering intact.
    window.location.reload();
  };

  source.onerror = () => {
    // EventSource reconnects on its own; a dev-server restart should not need a
    // page refresh to resume watching.
  };

  return () => {
    disposed = true;
    source.close();
  };
}
