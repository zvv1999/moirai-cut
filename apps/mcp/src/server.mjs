#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
	callBridge,
	CdpError,
	findEditorTarget,
	openEditorTab,
	closeEditorTab,
} from "./cdp.mjs";
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
import { inspectMedia, inspectMediaScenes } from "./video-inspect.mjs";
import { lintDocument } from "./cut-lint.mjs";
import { exportFcpxml } from "./interchange.mjs";
import {
	buildMediaCatalog,
	planTimelineRangeInspection,
	readMediaCatalog,
	saveMediaAnalysis,
	writeMediaCatalog,
} from "./media-analysis.mjs";

const packageManifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
if (typeof packageManifest.version !== "string") {
	throw new Error("apps/mcp/package.json must declare a string version");
}

/**
 * MCP server for a Moirai Cut editor tab. Legacy protocol identifiers remain
 * `opencut` for backwards compatibility.
 *
 * The chain is: agent -> MCP (this process) -> CDP -> window.__opencutAgent ->
 * EditorCore.agent -> the same Command objects the UI uses. Nothing here knows
 * how to edit a video; it only carries intent to the page and carries the
 * page's own answer back, so an agent edit and a human edit are the same edit.
 */

const readOnly = { readOnlyHint: true };
// These operations change state, but they are revisioned, atomic, undoable, or
// limited to runtime jobs/tabs. Marking every mutation as destructive makes
// Codex pause for an approval elicitation even when approval_policy="never".
// Actual irreversible tools (delete_project/delete_media) override this below.
const mutating = { readOnlyHint: false, destructiveHint: false };

const projectId = z
	.string()
	.min(1)
	.optional()
	.describe(
		"Pin to one editor tab by project id. Omit to use the only open editor tab.",
	);

const MediaSceneAnalysisSchema = z.object({
	startSeconds: z.number().finite().nonnegative(),
	endSeconds: z.number().finite().nonnegative(),
	description: z.string().min(1).max(4_000),
	subjects: z.array(z.string().max(200)).max(50).optional(),
	actions: z.array(z.string().max(300)).max(50).optional(),
	location: z.string().max(500).optional(),
	mood: z.string().max(500).optional(),
	shotType: z.string().max(200).optional(),
	cameraMovement: z.string().max(300).optional(),
	onScreenText: z.array(z.string().max(1_000)).max(50).optional(),
	qualityNotes: z.array(z.string().max(1_000)).max(50).optional(),
});

const MediaAnalysisSchema = z.object({
	provider: z
		.enum(["codex-multimodal", "ai-platform", "human", "other"])
		.default("codex-multimodal"),
	model: z.string().max(200).optional(),
	summary: z.string().min(1).max(12_000),
	tags: z.array(z.string().max(200)).max(200).default([]),
	scenes: z.array(MediaSceneAnalysisSchema).max(200).default([]),
	language: z.string().max(100).optional(),
	transcript: z.string().max(100_000).optional(),
	notes: z.array(z.string().max(2_000)).max(100).optional(),
	analyzedAt: z.string().datetime().optional(),
});

/**
 * Tabs THIS process opened via open_editor. close_editor refuses to close any
 * other tab without force — the tool cannot otherwise tell an agent scratch
 * tab from the one the human is working in.
 */
const agentOpenedTabs = new Set();

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
		body: JSON.stringify({
			actor: "Codex",
			summary,
			...(revision !== undefined ? { revision } : {}),
		}),
	}).catch(() => {});
}

async function activeEditorPresence() {
	const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
	let response;
	try {
		response = await fetch(`${base.replace(/\/+$/, "")}/api/editor-presence`, {
			headers: { accept: "application/json" },
		});
	} catch (error) {
		const wrapped = new Error(
			`Cannot reach Moirai Cut editor presence at ${base}: ${String(error?.message ?? error)}`,
		);
		wrapped.code = "server_unreachable";
		throw wrapped;
	}
	if (!response.ok) {
		const error = new Error(
			`Editor presence request failed: ${response.status}`,
		);
		error.code = "presence_failed";
		throw error;
	}
	return response.json();
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
	// bridge_missing comes from inside the page BEFORE the method is invoked —
	// the bindings unmount/remount for a beat during page load, and the bridge
	// vanishes with them — so a short bounded retry cannot double-apply anything
	// and turns a normal-operation gap into a non-event instead of an error.
	for (let attempt = 0; ; attempt += 1) {
		try {
			response = await callBridge({ method, args, projectId: id, target });
		} catch (error) {
			if (error instanceof CdpError) {
				return asError({
					code: error.code,
					message: error.message,
					hint: error.hint,
				});
			}
			return asError({
				code: "driver_error",
				message: String(error?.message ?? error),
			});
		}
		const flap =
			response.value?.ok === false &&
			response.value?.error?.code === "bridge_missing";
		if (!flap || attempt >= 3) break;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	const result = response.value;
	// Positive check for success, not `ok === false` for failure: anything that is
	// not a well-formed ok-envelope is a malfunction, and treating unrecognised
	// shapes as success would report an empty payload as a completed edit.
	if (!result || typeof result !== "object" || result.ok !== true) {
		if (
			result &&
			typeof result === "object" &&
			result.ok === false &&
			result.error
		) {
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
	if (Array.isArray(data))
		return asText({ operations: data, tab: response.target.url });
	if (!data || typeof data !== "object")
		return asText({ result: data ?? null, tab: response.target.url });
	return asText({ ...data, tab: response.target.url });
}

export function createOpenCutMcpServer() {
	const server = new McpServer(
		{ name: "opencut", version: packageManifest.version },
		{
			instructions: [
				"Two ways in.",
				"FILE tools — list_projects, read_project, edit_project — change the project document on disk and need no browser. The open editor follows the file on its own. This is the normal way to compose an edit, and edit_project applies a whole batch atomically.",
				"CODEX APP entry — get_active_project discovers the freshest editor heartbeat without CDP; read_agent_context returns its pinned/live opencut:// references, compact project summary, and media catalog.",
				"VISION workflow — inspect_media_scenes finds source-video shot changes; inspect_timeline_range maps a selected timeline interval back to source frames and returns contact sheets. After looking at those images, persist observations with save_media_analysis so later turns can read_media_catalog instead of looking again.",
				"TAB tools — status, get_state, get_context, reveal_context, apply_operation, render_frames, undo, redo — drive a live editor tab over CDP, for the things only a running editor knows: human-selected context, rendered pixels and undo history.",
				"Both refuse a stale baseRevision rather than merging it, so always read first and pass the revision you read.",
				"PROJECT HANDOFF — export_fcpxml creates a revision-bound FCPXML 1.10 file plus an interchange report for editable handoff to Final Cut and the experimental Jianying desktop import path. Always inspect report.issues; XML validity does not imply lossless transfer.",
				"Read the result. noEffect:true means the operation ran but changed nothing, so the edit did NOT happen.",
			].join(" "),
		},
	);

	server.registerTool(
		"status",
		{
			description:
				"Check that a Chrome debugging port and a Moirai Cut editor tab are reachable. Use this first when anything fails.",
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
		"get_context",
		{
			description:
				"Read the compact context the human selected or pinned for Codex. Returns stable opencut:// paths, the live selection, playhead, and a prompt-ready context block without dumping the whole project.",
			inputSchema: { projectId },
			annotations: readOnly,
		},
		({ projectId: id }) => bridge({ method: "getContext", projectId: id }),
	);

	server.registerTool(
		"get_active_project",
		{
			description:
				"Discover the project currently open in the human's freshest Moirai Cut editor, including its revision, scene, and compact pinned/live opencut:// context. Browser debugging is NOT required; the editor publishes a local heartbeat.",
			inputSchema: {},
			annotations: readOnly,
		},
		async () => {
			try {
				const presence = await activeEditorPresence();
				if (presence?.active !== true) {
					return asError({
						code: "no_active_editor",
						message: "No Moirai Cut editor heartbeat is active.",
						hint: "Open a project in Moirai Cut, wait up to five seconds, then retry. Use list_projects when no editor should be open.",
					});
				}
				return asText(presence);
			} catch (error) {
				return asError({
					code: error?.code ?? "presence_failed",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"read_agent_context",
		{
			description:
				"One browser-free entry call for a Codex App conversation. Omit projectId to use the active Moirai Cut editor; returns selected/pinned context, a compact project summary, and an Agent-readable media catalog (generated in memory if no sidecar exists).",
			inputSchema: {
				projectId: z
					.string()
					.min(1)
					.optional()
					.describe("Omit to use get_active_project discovery."),
			},
			annotations: readOnly,
		},
		async ({ projectId: requestedId }) => {
			try {
				const presence = await activeEditorPresence().catch(() => ({
					active: false,
				}));
				const id =
					requestedId ??
					(presence?.active === true && typeof presence.projectId === "string"
						? presence.projectId
						: null);
				if (!id) {
					return asError({
						code: "no_active_editor",
						message:
							"No projectId was supplied and no active Moirai Cut editor was found.",
						hint: "Open a project or call list_projects and pass one of its ids.",
					});
				}
				const document = await readProject({ projectId: id });
				const mediaIndex = await mediaIndexOf({ projectId: id }).catch(
					() => ({}),
				);
				const persisted = await readMediaCatalog({ projectId: id });
				const catalog =
					persisted ??
					buildMediaCatalog({
						document,
						mediaIndex,
						generatedAt: new Date().toISOString(),
					});
				return asText({
					activeEditor:
						presence?.active === true && presence.projectId === id
							? presence
							: { active: false, projectId: id },
					context:
						presence?.active === true && presence.projectId === id
							? (presence.context ?? null)
							: null,
					project: describeDocument({ document, detail: "summary" }),
					mediaCatalog: catalog,
					mediaCatalogPersisted: persisted !== null,
				});
			} catch (error) {
				return asError({
					code: error?.code ?? "driver_error",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"reveal_context",
		{
			description:
				"Reveal an opencut:// Codex Path in the open editor. Selects the exact element(s) and moves the playhead to the referenced clip or time range; does not edit the project.",
			inputSchema: {
				uri: z
					.string()
					.startsWith("opencut://project/")
					.describe("A stable path returned by get_context."),
				projectId,
			},
			annotations: readOnly,
		},
		({ uri, projectId: id }) =>
			bridge({
				method: "revealContext",
				args: [{ uri }],
				projectId: id,
			}),
	);

	server.registerTool(
		"list_operations",
		{
			description:
				"List the operation types this editor build can actually execute. Authoritative — read from the page's own registry, not from this server.",
			inputSchema: { projectId },
			annotations: readOnly,
		},
		({ projectId: id }) =>
			bridge({ method: "supportedOperations", projectId: id }),
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
					.describe(
						"The revision from get_state. Stale values are refused, never merged.",
					),
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
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
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
					.object({
						numerator: z.number().int().positive(),
						denominator: z.number().int().positive(),
					})
					.optional()
					.describe(
						"Frame rate as an exact rational — 29.97 is 30000/1001. Defaults to 30/1. Not a float: rounding a broadcast rate to a decimal loses frame alignment.",
					),
				canvasSize: z
					.object({
						width: z.number().int().positive(),
						height: z.number().int().positive(),
					})
					.optional()
					.describe(
						"Defaults to 1920x1080. The first video clip you insert overrides this with its own size.",
					),
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
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
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
					.describe(
						"Must be true. This removes the whole project directory and cannot be undone.",
					),
			},
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ projectId: id }) => {
			try {
				const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
				const response = await fetch(
					`${base}/api/projects/${encodeURIComponent(id)}`,
					{
						method: "DELETE",
					},
				);
				if (!response.ok) {
					return asError({
						code: "delete_failed",
						message: `${response.status} ${response.statusText}`,
					});
				}
				return asText({ ok: true, projectId: id });
			} catch (error) {
				return asError({
					code: "driver_error",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"read_project",
		{
			description:
				"Read a project file: revision, scene, and every track with its clips. This is the state to compose operations against when editing the file directly. detail=summary answers 'what is this project' in a screenful — track spans and counts, no per-clip payload — survey first, then full-read only if needed.",
			inputSchema: {
				projectId: z.string().min(1).describe("From list_projects."),
				detail: z
					.enum(["full", "summary"])
					.optional()
					.describe(
						"summary drops the per-clip payload (keyframes, masks, params) and reports per-track spans and counts instead. Default full.",
					),
			},
			annotations: readOnly,
		},
		async ({ projectId: id, detail }) => {
			try {
				return asText(
					describeDocument({
						document: await readProject({ projectId: id }),
						detail,
					}),
				);
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
			}
		},
	);

	server.registerTool(
		"export_fcpxml",
		{
			description:
				"Export one saved Moirai Cut scene as FCPXML 1.10 plus a structured loss/relink report. This is an open NLE interchange artifact and an EXPERIMENTAL one-way handoff for Jianying desktop, not a CapCut project file. Read the project first and pass its exact revision; generation fails if that revision changes before publication.",
			inputSchema: {
				projectId: z.string().min(1).describe("From list_projects."),
				baseRevision: z
					.number()
					.int()
					.nonnegative()
					.describe("The exact revision from read_project."),
				sceneId: z
					.string()
					.min(1)
					.optional()
					.describe("Scene to export; omit for the active/main scene."),
				name: z
					.string()
					.min(1)
					.max(110)
					.optional()
					.describe("Safe display stem for the generated files."),
			},
			annotations: mutating,
		},
		async ({ projectId: id, baseRevision, sceneId, name }) => {
			try {
				return asText(
					await exportFcpxml({
						projectId: id,
						baseRevision,
						sceneId,
						name,
					}),
				);
			} catch (error) {
				return asError({
					code: error.code ?? "interchange_failed",
					message: error.message,
					...(typeof error.revision === "number"
						? { revision: error.revision }
						: {}),
				});
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
					.describe(
						"Applied in order. Later operations see the results of earlier ones.",
					),
				baseRevision: z
					.number()
					.int()
					.nonnegative()
					.describe(
						"The revision from read_project. Stale values are refused, never merged.",
					),
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
				const onDisk =
					typeof document.revision === "number" ? document.revision : 0;
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
				const mediaIndex = await mediaIndexOf({ projectId: id }).catch(
					() => ({}),
				);
				let working = document;
				const applied = [];
				for (const [index, operation] of operations.entries()) {
					try {
						const result = applyOperationToDocument({
							document: working,
							operation,
							mediaIndex,
						});
						working = result.document;
						applied.push({
							index,
							type: operation.type,
							changed: result.changed,
						});
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
				const changedAny =
					documentFingerprint(document) !== documentFingerprint(working);
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
					document: refreshDerivedMetadata({
						document: working,
						now: new Date().toISOString(),
					}),
					baseRevision: onDisk,
				});
				{
					const counts = {};
					for (const entry of applied)
						counts[entry.type] = (counts[entry.type] ?? 0) + 1;
					postActivity(
						id,
						Object.entries(counts)
							.map(([type, n]) => (n > 1 ? `${type} ×${n}` : type))
							.join(", "),
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
		"open_editor",
		{
			description:
				"Open (or find) an editor tab for a project in the debug Chrome, and wait until it is drivable. This is what makes render_frames and start_export work with nobody at the keyboard — they need a live page, but not a human to have clicked the project open. Reuses an existing tab for the project.",
			inputSchema: {
				projectId: z.string().min(1).describe("From list_projects."),
			},
			annotations: mutating,
		},
		async ({ projectId: id }) => {
			try {
				const { alreadyOpen, target, createdTabId } = await openEditorTab({
					projectId: id,
					onTabCreated: (tabId) => agentOpenedTabs.add(tabId),
				});
				if (createdTabId) agentOpenedTabs.add(createdTabId);
				return asText({ ok: true, alreadyOpen, url: target.url });
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
					hint: error.hint,
				});
			}
		},
	);

	server.registerTool(
		"close_editor",
		{
			description:
				"Close the project's editor tab in the debug Chrome. Refuses to close a tab this server did not open (a human may be working in it) unless force is set. Use after a headless open_editor → render/export sequence to clean up.",
			inputSchema: {
				projectId: z.string().min(1),
				force: z
					.boolean()
					.optional()
					.describe(
						"Close the tab even though this server did not open it. Only when certain no human is using it.",
					),
			},
			annotations: mutating,
		},
		async ({ projectId: id, force }) => {
			try {
				const target = await findEditorTarget({ projectId: id });
				if (!agentOpenedTabs.has(target.id) && force !== true) {
					return asError({
						code: "not_agent_tab",
						message: `The editor tab for ${id} was not opened by this server — a human may be working in it.`,
						hint: "Pass force: true if you are certain it should close anyway.",
					});
				}
				const result = await closeEditorTab({ projectId: id });
				agentOpenedTabs.delete(result.tabId);
				return asText(result);
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
					hint: error.hint,
				});
			}
		},
	);

	server.registerTool(
		"inspect_media",
		{
			description:
				"LOOK at a source asset: one contact-sheet JPEG sampling N moments, source timecode burned into each cell, plus a cell→seconds map. Sixteen moments for one image's cost — survey footage with this, then trim by the timecodes you saw. Needs no browser. Defaults to uniform sampling; pass atSeconds to inspect specific moments (a suspected cut point, a shot boundary from analyze_audio silences).",
			inputSchema: {
				projectId: z.string().min(1),
				assetId: z.string().min(1).describe("From list_media."),
				count: z
					.number()
					.int()
					.min(1)
					.max(25)
					.optional()
					.describe(
						"Uniform sample count (default 16). Ignored when atSeconds is given.",
					),
				atSeconds: z
					.array(z.number().finite().nonnegative())
					.min(1)
					.max(25)
					.optional()
					.describe(
						"Exact SOURCE-media seconds to sample instead of uniform spacing.",
					),
				cellWidth: z
					.number()
					.int()
					.min(160)
					.max(640)
					.optional()
					.describe(
						"Cell width in px (default 320). Use the default to find, then a second call with atSeconds + 640 to confirm fine detail.",
					),
			},
			annotations: readOnly,
		},
		async ({ projectId: id, assetId, count, atSeconds, cellWidth }) => {
			try {
				const sheet = await inspectMedia({
					projectId: id,
					assetId,
					count,
					atSeconds,
					cellWidth,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									asset: sheet.asset,
									grid: sheet.grid,
									labeled: sheet.labeled,
									cells: sheet.cells,
								},
								null,
								2,
							),
						},
						{ type: "image", data: sheet.jpegBase64, mimeType: "image/jpeg" },
					],
				};
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
			}
		},
	);

	server.registerTool(
		"inspect_media_scenes",
		{
			description:
				"Scene-aware multimodal look at one SOURCE video. ffmpeg detects visual cut points, samples the midpoint of each shot, and returns one labeled contact sheet plus exact source seconds. After interpreting the image, call save_media_analysis.",
			inputSchema: {
				projectId: z.string().min(1),
				assetId: z
					.string()
					.min(1)
					.describe("From list_media or read_media_catalog."),
				threshold: z
					.number()
					.min(0.05)
					.max(0.95)
					.optional()
					.describe(
						"Scene-change sensitivity; default 0.32. Lower finds more cuts.",
					),
				maxScenes: z.number().int().min(1).max(25).optional(),
				cellWidth: z.number().int().min(160).max(640).optional(),
			},
			annotations: readOnly,
		},
		async ({ projectId: id, assetId, threshold, maxScenes, cellWidth }) => {
			try {
				const { detection, sheet } = await inspectMediaScenes({
					projectId: id,
					assetId,
					...(threshold !== undefined ? { threshold } : {}),
					...(maxScenes !== undefined ? { maxScenes } : {}),
					...(cellWidth !== undefined ? { cellWidth } : {}),
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									schemaVersion: "opencut.scene-inspection.v1",
									detection,
									grid: sheet.grid,
									labeled: sheet.labeled,
									cells: sheet.cells,
									next: "Interpret this contact sheet multimodally, then call save_media_analysis with scene intervals, descriptions, tags, and summary.",
								},
								null,
								2,
							),
						},
						{ type: "image", data: sheet.jpegBase64, mimeType: "image/jpeg" },
					],
				};
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
			}
		},
	);

	server.registerTool(
		"inspect_timeline_range",
		{
			description:
				"Look at a TIMELINE interval without a browser. Maps uniformly spaced timeline moments through trims/constant or curve speed/reverse into source-media seconds, groups them per asset, and returns one contact sheet per source. This is the tool named by range references in opencut.agent-context.v1.",
			inputSchema: {
				projectId: z.string().min(1),
				sceneId: z.string().min(1).optional(),
				startSeconds: z.number().finite().nonnegative(),
				endSeconds: z.number().finite().positive(),
				maxFrames: z.number().int().min(1).max(25).optional(),
				cellWidth: z.number().int().min(160).max(640).optional(),
			},
			annotations: readOnly,
		},
		async ({
			projectId: id,
			sceneId,
			startSeconds,
			endSeconds,
			maxFrames,
			cellWidth,
		}) => {
			try {
				const document = await readProject({ projectId: id });
				const plan = planTimelineRangeInspection({
					document,
					...(sceneId ? { sceneId } : {}),
					startSeconds,
					endSeconds,
					...(maxFrames !== undefined ? { maxFrames } : {}),
				});
				const mediaIndex = await mediaIndexOf({ projectId: id }).catch(
					() => ({}),
				);
				const content = [
					{
						type: "text",
						text: JSON.stringify(
							{
								...plan,
								next: "Read every returned contact sheet as one time sequence. Persist reusable per-asset observations with save_media_analysis before editing.",
							},
							null,
							2,
						),
					},
				];
				for (const group of Object.values(plan.byAsset)) {
					const asset = mediaIndex[group.assetId];
					if (!asset || asset.type === "audio") {
						content.push({
							type: "text",
							text: JSON.stringify({
								assetId: group.assetId,
								warning: asset
									? "Asset has no visual stream."
									: "Asset is missing from media index.",
							}),
						});
						continue;
					}
					const duration =
						typeof asset.duration === "number" && asset.duration > 0
							? asset.duration
							: null;
					const validTimes =
						asset.type === "image"
							? [0]
							: group.sourceSeconds.filter(
									(value) =>
										duration === null || (value >= 0 && value < duration),
								);
					if (validTimes.length === 0) {
						content.push({
							type: "text",
							text: JSON.stringify({
								assetId: group.assetId,
								warning:
									"Every mapped source time is outside the decodable asset duration.",
								requestedSourceSeconds: group.sourceSeconds,
								durationSeconds: duration,
							}),
						});
						continue;
					}
					const sheet = await inspectMedia({
						projectId: id,
						assetId: group.assetId,
						atSeconds: validTimes,
						...(cellWidth !== undefined ? { cellWidth } : {}),
					});
					content.push({
						type: "text",
						text: JSON.stringify(
							{
								assetId: group.assetId,
								assetName: asset.name ?? group.assetId,
								timelineSamples: group.samples,
								cells: sheet.cells,
								grid: sheet.grid,
							},
							null,
							2,
						),
					});
					content.push({
						type: "image",
						data: sheet.jpegBase64,
						mimeType: "image/jpeg",
					});
				}
				return { content };
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"build_media_catalog",
		{
			description:
				"Build or refresh agent/media-catalog.json for every project asset: compact technical facts, all timeline uses, stable opencut:// URI, and preserved multimodal analysis. Thumbnails/data URLs and private storage ids are excluded.",
			inputSchema: { projectId: z.string().min(1) },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ projectId: id }) => {
			try {
				const document = await readProject({ projectId: id });
				const mediaIndex = await mediaIndexOf({ projectId: id }).catch(
					() => ({}),
				);
				const existingCatalog = await readMediaCatalog({ projectId: id });
				const catalog = buildMediaCatalog({
					document,
					mediaIndex,
					existingCatalog,
				});
				const result = await writeMediaCatalog({ projectId: id, catalog });
				return asText({
					ok: true,
					projectId: id,
					assetCount: Object.keys(catalog.assets).length,
					path: result.path,
					catalog,
				});
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"read_media_catalog",
		{
			description:
				"Read the persisted Agent-readable media JSON sidecar. It contains technical metadata, timeline uses, and prior Codex/human scene observations so later turns do not need to re-inspect known footage.",
			inputSchema: { projectId: z.string().min(1) },
			annotations: readOnly,
		},
		async ({ projectId: id }) => {
			try {
				const catalog = await readMediaCatalog({ projectId: id });
				if (!catalog) {
					return asError({
						code: "media_catalog_missing",
						message: `Project ${id} has no media catalog yet.`,
						hint: "Call build_media_catalog once, then inspect_media_scenes or inspect_timeline_range and save_media_analysis.",
					});
				}
				return asText(catalog);
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"save_media_analysis",
		{
			description:
				"Persist the multimodal observations you made from inspect_media_scenes/inspect_timeline_range into agent/media-catalog.json. This does not modify the edit timeline or project revision.",
			inputSchema: {
				projectId: z.string().min(1),
				assetId: z.string().min(1),
				analysis: MediaAnalysisSchema,
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ projectId: id, assetId, analysis }) => {
			try {
				const { path, catalog } = await saveMediaAnalysis({
					projectId: id,
					assetId,
					analysis,
				});
				return asText({
					ok: true,
					projectId: id,
					assetId,
					path,
					analysis: catalog.assets[assetId].analysis,
				});
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"lint_cut",
		{
			description:
				"Mechanical check of the cut in milliseconds, no browser: main-track gaps, overlaps, sliver clips, trims past the source footage, missing media, dead spans with nothing anywhere, runtime vs the brief. Run this BEFORE rendering or exporting — every defect it catches is one that no longer costs a look. Advisory: findings never block anything, and a lint-clean cut can still be boring.",
			inputSchema: {
				projectId: z.string().min(1),
				targetDurationSeconds: z
					.number()
					.positive()
					.optional()
					.describe("The brief's target runtime. Flags drift beyond 10%."),
				minClipSeconds: z
					.number()
					.positive()
					.optional()
					.describe(
						"Clips shorter than this are flagged as slivers. Default 0.5; lower it for deliberate machine-gun montage.",
					),
			},
			annotations: readOnly,
		},
		async ({ projectId: id, targetDurationSeconds, minClipSeconds }) => {
			try {
				const document = await readProject({ projectId: id });
				const mediaIndex = await mediaIndexOf({ projectId: id }).catch(
					() => ({}),
				);
				return asText(
					lintDocument({
						document,
						mediaIndex,
						targetDurationSeconds,
						minClipSeconds,
					}),
				);
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
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
					.describe(
						"Anything quieter counts as silence. Default -35 dB; use -45 for quiet rooms, -25 for noisy footage.",
					),
				minSilenceSeconds: z
					.number()
					.positive()
					.optional()
					.describe(
						"Gaps shorter than this are not reported. Default 0.35s — below a natural speech pause.",
					),
			},
			annotations: readOnly,
		},
		async ({ projectId: id, assetId, noiseFloorDb, minSilenceSeconds }) => {
			try {
				return asText(
					await analyzeAudio({
						projectId: id,
						assetId,
						noiseFloorDb,
						minSilenceSeconds,
					}),
				);
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
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
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
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
					.describe(
						"Absolute path to a video, audio, or image file on this machine.",
					),
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
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
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
						.map((element) => ({
							trackId: track.id,
							elementId: element.id,
							name: element.name,
						})),
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
							elements: referencing.map(({ trackId, elementId }) => ({
								trackId,
								elementId,
							})),
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
					return asError({
						code: "delete_failed",
						message: `${response.status} ${response.statusText}`,
					});
				}
				return asText({
					ok: true,
					assetId,
					removedClips: orphanedClips === "delete" ? referencing : [],
					orphanedClips: orphanedClips === "keep" ? referencing : [],
				});
			} catch (error) {
				return asError({
					code: error.code ?? "driver_error",
					message: error.message,
				});
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
				const response = await fetch(
					`${base}/api/projects/${encodeURIComponent(id)}/revisions`,
				);
				if (!response.ok)
					return asError({
						code: "request_failed",
						message: `${response.status}`,
					});
				return asText(await response.json());
			} catch (error) {
				return asError({
					code: "driver_error",
					message: String(error?.message ?? error),
				});
			}
		},
	);

	server.registerTool(
		"compare_revision",
		{
			description:
				"Compare the current project timeline with a saved revision before restoring it. Returns structured add, remove, move, rename, and content-change counts plus per-clip details.",
			inputSchema: {
				projectId: z.string().min(1),
				revision: z.number().int().positive().describe("From list_revisions."),
			},
			annotations: readOnly,
		},
		async ({ projectId: id, revision }) => {
			try {
				const base = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
				const response = await fetch(
					`${base}/api/projects/${encodeURIComponent(id)}/compare/${revision}`,
				);
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					return asError({
						code: "compare_failed",
						message: payload.error ?? `${response.status}`,
					});
				}
				return asText(payload);
			} catch (error) {
				return asError({
					code: "driver_error",
					message: String(error?.message ?? error),
				});
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
				const document = await readProject({ projectId: id });
				const expectedRevision =
					typeof document.revision === "number" ? document.revision : 0;
				const response = await fetch(
					`${base}/api/projects/${encodeURIComponent(id)}/restore/${revision}`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ expectedRevision }),
					},
				);
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					return asError({
						code: "restore_failed",
						message: payload.error ?? `${response.status}`,
					});
				}
				postActivity(id, `restored revision ${revision}`, payload.revision);
				return asText(payload);
			} catch (error) {
				return asError({
					code: "driver_error",
					message: String(error?.message ?? error),
				});
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
					.describe(
						"Wait until the editor has loaded AT LEAST this file revision. Defaults to the file's current revision.",
					),
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
					target =
						typeof document.revision === "number" ? document.revision : 0;
				} catch (error) {
					return asError({
						code: error.code ?? "driver_error",
						message: error.message,
					});
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
						return asText({
							synced: true,
							waitedForRevision: target,
							state: payload,
						});
					}
				}
				// The editor reloads itself when the file moves, so transient
				// bridge_missing windows are expected here, not failures.
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			return asError({
				code: "sync_timeout",
				message: `The editor did not reach file revision ${target} within ${timeoutSeconds}s. It may be closed, on another project, or blocked by unsaved human edits.`,
				lastSeen: last
					? {
							projectId: last.projectId,
							loadedFileRevision: last.loadedFileRevision,
						}
					: null,
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
					.max(24)
					.describe(
						"Timeline positions in seconds. Clamped to the last frame; the result says where it actually rendered. Untiled calls cap at 8; tile:true takes up to 24.",
					),
				tile: z
					.boolean()
					.optional()
					.describe(
						"Return ONE labeled contact-sheet JPEG instead of full-res PNGs — up to 24 moments for one image's cost. Survey with this; re-render specific times untiled to inspect fine detail.",
					),
				maxDim: z
					.number()
					.int()
					.min(160)
					.max(640)
					.optional()
					.describe(
						"Tile cell width in px (default 320). Only with tile:true.",
					),
				projectId,
			},
			annotations: readOnly,
		},
		async ({ atSeconds, tile, maxDim, projectId: id }) => {
			const response = await bridge({
				method: "renderFrames",
				args: [{ atSeconds, ...(tile ? { tile, maxDim } : {}) }],
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
											...(f.tile ? { tile: f.tile } : {}),
										},
							),
						},
						null,
						2,
					),
				},
			];
			for (const frame of payload.frames) {
				if (frame.jpegBase64) {
					content.push({
						type: "image",
						data: frame.jpegBase64,
						mimeType: "image/jpeg",
					});
				} else if (frame.pngBase64) {
					content.push({
						type: "image",
						data: frame.pngBase64,
						mimeType: "image/png",
					});
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
				quality: z
					.enum(["low", "medium", "high", "very_high", "draft"])
					.default("high")
					.describe(
						"draft = review preset: 12fps + low bitrate, roughly 3x faster, '-draft' branded filename. Iterate on drafts; export a real quality once, at the end.",
					),
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
			// Fail CLOSED: if the staleness check cannot run, refuse the export.
			// Skipping the guard and starting anyway is how a mid-reload editor
			// quietly renders a video of the previous cut — the exact outcome the
			// guard exists to stop.
			if (state.isError) return state;
			{
				const payload = JSON.parse(state.content[0].text);
				if (
					payload.projectId &&
					typeof payload.loadedFileRevision === "number"
				) {
					const onDisk = await readProject({ projectId: payload.projectId })
						.then((document) =>
							typeof document.revision === "number" ? document.revision : null,
						)
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
				args: [
					{
						options: { format, quality, includeAudio },
						...(name ? { name } : {}),
					},
				],
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
					.describe("BCP-47-ish code, or omit for auto-detect."),
				projectId,
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ language, projectId: id }) =>
			bridge({
				method: "startTranscribe",
				args: [{ language }],
				projectId: id,
			}),
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

const isEntrypoint =
	process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
	const server = createOpenCutMcpServer();
	await server.connect(new StdioServerTransport());
}
