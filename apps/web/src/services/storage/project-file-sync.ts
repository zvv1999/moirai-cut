import { EditorCore } from "@/core";
import { projectStoreMode } from "./service";
import { toast } from "sonner";

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

export interface AgentPresenceState {
  active: boolean;
  actor: string | null;
  events: Array<{ seq: number; at: number; summary: string; revision?: number }>;
}

export interface ProjectFileSyncState {
  externalRevision: number | null;
  /** True when disk moved ahead but local changes block an automatic reload. */
  blockedByUnsavedChanges: boolean;
  /** Who else is editing, and what they last did. */
  agent: AgentPresenceState;
}

interface ProjectFileEventPayload {
  type?: string;
  revision?: number;
  mediaChanged?: boolean;
  agent?: AgentPresenceState & { seq: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAgentPresence(
  value: unknown,
): (AgentPresenceState & { seq: number }) | undefined {
  if (
    !isRecord(value) ||
    typeof value.active !== "boolean" ||
    (value.actor !== null && typeof value.actor !== "string") ||
    typeof value.seq !== "number" ||
    !Array.isArray(value.events)
  ) {
    return undefined;
  }
  const events: AgentPresenceState["events"] = [];
  for (const event of value.events) {
    if (
      !isRecord(event) ||
      typeof event.seq !== "number" ||
      typeof event.at !== "number" ||
      typeof event.summary !== "string" ||
      (event.revision !== undefined && typeof event.revision !== "number")
    ) {
      return undefined;
    }
    events.push({
      seq: event.seq,
      at: event.at,
      summary: event.summary,
      ...(typeof event.revision === "number" ? { revision: event.revision } : {}),
    });
  }
  return {
    active: value.active,
    actor: value.actor,
    seq: value.seq,
    events,
  };
}

function parseProjectFileEvent({
  input,
}: {
  input: string;
}): ProjectFileEventPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const agent = parseAgentPresence(value.agent);
  return {
    ...(typeof value.type === "string" ? { type: value.type } : {}),
    ...(typeof value.revision === "number" ? { revision: value.revision } : {}),
    ...(typeof value.mediaChanged === "boolean"
      ? { mediaChanged: value.mediaChanged }
      : {}),
    ...(agent ? { agent } : {}),
  };
}

const listeners = new Set<(state: ProjectFileSyncState) => void>();
let state: ProjectFileSyncState = {
  externalRevision: null,
  blockedByUnsavedChanges: false,
  agent: { active: false, actor: null, events: [] },
};
/** Highest event seq already toasted, so reconnects do not replay old toasts. */
let toastedSeq = 0;

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

export function acknowledgeProjectFileSync({
  revision,
}: {
  revision: number | null;
}): void {
  publish({ externalRevision: revision, blockedByUnsavedChanges: false });
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
    if (typeof event.data !== "string") return;
    const payload = parseProjectFileEvent({ input: event.data });
    if (!payload) return;
    if (payload.type === "agent" && payload.agent) {
      const incoming = payload.agent;
      publish({ agent: { active: incoming.active, actor: incoming.actor, events: incoming.events } });
      // Toast only what is genuinely new. The human's side of collaboration is
      // trust, and a timeline that reorganises itself with no explanation reads
      // as a bug — this line of text is the explanation.
      for (const event of incoming.events) {
        if (event.seq > toastedSeq) {
          toastedSeq = event.seq;
          toast(`${incoming.actor ?? "Agent"}: ${event.summary}`, {
            ...(event.revision !== undefined ? { description: `revision ${event.revision}` } : {}),
          });
        }
      }
      return;
    }
    if (payload.type !== "revision" && payload.type !== "media") return;

    const editor = EditorCore.getInstance();
    const active = editor.project.getActiveOrNull();
    if (!active || active.metadata.id !== projectId) return;

    // An import changes only the media index, never the document revision, so
    // it gets its own event — reload the library in place and stop there.
    if (payload.type === "media") {
      void editor.media.loadProjectMedia({ projectId });
      return;
    }
    if (typeof payload.revision !== "number") return;

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
    void (async () => {
      try {
        // New media first, so a clip inserted in the same batch as its import
        // renders the moment the document lands rather than sitting invisible.
        if (payload.mediaChanged) {
          await editor.media.loadProjectMedia({ projectId });
        }
        // In-place swap: playhead, zoom and selection survive. The page-reload
        // fallback remains only for the case where the swap itself fails.
        const applied = await editor.project.applyExternalDocument();
        if (!applied) {
          window.location.reload();
        } else {
          acknowledgeProjectFileSync({
            revision: editor.project.getKnownFileRevision?.(projectId) ?? null,
          });
        }
      } catch {
        window.location.reload();
      } finally {
        reloading = false;
      }
    })();
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
