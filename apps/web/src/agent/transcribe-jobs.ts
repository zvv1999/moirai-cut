import { EditorCore } from "@/core";
import { extractTimelineAudio } from "@/media/mediabunny";
import { decodeAudioToFloat32 } from "@/media/audio";
import { buildCaptionChunks } from "@/transcription/caption";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { transcriptionService } from "@/services/transcription/service";
import type { CaptionChunk } from "@/transcription/types";

/**
 * Transcription as a job an agent can start and poll.
 *
 * Like export, this cannot move to Node: the model is ONNX running in a worker,
 * and the input is a Float32Array decoded from the timeline's own audio. It also
 * downloads a model on first use and then runs for a while, so a single blocking
 * call would hold a CDP evaluation open for minutes.
 *
 * The OUTPUT, though, is plain data — `{text, startTime, duration}` per chunk —
 * so once a caller has it, turning captions into text clips is ordinary
 * `element.insert` work over the file. This deliberately stops at producing the
 * chunks rather than also inserting them: an agent usually wants to edit the
 * wording, retime, or filter before anything lands on the timeline.
 */

export type TranscribeJobStatus = "running" | "completed" | "failed";

export interface TranscribeJobState {
  jobId: string;
  status: TranscribeJobStatus;
  /** 0..1 across model download and decoding — not a wall-clock estimate. */
  progress: number;
  step: string;
  startedAtRevision: number;
  language: string | null;
  chunks: CaptionChunk[] | null;
  error: string | null;
}

const MAX_JOBS = 4;
const jobs = new Map<string, TranscribeJobState>();

function remember(job: TranscribeJobState): void {
  jobs.set(job.jobId, job);
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value;
    if (oldest === undefined) break;
    jobs.delete(oldest);
  }
}

export function getTranscribeJob({ jobId }: { jobId: string }): TranscribeJobState | null {
  return jobs.get(jobId) ?? null;
}

export function startTranscribeJob({ language }: { language?: string }): TranscribeJobState {
  const editor = EditorCore.getInstance();
  if (!editor.project.getActiveOrNull()) throw new Error("No active project to transcribe");

  const jobId = crypto.randomUUID();
  const job: TranscribeJobState = {
    jobId,
    status: "running",
    progress: 0,
    step: "Extracting audio",
    startedAtRevision: editor.agent.revision,
    language: language ?? null,
    chunks: null,
    error: null,
  };
  remember(job);

  void (async () => {
    const current = () => jobs.get(jobId);
    try {
      // The timeline's audio, not one clip's — captions describe the cut as it
      // stands, which is what makes them worth regenerating after an edit.
      const audioBlob = await extractTimelineAudio({
        tracks: editor.scenes.getActiveScene().tracks,
        mediaAssets: editor.media.getAssets(),
        totalDuration: editor.timeline.getTotalDuration(),
      });

      const running = current();
      if (running) running.step = "Decoding audio";
      const { samples } = await decodeAudioToFloat32({
        audioBlob,
        sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
      });

      const decoding = current();
      if (decoding) decoding.step = "Transcribing";
      const result = await transcriptionService.transcribe({
        audioData: samples,
        ...(language && language !== "auto"
          ? { language: language as Parameters<typeof transcriptionService.transcribe>[0]["language"] }
          : {}),
        // TranscriptionProgress carries a status and a message alongside the
        // number — surfacing the message is what tells a caller whether the long
        // wait is a model download or the actual transcription.
        onProgress: (progress) => {
          const active = current();
          if (!active) return;
          // TranscriptionProgress reports 0..100, unlike the export job's 0..1.
          // Normalising here keeps one contract across both job types instead of
          // making a caller remember which is which.
          if (typeof progress.progress === "number") {
            active.progress = Math.max(0, Math.min(1, progress.progress / 100));
          }
          if (progress.message) active.step = progress.message;
          else if (progress.status) active.step = String(progress.status);
        },
      });

      const finished = current();
      if (!finished) return;
      finished.chunks = buildCaptionChunks({ segments: result.segments });
      finished.progress = 1;
      finished.step = "Done";
      finished.status = "completed";
    } catch (error) {
      const failed = current();
      if (failed) {
        failed.status = "failed";
        failed.error = error instanceof Error ? error.message : String(error);
      }
    }
  })();

  return job;
}
