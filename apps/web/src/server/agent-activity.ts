/**
 * Who is editing alongside the human, and what they just did.
 *
 * The human's side of collaboration is trust, and trust needs visibility: a
 * timeline that reorganises itself with no explanation reads as a bug, not a
 * collaborator. The MCP server reports here after each mutating call, and the
 * project-events stream carries it into the editor as a badge and a toast.
 *
 * In-memory on purpose. Presence is a liveness signal — persisting it would
 * only manufacture ghosts after a restart.
 */

export interface AgentEvent {
  seq: number;
  at: number;
  actor: string;
  summary: string;
  revision?: number;
}

interface ProjectActivity {
  actor: string;
  lastSeen: number;
  seq: number;
  events: AgentEvent[];
}

const MAX_EVENTS = 20;
/** Fresh within this window counts as "online". */
const ACTIVE_WINDOW_MS = 45_000;

const activity = new Map<string, ProjectActivity>();

export function recordAgentActivity({
  projectId,
  actor,
  summary,
  revision,
}: {
  projectId: string;
  actor: string;
  summary?: string;
  revision?: number;
}): void {
  const entry = activity.get(projectId) ?? { actor, lastSeen: 0, seq: 0, events: [] };
  entry.actor = actor;
  entry.lastSeen = Date.now();
  if (summary) {
    entry.seq += 1;
    entry.events.push({ seq: entry.seq, at: entry.lastSeen, actor, summary, revision });
    while (entry.events.length > MAX_EVENTS) entry.events.shift();
  }
  activity.set(projectId, entry);
}

export function getAgentPresence(projectId: string): {
  active: boolean;
  actor: string | null;
  seq: number;
  events: AgentEvent[];
} {
  const entry = activity.get(projectId);
  if (!entry) return { active: false, actor: null, seq: 0, events: [] };
  return {
    active: Date.now() - entry.lastSeen < ACTIVE_WINDOW_MS,
    actor: entry.actor,
    seq: entry.seq,
    events: entry.events.slice(-5),
  };
}
