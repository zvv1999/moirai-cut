import { EditorCore } from "@/core";
import type { ExportOptions, ExportResult } from "@/export";
import { EXPORT_MIME_TYPES } from "@/export/mime-types";

/**
 * Export as a job an agent can start, poll, and collect.
 *
 * Export is long-running and browser-resident: the encode is WebCodecs, so it
 * cannot move to Node, and a single blocking call would hold a CDP evaluation
 * open for minutes. So it is a job — start returns immediately, progress is
 * polled, and the finished bytes are uploaded to the project's exports folder
 * rather than being carried back through the debugger.
 */

export type ExportJobStatus = "running" | "completed" | "cancelled" | "failed";

export interface ExportJobState {
  jobId: string;
  status: ExportJobStatus;
  progress: number;
  /** The revision the export was started from. */
  startedAtRevision: number;
  /** False once the document has changed since — the output is of an older cut. */
  stable: boolean;
  format: string;
  /** Set once the bytes are on disk. */
  path: string | null;
  sizeBytes: number | null;
  error: string | null;
}

/** Bounded: a long session must not accumulate job records forever. */
const MAX_JOBS = 8;
const jobs = new Map<string, ExportJobState>();

function remember(job: ExportJobState): void {
  jobs.set(job.jobId, job);
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value;
    if (oldest === undefined) break;
    jobs.delete(oldest);
  }
}

export function getExportJob({ jobId }: { jobId: string }): ExportJobState | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  // Recomputed on read: the document may have moved since the job started, and
  // an export of a stale cut is not what the caller asked for.
  return { ...job, stable: job.startedAtRevision === EditorCore.getInstance().agent.revision };
}

export function listExportJobs(): ExportJobState[] {
  return [...jobs.values()];
}

export function cancelExportJob({ jobId }: { jobId: string }): ExportJobState | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== "running") return job ? getExportJob({ jobId }) : null;
  EditorCore.getInstance().project.cancelExport();
  return getExportJob({ jobId });
}

/**
 * Start an export. Returns as soon as the job is registered — the encode runs on.
 */
/**
 * Path-hostile characters become dashes; Unicode letters stay. Capped so the
 * full filename (plus "-<jobid>.<ext>") fits the exports route's 160-char
 * limit — sliced by CODE POINT, because cutting a surrogate pair in half
 * leaves a lone surrogate the route's \p{L} check then rejects. Leading dots
 * are stripped too: the exports listing hides dotfiles.
 */
export function safeExportName(raw: string): string {
  const safe = raw
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return [...safe].slice(0, 140).join("").replace(/[.-]+$/, "") || "export";
}

/** Resolve the agent-only review preset without mutating caller-owned options. */
export function resolveAgentExportOptions(options: ExportOptions): ExportOptions {
  return options.quality === "draft"
    ? { ...options, fps: { numerator: 12, denominator: 1 } }
    : options;
}

/**
 * Produce the exact route-safe output name before encoding starts.
 *
 * A caller-chosen name remains predictable, while generated names retain the
 * short job suffix that prevents concurrent exports from overwriting each
 * other. Draft branding is idempotent so retrying a branded name does not
 * produce "-draft-draft".
 */
export function buildAgentExportFileName({
  requestedName,
  projectName,
  format,
  draft,
  jobId,
}: {
  requestedName?: string;
  projectName: string;
  format: ExportOptions["format"];
  draft: boolean;
  jobId: string;
}): string {
  const suffix = `.${format}`;
  const stripSuffix = (value: string) =>
    value.toLocaleLowerCase().endsWith(suffix)
      ? value.slice(0, -suffix.length)
      : value;
  const base = safeExportName(stripSuffix(requestedName ?? projectName));
  const branded = draft && !base.toLocaleLowerCase().endsWith("-draft")
    ? `${base}-draft`
    : base;
  return requestedName
    ? `${branded}${suffix}`
    : `${branded}-${jobId.slice(0, 8)}${suffix}`;
}

interface ExportJobEditor {
  project: {
    getActiveOrNull(): { metadata: { id: string; name: string } } | null;
    cancelExport(): void;
  };
  agent: { readonly revision: number };
  renderer: {
    exportProject(request: {
      options: ExportOptions;
      onProgress: ({ progress }: { progress: number }) => void;
      onCancel: () => boolean;
    }): Promise<ExportResult>;
  };
}

interface ExportSaveResponse {
  ok: boolean;
  statusText: string;
  json(): Promise<unknown>;
}

interface ExportJobDependencies {
  editor?: ExportJobEditor;
  randomUUID?: () => string;
  save?: (request: { url: string; init: RequestInit }) => Promise<ExportSaveResponse>;
}

export function startExportJob({
  options,
  name,
  dependencies = {},
}: {
  options: ExportOptions;
  name?: string;
  dependencies?: ExportJobDependencies;
}): ExportJobState {
  const editor = dependencies.editor ?? EditorCore.getInstance();
  const save = dependencies.save ??
    (({ url, init }: { url: string; init: RequestInit }) => fetch(url, init));
  const project = editor.project.getActiveOrNull();
  if (!project) throw new Error("No active project to export");

  // Draft is a REVIEW preset: the dominant export cost is frames rendered ×
  // per-frame render, so the honest speed lever is the frame rate — 30→12fps
  // is ~2.5x — plus the low bitrate. Audio stays full-rate: pacing is mostly
  // heard, and judging rhythm on broken audio would mislead the review.
  const draft = options.quality === "draft";
  const effectiveOptions = resolveAgentExportOptions(options);

  const jobId = dependencies.randomUUID?.() ?? crypto.randomUUID();
  const job: ExportJobState = {
    jobId,
    status: "running",
    progress: 0,
    startedAtRevision: editor.agent.revision,
    stable: true,
    format: options.format,
    path: null,
    sizeBytes: null,
    error: null,
  };
  remember(job);

  void (async () => {
    try {
      const result = await editor.renderer.exportProject({
        options: effectiveOptions,
        onProgress: ({ progress }) => {
          const current = jobs.get(jobId);
          if (current) current.progress = progress;
        },
        onCancel: () => jobs.get(jobId)?.status === "cancelled",
      });

      const current = jobs.get(jobId);
      if (!current) return;

      if (result.cancelled) {
        current.status = "cancelled";
        return;
      }
      if (!result.success || !result.buffer) {
        current.status = "failed";
        current.error = result.error ?? "Export produced no data";
        return;
      }

      // Upload rather than return: the buffer can be tens of megabytes, and the
      // caller wants a file it can hand to ffmpeg or a player anyway.
      // A caller-chosen name is used exactly (so the output path is predictable
      // and a re-export overwrites rather than accumulating); the default gets
      // a job-id suffix so repeated exports of one project never collide.
      // Unicode letters stay; only path-hostile characters become dashes. The
      // ASCII-only version ground "reed 酒吧夜" into "reed-----".
      const fileName = buildAgentExportFileName({
        requestedName: name,
        projectName: project.metadata.name,
        format: options.format,
        draft,
        jobId,
      });
      const response = await save({
        url: `/api/exports/${encodeURIComponent(project.metadata.id)}/${encodeURIComponent(fileName)}`,
        init: {
          method: "PUT",
          headers: {
            "content-type":
              EXPORT_MIME_TYPES[options.format as keyof typeof EXPORT_MIME_TYPES] ??
              "application/octet-stream",
          },
          body: result.buffer,
        },
      });
      if (!response.ok) {
        current.status = "failed";
        current.error = `Saving the export failed: ${response.statusText}`;
        return;
      }
      const saved = (await response.json()) as { path: string; sizeBytes: number };
      current.status = "completed";
      current.progress = 1;
      current.path = saved.path;
      current.sizeBytes = saved.sizeBytes;
    } catch (error) {
      const current = jobs.get(jobId);
      if (current) {
        current.status = "failed";
        current.error = error instanceof Error ? error.message : String(error);
      }
    }
  })();

  return job;
}
