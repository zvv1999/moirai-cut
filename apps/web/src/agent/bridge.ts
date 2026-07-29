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
import {
  getTranscribeJob,
  startTranscribeJob,
  type TranscribeJobState,
} from "./transcribe-jobs";
import {
  cancelNativeMediaJob,
  checkBrowserDecodeSupport,
  ensureNativeProxy,
  getNativeMediaJob,
  listNativeMediaJobs,
  requestMediaProbe,
  retryNativeMediaJob,
  waitForNativeMediaJob,
  type AgentMediaProbeResult,
} from "./media-codec";
import type {
  NativeMediaJob,
  ProxyProfileName,
} from "@/server/media-jobs";
import {
  cancelNativeDeliveryJob,
  getNativeDeliveryJob,
  listNativeDeliveryJobs,
  startNativeDeliveryJob,
  type NativeDeliveryJobState,
} from "./native-delivery-jobs";
import type { DeliveryPresetName } from "@/export/native-delivery-contract";
import {
  buildAgentContextSnapshot,
  InvalidAgentContextReferenceError,
  resolveAgentContextTarget,
  type AgentContextSnapshot,
  type AgentContextRevealTarget,
} from "./context-references";
import { useAgentContextStore } from "./context-store";
import { toMediaTime, toSeconds } from "./time";

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
  /** Read the compact context the human selected or pinned for Codex. */
  getContext(): BridgeResult<AgentContextSnapshot>;
  /** Reveal an opencut:// path in the editor without mutating the project. */
  revealContext(request: {
    uri: string;
  }): BridgeResult<AgentContextRevealTarget & { uri: string }>;
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
  renderFrames(request: {
    atSeconds: number[];
    tile?: boolean;
    maxDim?: number;
  }): Promise<BridgeResult<RenderFramesResult>>;
  startExport(request: { options: ExportOptions; name?: string }): BridgeResult<ExportJobState>;
  getExport(request: { jobId: string }): BridgeResult<ExportJobState | null>;
  listExports(): BridgeResult<ExportJobState[]>;
  cancelExport(request: { jobId: string }): BridgeResult<ExportJobState | null>;
  startTranscribe(request: { language?: string }): BridgeResult<TranscribeJobState>;
  getTranscribe(request: { jobId: string }): BridgeResult<TranscribeJobState | null>;
  media: {
    probe(request: {
      assetId: string;
      force?: boolean;
    }): Promise<BridgeResult<AgentMediaProbeResult>>;
    ensureProxy(request: {
      assetId: string;
      profile?: ProxyProfileName;
      force?: boolean;
    }): Promise<BridgeResult<NativeMediaJob>>;
    rebuildProxies(request: {
      assetIds?: string[];
      profile?: ProxyProfileName;
      force?: boolean;
    }): Promise<BridgeResult<NativeMediaJob[]>>;
    setProxyEnabled(request: {
      assetId: string;
      enabled: boolean;
    }): BridgeResult<{ assetId: string; enabled: boolean }>;
    listJobs(): Promise<BridgeResult<NativeMediaJob[]>>;
    getJob(request: {
      jobId: string;
    }): Promise<BridgeResult<NativeMediaJob>>;
    cancelJob(request: {
      jobId: string;
    }): Promise<BridgeResult<NativeMediaJob>>;
    retryJob(request: {
      jobId: string;
    }): Promise<BridgeResult<NativeMediaJob>>;
    transcode(request: {
      sourceName: string;
      preset: DeliveryPresetName;
      outputName?: string;
    }): BridgeResult<NativeDeliveryJobState>;
    listDeliveryJobs(): BridgeResult<NativeDeliveryJobState[]>;
    getDeliveryJob(request: {
      jobId: string;
    }): BridgeResult<NativeDeliveryJobState | null>;
    cancelDeliveryJob(request: {
      jobId: string;
    }): BridgeResult<NativeDeliveryJobState | null>;
  };
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
  if (error instanceof InvalidAgentContextReferenceError) {
    return "invalid_context_reference";
  }
  return "operation_failed";
}

function activeProjectId(): string {
  const projectId = EditorCore.getInstance().agent.getState().projectId;
  if (!projectId) throw new Error("No project is open");
  return projectId;
}

async function ensureProxyAndRefresh({
  assetId,
  profile,
  force,
}: {
  assetId: string;
  profile?: ProxyProfileName;
  force?: boolean;
}): Promise<NativeMediaJob> {
  const editor = EditorCore.getInstance();
  const projectId = activeProjectId();
  const asset = editor.media
    .getAssets()
    .find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`No media asset ${assetId}`);
  if (asset.type !== "video") {
    throw new Error(`Asset ${assetId} is not a video`);
  }
  const job = await ensureNativeProxy({
    projectId,
    assetId,
    profile,
    force,
  });
  void waitForNativeMediaJob({ projectId, jobId: job.id })
    .then(async (completed) => {
      if (completed.status === "succeeded") {
        await editor.media.loadProjectMedia({ projectId });
      }
    })
    .catch(() => undefined);
  return job;
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
    getContext: () =>
      guard(() => {
        const editor = EditorCore.getInstance();
        return buildAgentContextSnapshot({
          state: editor.agent.getState(),
          pinnedReferences: useAgentContextStore.getState().references,
          selectedElements: editor.selection.getSelectedElements(),
          playheadSeconds: toSeconds(editor.playback.getCurrentTime()) ?? 0,
        });
      }),
    revealContext: ({ uri }) =>
      guard(() => {
        const editor = EditorCore.getInstance();
        const target = resolveAgentContextTarget({
          state: editor.agent.getState(),
          uri,
        });
        editor.selection.setSelectedElements({
          elements: target.selectedElements,
        });
        editor.playback.seek({
          time: toMediaTime("context seek", target.seekSeconds),
        });
        return { uri, ...target };
      }),
    supportedOperations: () =>
      guard(() => EditorCore.getInstance().agent.supportedOperations() as string[]),
    applyOperation: (envelope) =>
      guard(() => EditorCore.getInstance().agent.applyOperation(envelope)),
    undo: () => guard(() => ({ revision: EditorCore.getInstance().agent.undo() })),
    redo: () => guard(() => ({ revision: EditorCore.getInstance().agent.redo() })),
    renderFrames: (request) =>
      guardAsync(() => EditorCore.getInstance().agent.renderFrames(request)),
    startExport: ({ options, name }) => guard(() => startExportJob({ options, name })),
    getExport: ({ jobId }) => guard(() => getExportJob({ jobId })),
    listExports: () => guard(() => listExportJobs()),
    cancelExport: ({ jobId }) => guard(() => cancelExportJob({ jobId })),
    startTranscribe: ({ language }) => guard(() => startTranscribeJob({ language })),
    getTranscribe: ({ jobId }) => guard(() => getTranscribeJob({ jobId })),
    media: {
      probe: ({ assetId, force }) =>
        guardAsync(async () => {
          const editor = EditorCore.getInstance();
          const projectId = activeProjectId();
          const asset = editor.media
            .getAssets()
            .find((candidate) => candidate.id === assetId);
          if (!asset) throw new Error(`No media asset ${assetId}`);
          const browserCanDecode = await checkBrowserDecodeSupport({ asset });
          return requestMediaProbe({
            projectId,
            assetId,
            browserCanDecode,
            force,
          });
        }),
      ensureProxy: ({ assetId, profile, force }) =>
        guardAsync(() => ensureProxyAndRefresh({ assetId, profile, force })),
      rebuildProxies: ({ assetIds, profile, force }) =>
        guardAsync(async () => {
          const editor = EditorCore.getInstance();
          const requested = assetIds ? new Set(assetIds) : null;
          const candidates = editor.media
            .getAssets()
            .filter(
              (asset) =>
                asset.type === "video" &&
                (!requested || requested.has(asset.id)),
            );
          const jobs: NativeMediaJob[] = [];
          for (const asset of candidates) {
            jobs.push(
              await ensureProxyAndRefresh({
                assetId: asset.id,
                profile,
                force,
              }),
            );
          }
          return jobs;
        }),
      setProxyEnabled: ({ assetId, enabled }) =>
        guard(() => {
          const editor = EditorCore.getInstance();
          const projectId = activeProjectId();
          const asset = editor.media
            .getAssets()
            .find((candidate) => candidate.id === assetId);
          if (!asset?.proxy) {
            throw new Error(`Asset ${assetId} has no proxy`);
          }
          editor.media.updateMediaAssets({
            projectId,
            updates: [
              {
                assetId,
                update: (current) => ({
                  ...current,
                  proxy: current.proxy
                    ? { ...current.proxy, enabled }
                    : undefined,
                }),
              },
            ],
          });
          return { assetId, enabled };
        }),
      listJobs: () =>
        guardAsync(() =>
          listNativeMediaJobs({ projectId: activeProjectId() }),
        ),
      getJob: ({ jobId }) =>
        guardAsync(() =>
          getNativeMediaJob({ projectId: activeProjectId(), jobId }),
        ),
      cancelJob: ({ jobId }) =>
        guardAsync(() =>
          cancelNativeMediaJob({
            projectId: activeProjectId(),
            jobId,
          }),
        ),
      retryJob: ({ jobId }) =>
        guardAsync(() =>
          retryNativeMediaJob({
            projectId: activeProjectId(),
            jobId,
          }),
        ),
      transcode: ({ sourceName, preset, outputName }) =>
        guard(() =>
          startNativeDeliveryJob({
            projectId: activeProjectId(),
            sourceName,
            preset,
            outputName,
          }),
        ),
      listDeliveryJobs: () => guard(() => listNativeDeliveryJobs()),
      getDeliveryJob: ({ jobId }) =>
        guard(() => getNativeDeliveryJob({ jobId })),
      cancelDeliveryJob: ({ jobId }) =>
        guard(() => cancelNativeDeliveryJob({ jobId })),
    },
  };

  window.__opencutAgent = bridge;
  return () => {
    if (window.__opencutAgent === bridge) delete window.__opencutAgent;
  };
}
