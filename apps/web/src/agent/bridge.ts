import { EditorCore } from "@/core";
import {
  OperationConflictError,
  ProjectMismatchError,
  UnresolvedReferenceError,
  InvalidOperationError,
} from "./operations";
import type { Operation, OperationResult } from "./operations";
import type { ProjectStateSummary, RenderFramesResult } from "./agent-manager";
import type { ExportOptions } from "@/export";
import {
  cancelExportJob,
  getExportJob,
  listExportJobs,
  startExportJob,
  type ExportJobState,
} from "./export-jobs";

/**
 * The out-of-page entry point.
 *
 * The authoritative document lives in the tab (IndexedDB + OPFS), so a Node
 * process cannot touch it directly — an external driver (MCP server, CDP client,
 * Playwright) has to reach the editor *through* a page. This bridge is that
 * seam: a small, explicitly-shaped surface on `window` rather than letting a
 * driver poke at internals.
 *
 * Everything here funnels into `editor.agent`, so external callers get the same
 * revision / conflict / idempotency guarantees as any other operation, and the
 * same Command objects the UI uses.
 *
 * Errors are returned as data rather than thrown: a driver evaluating this over
 * CDP gets a structured result instead of a stringified exception.
 */

export interface BridgeOk<T> {
  ok: true;
  data: T;
}
export interface BridgeErr {
  ok: false;
  error: { code: string; message: string; revision: number };
}
export type BridgeResult<T> = BridgeOk<T> | BridgeErr;

export interface AgentBridge {
  readonly version: 1;
  getState(): BridgeResult<ProjectStateSummary>;
  supportedOperations(): BridgeResult<string[]>;
  applyOperation(envelope: {
    operation: Operation;
    baseRevision: number;
    idempotencyKey: string;
    expectedProjectId?: string;
  }): BridgeResult<OperationResult>;
  undo(): BridgeResult<{ revision: number }>;
  redo(): BridgeResult<{ revision: number }>;
  /** Async: rendering is asynchronous, so this alone returns a promise. */
  renderFrames(request: { atSeconds: number[] }): Promise<BridgeResult<RenderFramesResult>>;
  startExport(request: { options: ExportOptions }): BridgeResult<ExportJobState>;
  getExport(request: { jobId: string }): BridgeResult<ExportJobState | null>;
  listExports(): BridgeResult<ExportJobState[]>;
  cancelExport(request: { jobId: string }): BridgeResult<ExportJobState | null>;
}

declare global {
  interface Window {
    __opencutAgent?: AgentBridge;
  }
}

function currentRevision(): number {
  try {
    return EditorCore.getInstance().agent.revision;
  } catch {
    return -1;
  }
}

/**
 * Distinct codes: a conflict means "re-read and re-decide against the same
 * document", a mismatch means "you are aimed at the wrong document entirely",
 * and an unresolved reference means the ids themselves are stale. Collapsing
 * them would invite a retry loop that keeps missing.
 */
function errorCode(error: unknown): string {
  if (error instanceof OperationConflictError) return "revision_conflict";
  if (error instanceof ProjectMismatchError) return "project_mismatch";
  if (error instanceof UnresolvedReferenceError) return "unresolved_reference";
  if (error instanceof InvalidOperationError) return "invalid_operation";
  return "operation_failed";
}

function guard<T>(fn: () => T): BridgeResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
        revision: currentRevision(),
      },
    };
  }
}

/** Async twin of `guard`, so a rejected render is data rather than an unhandled rejection. */
async function guardAsync<T>(fn: () => Promise<T>): Promise<BridgeResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
        revision: currentRevision(),
      },
    };
  }
}

export function installAgentBridge(): () => void {
  if (typeof window === "undefined") return () => {};

  const bridge: AgentBridge = {
    version: 1,
    getState: () => guard(() => EditorCore.getInstance().agent.getState()),
    supportedOperations: () =>
      guard(() => EditorCore.getInstance().agent.supportedOperations() as string[]),
    applyOperation: (envelope) =>
      guard(() => EditorCore.getInstance().agent.applyOperation(envelope)),
    undo: () => guard(() => ({ revision: EditorCore.getInstance().agent.undo() })),
    redo: () => guard(() => ({ revision: EditorCore.getInstance().agent.redo() })),
    renderFrames: (request) =>
      guardAsync(() => EditorCore.getInstance().agent.renderFrames(request)),
    startExport: ({ options }) => guard(() => startExportJob({ options })),
    getExport: ({ jobId }) => guard(() => getExportJob({ jobId })),
    listExports: () => guard(() => listExportJobs()),
    cancelExport: ({ jobId }) => guard(() => cancelExportJob({ jobId })),
  };

  window.__opencutAgent = bridge;
  return () => {
    if (window.__opencutAgent === bridge) delete window.__opencutAgent;
  };
}
