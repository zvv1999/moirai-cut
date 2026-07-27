#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callBridge, CdpError, findEditorTarget } from "./cdp.mjs";
import { OperationSchema } from "./schema.mjs";
import {
  applyOperationToDocument,
  buildNewProjectDocument,
  describeDocument,
  documentFingerprint,
  refreshDerivedMetadata,
} from "./document.mjs";
import { listProjects, readProject, writeProject } from "./project-file.mjs";
import { importMedia, listMedia, mediaIndexOf } from "./media-import.mjs";
import { analyzeAudio } from "./audio-analyze.mjs";

/**
 * MCP server for an OpenCut editor tab.
 *
 * The chain is: agent -> MCP (this process) -> CDP -> window.__opencutAgent ->
 * EditorCore.agent -> the same Command objects the UI uses. Nothing here knows
 * how to edit a video; it only carries intent to the page and carries the
 * page's own answer back, so an agent edit and a human edit are the same edit.
 */

const readOnly = { readOnlyHint: true };
const mutating = { readOnlyHint: false, destructiveHint: true };

const projectId = z
  .string()
  .min(1)
  .optional()
  .describe("Pin to one editor tab by project id. Omit to use the only open editor tab.");

/** Bounded replay memory for edit_project, so a retry cannot double-apply. */
const IDEMPOTENCY_LIMIT = 128;
const appliedBatches = new Map();

function rememberBatch(key, result) {
  appliedBatches.set(key, result);
  while (appliedBatches.size > IDEMPOTENCY_LIMIT) {
    // Map iterates in insertion order, so the first key is the oldest.
    appliedBatches.delete(appliedBatches.keys().next().value);
  }
}

/**
 * Tell the editor's presence surface what just happened. Fire-and-forget: the
 * human's badge is a courtesy, and a slow or absent editor must never make a
 * tool call fail.
 */
function postActivity(projectId, summary, revision) {
  const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
  fetch(`${base}/api/agent-activity/${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actor: "Claude", summary, ...(revision !== undefined ? { revision } : {}) }),
  }).catch(() => {});
}

const asText = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const asError = (value) => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

/**
 * Runs one bridge call and flattens the three failure layers an agent can hit —
 * no browser, no editor tab, and the editor refusing the edit — into one shape.
 * A revision conflict is a real error (the agent must re-read and retry), so it
 * is reported as such rather than as a successful-looking payload.
 */
async function bridge({ method, args = [], projectId: id, target }) {
  let response;
  try {
    response = await callBridge({ method, args, projectId: id, target });
  } catch (error) {
    if (error instanceof CdpError) {
      return asError({ code: error.code, message: error.message, hint: error.hint });
    }
    return asError({ code: "driver_error", message: String(error?.message ?? error) });
  }
  const result = response.value;
  // Positive check for success, not `ok === false` for failure: anything that is
  // not a well-formed ok-envelope is a malfunction, and treating unrecognised
  // shapes as success would report an empty payload as a completed edit.
  if (!result || typeof result !== "object" || result.ok !== true) {
    if (result && typeof result === "object" && result.ok === false && result.error) {
      return asError({ ...result.error, tab: response.target.url });
    }
    return asError({
      code: "bad_bridge_response",
      message: "The page did not return a well-formed agent-bridge envelope.",
      received: result ?? null,
      tab: response.target.url,
    });
  }
  // Spreading blindly would turn an array payload (list_operations) into an
  // object with index keys, so non-object results get an explicit envelope.
  const { data } = result;
  if (Array.isArray(data)) return asText({ operations: data, tab: response.target.url });
  if (!data || typeof data !== "object") return asText({ result: data ?? null, tab: response.target.url });
  return asText({ ...data, tab: response.target.url });
}

export function createOpenCutMcpServer() {
  const server = new McpServer(
    { name: "opencut", version: "0.1.0" },
    {
      instructions:
        [
          "Two ways in.",
          "FILE tools — list_projects, read_project, edit_project — change the project document on disk and need no browser. The open editor follows the file on its own. This is the normal way to compose an edit, and edit_project applies a whole batch atomically.",
          "TAB tools — status, get_state, apply_operation, render_frames, undo, redo — drive a live editor tab over CDP, for the things only a running editor knows: rendered pixels and undo history.",
          "Both refuse a stale baseRevision rather than merging it, so always read first and pass the revision you read.",
          "Read the result. noEffect:true means the operation ran but changed nothing, so the edit did NOT happen.",
        ].join(" "),
    },
  );

  server.registerTool(
    "status",
    {
      description:
        "Check that a Chrome debugging port and an OpenCut editor tab are reachable. Use this first when anything fails.",
      inputSchema: { projectId },
      annotations: readOnly,
    },
    async ({ projectId: id }) => {
      try {
        // Resolve once and reuse: two lookups could land on two different tabs,
        // and then the reported url would not describe the reported revision.
        const target = await findEditorTarget({ projectId: id });
        const probe = await callBridge({ method: "getState", target });
        // A missing bridge produces a synthesized ok:false envelope, which is
        // truthy — so `Boolean(probe.value)` would claim the bridge is installed
        // in precisely the situation this tool exists to diagnose.
        const installed = probe.value?.ok === true;
        return asText({
          connected: true,
          tab: { url: target.url, title: target.title },
          bridgeInstalled: installed,
          projectId: installed ? probe.value.data.projectId : null,
          revision: installed ? probe.value.data.revision : null,
          ...(installed
            ? {}
            : {
                why:
                  probe.value?.error?.message ??
                  "The editor tab is open but has not finished loading a project.",
              }),
        });
      } catch (error) {
        return asError({
          connected: false,
          code: error?.code ?? "driver_error",
          message: String(error?.message ?? error),
          hint: error?.hint,
        });
      }
    },
  );

  server.registerTool(
    "get_state",
    {
      description:
        "Read the open project: current revision, active scene, and every track with its id, mute/hidden flags and element count. Read this before composing any operation.",
      inputSchema: { projectId },
      annotations: readOnly,
    },
    ({ projectId: id }) => bridge({ method: "getState", projectId: id }),
  );

  server.registerTool(
    "list_operations",
    {
      description:
        "List the operation types this editor build can actually execute. Authoritative — read from the page's own registry, not from this server.",
      inputSchema: { projectId },
      annotations: readOnly,
    },
    ({ projectId: id }) => bridge({ method: "supportedOperations", projectId: id }),
  );

  server.registerTool(
    "apply_operation",
    {
      description:
        "Apply one edit through the editor's own command system (undoable, ripple-aware). Rejected if baseRevision is stale. Returns {applied, revision, deduplicated, noEffect}.",
      inputSchema: {
        operation: OperationSchema,
        baseRevision: z
          .number()
          .int()
          .nonnegative()
          .describe("The revision from get_state. Stale values are refused, never merged."),
        projectId: z
          .string()
          .min(1)
          .describe(
            "The projectId from the SAME get_state call as baseRevision. Required: a revision number alone does not name a document, so if the human switched projects in between, this is what stops the edit landing on the wrong one.",
          ),
        idempotencyKey: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Replay guard. Supply your own and reuse it VERBATIM on retry so a dropped response cannot double-apply; omitted means a fresh key, so retries are NOT deduplicated. Only the 256 most recent keys are remembered.",
          ),
      },
      annotations: mutating,
    },
    ({ operation, baseRevision, idempotencyKey, projectId: id }) =>
      bridge({
        method: "applyOperation",
        args: [
          {
            operation,
            baseRevision,
            idempotencyKey: idempotencyKey ?? randomUUID(),
            expectedProjectId: id,
          },
        ],
        projectId: id,
      }),
  );

  // ---------------------------------------------------------------------------
  // File tools. These edit the project document on disk and need no browser at
  // all — the editor picks the change up over its file watcher. Use these to
  // compose an edit; use the tab tools above when you need what the running
  // editor knows (pixels, undo history).
  // ---------------------------------------------------------------------------

  server.registerTool(
    "list_projects",
    {
      description:
        "List project files on disk, with the directory they live in. Needs no open editor.",
      annotations: readOnly,
    },
    async () => {
      try {
        return asText(await listProjects({}));
      } catch (error) {
        return asError({ code: error.code ?? "driver_error", message: error.message });
      }
    },
  );

  server.registerTool(
    "create_project",
    {
      description:
        "Create a new, empty project on disk and return its id. Needs no browser — a fresh project is static JSON. This is what lets an agent start from nothing instead of waiting for someone to click New Project.",
      inputSchema: {
        name: z.string().min(1).describe("Display name."),
        fps: z
          .object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() })
          .optional()
          .describe(
            "Frame rate as an exact rational — 29.97 is 30000/1001. Defaults to 30/1. Not a float: rounding a broadcast rate to a decimal loses frame alignment.",
          ),
        canvasSize: z
          .object({ width: z.number().int().positive(), height: z.number().int().positive() })
          .optional()
          .describe("Defaults to 1920x1080. The first video clip you insert overrides this with its own size."),
      },
      annotations: mutating,
    },
    async ({ name, fps, canvasSize }) => {
      try {
        const document = buildNewProjectDocument({
          name,
          now: new Date().toISOString(),
          ...(fps ? { fps } : {}),
          ...(canvasSize ? { canvasSize } : {}),
        });
        // baseRevision 0 is create-if-not-exists: the route treats a missing file
        // as revision 0, so this 409s rather than overwriting an existing project.
        const { revision } = await writeProject({
          projectId: document.metadata.id,
          document,
          baseRevision: 0,
        });
        return asText({
          projectId: document.metadata.id,
          revision,
          name,
          editorUrl: `${process.env.OPENCUT_BASE_URL ?? "http://localhost:3000"}/editor/${document.metadata.id}`,
        });
      } catch (error) {
        return asError({ code: error.code ?? "driver_error", message: error.message });
      }
    },
  );

  server.registerTool(
    "delete_project",
    {
      description:
        "Delete a project and everything under it — document, media, exports. Irreversible.",
      inputSchema: {
        projectId: z.string().min(1),
        confirm: z
          .literal(true)
          .describe("Must be true. This removes the whole project directory and cannot be undone."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ projectId: id }) => {
      try {
        const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
        const response = await fetch(`${base}/api/projects/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          return asError({ code: "delete_failed", message: `${response.status} ${response.statusText}` });
        }
        return asText({ ok: true, projectId: id });
      } catch (error) {
        return asError({ code: "driver_error", message: String(error?.message ?? error) });
      }
    },
  );

  server.registerTool(
    "read_project",
    {
      description:
        "Read a project file: revision, scene, and every track with its clips. This is the state to compose operations against when editing the file directly.",
      inputSchema: { projectId: z.string().min(1).describe("From list_projects.") },
      annotations: readOnly,
    },
    async ({ projectId: id }) => {
      try {
        return asText(describeDocument({ document: await readProject({ projectId: id }) }));
      } catch (error) {
        return asError({ code: error.code ?? "driver_error", message: error.message });
      }
    },
  );

  server.registerTool(
    "edit_project",
    {
      description:
        "Apply a sequence of operations to the project FILE, with no browser involved. All-or-nothing: if any operation fails the file is left untouched. The open editor follows the file automatically. Returns the new revision and the resulting state.",
      inputSchema: {
        projectId: z.string().min(1),
        operations: z
          .array(OperationSchema)
          .min(1)
          .max(200)
          .describe("Applied in order. Later operations see the results of earlier ones."),
        baseRevision: z
          .number()
          .int()
          .nonnegative()
          .describe("The revision from read_project. Stale values are refused, never merged."),
        idempotencyKey: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Replay guard. If the write lands but the response is lost, retrying with the SAME key returns the original result instead of applying the batch twice.",
          ),
      },
      annotations: mutating,
    },
    async ({ projectId: id, operations, baseRevision, idempotencyKey }) => {
      // A lost response is the one case baseRevision cannot cover: the write
      // succeeded, so a re-read shows a fresh revision and the retry sails
      // through — inserting every clip a second time.
      if (idempotencyKey !== undefined) {
        const remembered = appliedBatches.get(idempotencyKey);
        if (remembered) return asText({ ...remembered, deduplicated: true });
      }
      try {
        const document = await readProject({ projectId: id });
        const onDisk = typeof document.revision === "number" ? document.revision : 0;
        if (onDisk !== baseRevision) {
          return asError({
            code: "revision_conflict",
            message: `Project ${id} is at revision ${onDisk}, not ${baseRevision}. Re-read it and retry.`,
            revision: onDisk,
          });
        }

        // Apply the whole batch to a working copy first. A half-applied batch
        // would leave the project in a state the caller never asked for and
        // cannot name, so nothing reaches disk unless every step succeeds.
        // The media index is what lets a first-clip insert adopt the footage's
        // resolution and frame rate, exactly as the editor does.
        const mediaIndex = await mediaIndexOf({ projectId: id }).catch(() => ({}));
        let working = document;
        const applied = [];
        for (const [index, operation] of operations.entries()) {
          try {
            const result = applyOperationToDocument({ document: working, operation, mediaIndex });
            working = result.document;
            applied.push({ index, type: operation.type, changed: result.changed });
          } catch (error) {
            return asError({
              code: error.code ?? "invalid_operation",
              message: `operation ${index} (${operation.type}): ${error.message}`,
              appliedNothing: true,
            });
          }
        }

        // Compare the batch endpoints, not each step. Per-step comparison calls
        // a mute-then-unmute pair two changes when the net result is the
        // original document — and writing that bumps the revision, which makes
        // the human's tab reload for an edit that did not happen.
        const changedAny = documentFingerprint(document) !== documentFingerprint(working);
        if (!changedAny) {
          return asText({
            revision: onDisk,
            applied,
            noEffect: true,
            note: "Nothing changed, so the file was not written and the revision did not move.",
          });
        }

        const { revision } = await writeProject({
          projectId: id,
          // The editor recomputes these on every save; a file write that skips
          // them leaves the projects list showing a stale length and date.
          document: refreshDerivedMetadata({ document: working, now: new Date().toISOString() }),
          baseRevision: onDisk,
        });
        {
          const counts = {};
          for (const entry of applied) counts[entry.type] = (counts[entry.type] ?? 0) + 1;
          postActivity(
            id,
            Object.entries(counts).map(([type, n]) => (n > 1 ? `${type} ×${n}` : type)).join(", "),
            revision,
          );
        }
        const result = {
          revision,
          applied,
          noEffect: false,
          state: describeDocument({ document: { ...working, revision } }),
        };
        if (idempotencyKey !== undefined) rememberBatch(idempotencyKey, result);
        return asText(result);
      } catch (error) {
        return asError({
          code: error.code ?? "driver_error",
          message: error.message,
          ...(error.detail ? { detail: error.detail } : {}),
        });
      }
    },
  );

  server.registerTool(
    "analyze_audio",
    {
      description:
        "Listen to an asset: overall loudness plus silence and sound intervals, in SOURCE-MEDIA seconds (feed them to trims/splits after adding the clip's own offset). This is how a cut lands on a pause instead of mid-word, and how dead air gets trimmed without guessing. Needs no browser.",
      inputSchema: {
        projectId: z.string().min(1),
        assetId: z.string().min(1).describe("From list_media."),
        noiseFloorDb: z
          .number()
          .max(0)
          .optional()
          .describe("Anything quieter counts as silence. Default -35 dB; use -45 for quiet rooms, -25 for noisy footage."),
        minSilenceSeconds: z
          .number()
          .positive()
          .optional()
          .describe("Gaps shorter than this are not reported. Default 0.35s — below a natural speech pause."),
      },
      annotations: readOnly,
    },
    async ({ projectId: id, assetId, noiseFloorDb, minSilenceSeconds }) => {
      try {
        return asText(await analyzeAudio({ projectId: id, assetId, noiseFloorDb, minSilenceSeconds }));
      } catch (error) {
        return asError({ code: error.code ?? "driver_error", message: error.message });
      }
    },
  );

  server.registerTool(
    "list_media",
    {
      description:
        "List the media assets available to a project, with duration, dimensions and frame rate. The ids here are what element.insert needs as mediaId.",
      inputSchema: { projectId: z.string().min(1) },
      annotations: readOnly,
    },
    async ({ projectId: id }) => {
      try {
        return asText({ media: await listMedia({ projectId: id }) });
      } catch (error) {
        return asError({ code: error.code ?? "driver_error", message: error.message });
      }
    },
  );

  server.registerTool(
    "import_media",
    {
      description:
        "Import a media file from disk into a project. Probes it with ffprobe for duration, dimensions and frame rate, so the clip you then insert has the right length. Returns the assetId to use as mediaId. Needs no browser.",
      inputSchema: {
        projectId: z.string().min(1),
        filePath: z
          .string()
          .min(1)
          .describe("Absolute path to a video, audio, or image file on this machine."),
        name: z
          .string()
          .min(1)
          .optional()
          .describe("Display name. Defaults to the file's own name."),
      },
      annotations: mutating,
    },
    async ({ projectId: id, filePath, name }) => {
      try {
        const imported = await importMedia({ projectId: id, filePath, name });
        postActivity(id, `imported ${imported.name}`);
        return asText(imported);
      } catch (error) {
        return asError({ code: error.code ?? "driver_error", message: error.message });
      }
    },
  );

  server.registerTool(
    "delete_media",
    {
      description:
        "Remove a media asset from a project. Reports which clips reference it FIRST — a clip whose media is gone does not error, it silently stops rendering — and refuses unless you say what should happen to them.",
      inputSchema: {
        projectId: z.string().min(1),
        assetId: z.string().min(1).describe("From list_media."),
        orphanedClips: z
          .enum(["refuse", "delete", "keep"])
          .default("refuse")
          .describe(
            "What to do with clips that use this asset. `refuse` (default) reports them and changes nothing; `delete` removes them too; `keep` leaves them referencing missing media, which makes them invisible.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ projectId: id, assetId, orphanedClips }) => {
      try {
        const document = await readProject({ projectId: id });
        const state = describeDocument({ document });
        const referencing = state.tracks.flatMap((track) =>
          track.elements
            .filter((element) => element.mediaId === assetId)
            .map((element) => ({ trackId: track.id, elementId: element.id, name: element.name })),
        );

        if (referencing.length > 0 && orphanedClips === "refuse") {
          return asError({
            code: "media_in_use",
            message: `${referencing.length} clip(s) still use this asset. Deleting it would make them stop rendering, silently. Pass orphanedClips: "delete" to remove them too, or "keep" to accept invisible clips.`,
            clips: referencing,
          });
        }

        if (referencing.length > 0 && orphanedClips === "delete") {
          const { revision } = { revision: state.revision };
          const result = applyOperationToDocument({
            document,
            operation: {
              type: "element.delete",
              elements: referencing.map(({ trackId, elementId }) => ({ trackId, elementId })),
            },
          });
          await writeProject({
            projectId: id,
            document: refreshDerivedMetadata({
              document: result.document,
              now: new Date().toISOString(),
            }),
            baseRevision: revision,
          });
        }

        const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
        const response = await fetch(
          `${base}/api/media/${encodeURIComponent(id)}/${encodeURIComponent(assetId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          return asError({ code: "delete_failed", message: `${response.status} ${response.statusText}` });
        }
        return asText({
          ok: true,
          assetId,
          removedClips: orphanedClips === "delete" ? referencing : [],
          orphanedClips: orphanedClips === "keep" ? referencing : [],
        });
      } catch (error) {
        return asError({ code: error.code ?? "driver_error", message: error.message });
      }
    },
  );

  server.registerTool(
    "list_revisions",
    {
      description:
        "List a project's revision snapshots (the newest 50), newest first. Every write archives what it replaced, so any batch — yours or the human's — can be rolled back.",
      inputSchema: { projectId: z.string().min(1) },
      annotations: readOnly,
    },
    async ({ projectId: id }) => {
      try {
        const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
        const response = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/revisions`);
        if (!response.ok) return asError({ code: "request_failed", message: `${response.status}` });
        return asText(await response.json());
      } catch (error) {
        return asError({ code: "driver_error", message: String(error?.message ?? error) });
      }
    },
  );

  server.registerTool(
    "restore_revision",
    {
      description:
        "Roll the project document back to a snapshot. Restoring goes FORWARD — the snapshot becomes a NEW revision, and the pre-restore state is itself snapshotted, so a restore can be undone by another restore. The open editor follows automatically.",
      inputSchema: {
        projectId: z.string().min(1),
        revision: z.number().int().positive().describe("From list_revisions."),
      },
      annotations: mutating,
    },
    async ({ projectId: id, revision }) => {
      try {
        const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
        const response = await fetch(
          `${base}/api/projects/${encodeURIComponent(id)}/restore/${revision}`,
          { method: "POST" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return asError({ code: "restore_failed", message: payload.error ?? `${response.status}` });
        }
        postActivity(id, `restored revision ${revision}`, payload.revision);
        return asText(payload);
      } catch (error) {
        return asError({ code: "driver_error", message: String(error?.message ?? error) });
      }
    },
  );

  server.registerTool(
    "wait_for_sync",
    {
      description:
        "Block until the open editor has caught up with the project file, then return its state. Call this after edit_project when you are about to render, export, or hand over to a human — the editor follows the file asynchronously, and acting before it catches up means acting on the PREVIOUS cut. Replaces the poll-loop boilerplate every workflow used to carry.",
      inputSchema: {
        projectId: z.string().min(1),
        revision: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Wait until the editor has loaded AT LEAST this file revision. Defaults to the file's current revision."),
        timeoutSeconds: z.number().positive().max(120).default(45),
      },
      annotations: readOnly,
    },
    async ({ projectId: id, revision, timeoutSeconds }) => {
      const deadline = Date.now() + timeoutSeconds * 1000;
      let target = revision;
      if (target === undefined) {
        try {
          const document = await readProject({ projectId: id });
          target = typeof document.revision === "number" ? document.revision : 0;
        } catch (error) {
          return asError({ code: error.code ?? "driver_error", message: error.message });
        }
      }

      let last = null;
      while (Date.now() < deadline) {
        const state = await bridge({ method: "getState", projectId: id });
        if (!state.isError) {
          const payload = JSON.parse(state.content[0].text);
          last = payload;
          if (
            payload.projectId === id &&
            typeof payload.loadedFileRevision === "number" &&
            payload.loadedFileRevision >= target
          ) {
            return asText({ synced: true, waitedForRevision: target, state: payload });
          }
        }
        // The editor reloads itself when the file moves, so transient
        // bridge_missing windows are expected here, not failures.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return asError({
        code: "sync_timeout",
        message: `The editor did not reach file revision ${target} within ${timeoutSeconds}s. It may be closed, on another project, or blocked by unsaved human edits.`,
        lastSeen: last ? { projectId: last.projectId, loadedFileRevision: last.loadedFileRevision } : null,
      });
    },
  );

  server.registerTool(
    "render_frames",
    {
      description:
        "Render frames from the timeline as PNGs, to check what an edit actually produced. Pixels come from the same renderer the exporter uses, so this is what the export would look like. Each result carries the revision it depicts — if that is not the revision you edited at, the image is not evidence.",
      inputSchema: {
        atSeconds: z
          .array(z.number().finite().nonnegative())
          .min(1)
          .max(8)
          .describe("Timeline positions in seconds. Clamped to the last frame; the result says where it actually rendered."),
        projectId,
      },
      annotations: readOnly,
    },
    async ({ atSeconds, projectId: id }) => {
      const response = await bridge({
        method: "renderFrames",
        args: [{ atSeconds }],
        projectId: id,
      });
      if (response.isError) return response;
      // Return the PNGs as image content so a vision-capable caller can actually
      // look at them, with the metadata alongside as text.
      const payload = JSON.parse(response.content[0].text);
      const content = [
        {
          type: "text",
          text: JSON.stringify(
            {
              revision: payload.revision,
              stable: payload.stable,
              tab: payload.tab,
              frames: payload.frames.map((f) =>
                f.error
                  ? { atSeconds: f.atSeconds, error: f.error }
                  : {
                      atSeconds: f.atSeconds,
                      renderedAtSeconds: f.renderedAtSeconds,
                      size: `${f.width}x${f.height}`,
                    },
              ),
            },
            null,
            2,
          ),
        },
      ];
      for (const frame of payload.frames) {
        if (frame.pngBase64) {
          content.push({ type: "image", data: frame.pngBase64, mimeType: "image/png" });
        }
      }
      return { content };
    },
  );

  server.registerTool(
    "start_export",
    {
      description:
        "Start encoding the project to a video file. Returns a jobId immediately — export takes minutes, so poll get_export rather than waiting. The finished file is written into the project's exports/ folder and the job reports its path. Runs in the browser (WebCodecs), so an editor tab must be open.",
      inputSchema: {
        format: z.enum(["mp4", "webm"]).default("mp4"),
        quality: z.enum(["low", "medium", "high", "very_high"]).default("high"),
        includeAudio: z.boolean().default(true),
        name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Output file name (extension added from format). Used exactly, so re-exporting under the same name OVERWRITES — a predictable path for pipelines. Omit for '<project>-<jobid>.<format>', which never collides.",
          ),
        projectId,
      },
      annotations: mutating,
    },
    async ({ format, quality, includeAudio, name, projectId: id }) => {
      // Refuse to export a cut the editor has not caught up to. The encode reads
      // the editor's in-memory document, so starting it while the tab is still
      // behind the file silently produces a video of the PREVIOUS edit — the
      // job reports success and the file is simply wrong.
      const state = await bridge({ method: "getState", projectId: id });
      if (!state.isError) {
        const payload = JSON.parse(state.content[0].text);
        if (payload.projectId && typeof payload.loadedFileRevision === "number") {
          const onDisk = await readProject({ projectId: payload.projectId })
            .then((document) => (typeof document.revision === "number" ? document.revision : null))
            .catch(() => null);
          if (onDisk !== null && onDisk > payload.loadedFileRevision) {
            return asError({
              code: "editor_behind_file",
              message: `The editor is showing revision ${payload.loadedFileRevision} but the file is at ${onDisk}. Wait for it to reload, then start the export — otherwise you get a video of the previous cut.`,
              loadedFileRevision: payload.loadedFileRevision,
              fileRevision: onDisk,
            });
          }
        }
      }
      return bridge({
        method: "startExport",
        args: [{ options: { format, quality, includeAudio }, ...(name ? { name } : {}) }],
        projectId: id,
      });
    },
  );

  server.registerTool(
    "get_export",
    {
      description:
        "Check an export job: status, progress 0..1, and once complete the path of the file on disk. `stable:false` means the project changed after the export started, so the output is of an older cut.",
      inputSchema: { jobId: z.string().min(1), projectId },
      annotations: readOnly,
    },
    ({ jobId, projectId: id }) =>
      bridge({ method: "getExport", args: [{ jobId }], projectId: id }),
  );

  server.registerTool(
    "cancel_export",
    {
      description: "Ask a running export to stop. Returns the job's state.",
      inputSchema: { jobId: z.string().min(1), projectId },
      annotations: mutating,
    },
    ({ jobId, projectId: id }) =>
      bridge({ method: "cancelExport", args: [{ jobId }], projectId: id }),
  );

  server.registerTool(
    "start_transcribe",
    {
      description:
        "Transcribe the timeline's audio to caption chunks. Long-running — it downloads a whisper model on first use and runs in a worker — so poll get_transcribe. Returns {text, startTime, duration} chunks in SECONDS; turn them into captions with ordinary element.insert text clips, which lets you edit the wording or retiming first. Runs in the browser, so an editor tab must be open.",
      inputSchema: {
        language: z
          .string()
          .min(2)
          .optional()
          .describe('BCP-47-ish code, or omit for auto-detect.'),
        projectId,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    ({ language, projectId: id }) =>
      bridge({ method: "startTranscribe", args: [{ language }], projectId: id }),
  );

  server.registerTool(
    "get_transcribe",
    {
      description:
        "Check a transcription job. While running, `step` says whether it is downloading the model, decoding, or transcribing. On completion `chunks` holds the captions.",
      inputSchema: { jobId: z.string().min(1), projectId },
      annotations: readOnly,
    },
    ({ jobId, projectId: id }) =>
      bridge({ method: "getTranscribe", args: [{ jobId }], projectId: id }),
  );

  server.registerTool(
    "undo",
    {
      description:
        "Undo the last command — including edits the human made. Advances the revision, so any operation you were holding becomes stale.",
      inputSchema: { projectId },
      annotations: mutating,
    },
    ({ projectId: id }) => bridge({ method: "undo", projectId: id }),
  );

  server.registerTool(
    "redo",
    {
      description: "Redo the last undone command. Advances the revision.",
      inputSchema: { projectId },
      annotations: mutating,
    },
    ({ projectId: id }) => bridge({ method: "redo", projectId: id }),
  );

  return server;
}

const isEntrypoint = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
  const server = createOpenCutMcpServer();
  await server.connect(new StdioServerTransport());
}
