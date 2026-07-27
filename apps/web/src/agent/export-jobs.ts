import { EditorCore } from "@/core";
import type { ExportOptions } from "@/export";
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

export function startExportJob({
  options,
  name,
}: {
  options: ExportOptions;
  name?: string;
}): ExportJobState {
  const editor = EditorCore.getInstance();
  const project = editor.project.getActiveOrNull();
  if (!project) throw new Error("No active project to export");

  const jobId = crypto.randomUUID();
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
        options,
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
      const suffix = `.${options.format}`;
      const fileName = name
        ? safeExportName(name.endsWith(suffix) ? name.slice(0, -suffix.length) : name) + suffix
        : `${safeExportName(project.metadata.name)}-${jobId.slice(0, 8)}${suffix}`;
      const response = await fetch(
        `/api/exports/${encodeURIComponent(project.metadata.id)}/${encodeURIComponent(fileName)}`,
        {
          method: "PUT",
          headers: {
            "content-type":
              EXPORT_MIME_TYPES[options.format as keyof typeof EXPORT_MIME_TYPES] ??
              "application/octet-stream",
          },
          body: result.buffer,
        },
      );
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
