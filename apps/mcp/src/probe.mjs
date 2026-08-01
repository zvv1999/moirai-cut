#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { callBridge } from "./cdp.mjs";

/**
 * End-to-end check over the real MCP transport.
 *
 * Deliberately spawns the server as a subprocess and speaks stdio JSON-RPC to
 * it, rather than calling the tool handlers in-process: the thing worth proving
 * is that an agent on the other side of the protocol can move the editor, and
 * an in-process call would skip the whole layer that could be wrong.
 *
 * Requires a Chrome on the debugging port with a OneCut editor tab open.
 */

const serverPath = fileURLToPath(new URL("./server.mjs", import.meta.url));
const results = [];

// Idempotency keys are remembered for the life of the page. Fixed keys would
// make a second probe run against the same tab dedupe against the first one and
// report failures that are really the guard doing its job — so each run gets its
// own namespace, while reuse WITHIN a run still exercises replay protection.
const RUN = randomUUID().slice(0, 8);
const key = (name) => `probe-${RUN}-${name}`;

function parse(response) {
	const text = response.content?.[0]?.text ?? "{}";
	return { isError: Boolean(response.isError), payload: JSON.parse(text) };
}

function check(name, condition, detail) {
	results.push({ name, ok: Boolean(condition), detail });
	const mark = condition ? "PASS" : "FAIL";
	console.log(`${mark}  ${name}${detail ? `\n      ${detail}` : ""}`);
}

const client = new Client({ name: "opencut-probe", version: "0.1.0" });
await client.connect(
	new StdioClientTransport({ command: process.execPath, args: [serverPath] }),
);

const tools = await client.listTools();
const toolNames = tools.tools.map((t) => t.name);
check(
	"server advertises the tab-driving tools over MCP",
	// Named, not counted: a count assertion fails every time a tool is added,
	// which is noise rather than a regression.
	[
		"status",
		"get_state",
		"list_operations",
		"apply_operation",
		"render_frames",
		"undo",
		"redo",
	].every((name) => toolNames.includes(name)),
	toolNames.join(", "),
);

// The editor reloads itself whenever the project file changes, so any call can
// land in a window where the bridge is briefly gone. That is normal operation
// now, not flakiness — so a transient outage is waited out rather than failed.
const TRANSIENT = new Set([
	"bridge_missing",
	"target_gone",
	"no_editor_tab",
	"driver_error",
]);
const call = async (name, args = {}) => {
	let result;
	for (let attempt = 0; attempt < 12; attempt += 1) {
		result = parse(await client.callTool({ name, arguments: args }));
		if (!result.isError || !TRANSIENT.has(result.payload.code)) return result;
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}
	return result;
};

// The editor reloads itself whenever the project file changes underneath it, so
// the bridge can legitimately be absent for a few seconds. Waiting for it is
// part of the contract now, not a workaround for flakiness.
const status = await (async () => {
	let last;
	for (let attempt = 0; attempt < 15; attempt += 1) {
		last = await call("status");
		if (!last.isError && last.payload.bridgeInstalled) return last;
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}
	return last;
})();
if (status.isError || !status.payload.bridgeInstalled) {
	console.error(
		`\nCannot reach the editor: ${status.payload.message ?? status.payload.why}\n${status.payload.hint ?? ""}`,
	);
	await client.close();
	process.exit(2);
}
check(
	"status reaches a live editor tab",
	status.payload.connected,
	status.payload.tab?.url,
);

const vocabulary = await call("list_operations");
check(
	"list_operations reads the page's own registry",
	Array.isArray(vocabulary.payload.operations) &&
		vocabulary.payload.operations.includes("track.toggleMute"),
	JSON.stringify(vocabulary.payload.operations),
);

const before = await call("get_state");
const baseRevision = before.payload.revision;
const projectId = before.payload.projectId;
const track = before.payload.tracks?.[0];
check(
	"get_state returns a revision, a project id, and real track ids",
	typeof baseRevision === "number" && Boolean(projectId) && Boolean(track?.id),
	`revision=${baseRevision} project=${projectId} tracks=${before.payload.tracks?.length}`,
);
if (before.isError || !track?.id || !projectId) {
	// Everything below dereferences these; bail with the summary rather than
	// dying on a TypeError and losing the exit code.
	console.error(`\nCannot continue: ${JSON.stringify(before.payload)}`);
	await client.close();
	process.exit(1);
}

// 1. A real mutation, through the protocol.
const applied = await call("apply_operation", {
	operation: { type: "track.toggleMute", trackId: track.id },
	baseRevision,
	projectId,
	idempotencyKey: key("mute-1"),
});
check(
	"apply_operation mutates the editor and advances the revision",
	applied.payload.applied === true &&
		applied.payload.revision === baseRevision + 1,
	JSON.stringify(applied.payload),
);

// 2. The same key again: exactly-once, not twice.
const replay = await call("apply_operation", {
	operation: { type: "track.toggleMute", trackId: track.id },
	baseRevision: applied.payload.revision,
	projectId,
	idempotencyKey: key("mute-1"),
});
check(
	"a replayed idempotency key is deduplicated",
	replay.payload.deduplicated === true &&
		replay.payload.revision === applied.payload.revision,
	JSON.stringify(replay.payload),
);

// 3. A stale revision must be refused, not merged.
const stale = await call("apply_operation", {
	operation: { type: "track.toggleMute", trackId: track.id },
	baseRevision,
	projectId,
	idempotencyKey: key("stale"),
});
check(
	"a stale baseRevision is rejected as a conflict",
	stale.isError && stale.payload.code === "revision_conflict",
	JSON.stringify(stale.payload),
);

// 4. The editor neutralises element-less tracks — that must not read as success.
const pruned = await call("apply_operation", {
	operation: { type: "track.add", trackType: "audio" },
	baseRevision: applied.payload.revision,
	projectId,
	idempotencyKey: key("add"),
});
check(
	"a command the editor neutralises reports noEffect, not success",
	pruned.payload.applied === false && pruned.payload.noEffect === true,
	JSON.stringify(pruned.payload),
);

// 5. A wrong project id is refused at tab selection, before any evaluation.
const wrongProject = await call("apply_operation", {
	operation: { type: "track.toggleMute", trackId: track.id },
	baseRevision: applied.payload.revision,
	projectId: "00000000-0000-4000-8000-000000000000",
	idempotencyKey: key("wrong-project"),
});
check(
	"a wrong project id finds no tab to drive",
	wrongProject.isError && wrongProject.payload.code === "no_editor_tab",
	JSON.stringify(wrongProject.payload),
);

// 6. The document guard itself, which the check above never reaches: right tab,
// right revision, wrong document. Driven at the bridge because the MCP layer
// deliberately uses one id for both tab selection and document identity, so it
// cannot construct this mismatch — only a second writer (the human switching
// projects mid-flight) can, and that is exactly what this guards.
// Direct bridge call, so it needs its own retry: it bypasses the MCP `call`
// helper above, and the editor reloads itself whenever the project file changes.
const callGuard = async () => {
	for (let attempt = 0; attempt < 12; attempt += 1) {
		const response = await callBridge({
			method: "applyOperation",
			args: [
				{
					operation: { type: "track.toggleMute", trackId: track.id },
					baseRevision: applied.payload.revision,
					idempotencyKey: key("guard"),
					expectedProjectId: "00000000-0000-4000-8000-000000000000",
				},
			],
		}).catch((error) => ({
			value: {
				ok: false,
				error: {
					code: "driver_error",
					message: String(error?.message ?? error),
				},
			},
		}));
		if (!TRANSIENT.has(response.value?.error?.code)) return response;
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}
	return {
		value: {
			ok: false,
			error: { code: "driver_error", message: "bridge never came back" },
		},
	};
};
const guard = await callGuard();
const guardState = await call("get_state");
check(
	"an operation naming a different document is refused, and changes nothing",
	guard.value?.ok === false &&
		guard.value.error.code === "project_mismatch" &&
		guardState.payload.revision === applied.payload.revision,
	JSON.stringify(guard.value?.error ?? guard.value),
);

// 7. The element vocabulary, end to end. Text clips need no media asset, so this
// runs against an empty project — and it cleans up after itself.
const titleName = `probe-title-${RUN}`;
const inserted = await call("apply_operation", {
	operation: {
		type: "element.insert",
		element: {
			type: "text",
			name: titleName,
			startTimeSeconds: 1,
			durationSeconds: 3,
			params: { content: "inserted by probe" },
		},
	},
	baseRevision: (await call("get_state")).payload.revision,
	projectId,
	idempotencyKey: key("insert"),
});
const afterInsert = await call("get_state");
const clip = afterInsert.payload.tracks
	.flatMap((t) => t.elements.map((e) => ({ ...e, trackId: t.id })))
	.find((e) => e.name === titleName);
check(
	"element.insert creates a clip AND the track to hold it",
	inserted.payload.applied === true &&
		Boolean(clip) &&
		clip.startTimeSeconds === 1 &&
		clip.durationSeconds === 3,
	// A bare track.add would be pruned; this survives because one command does both.
	JSON.stringify(clip ?? inserted.payload),
);

if (clip) {
	const moved = await call("apply_operation", {
		operation: {
			type: "element.move",
			moves: [
				{ trackId: clip.trackId, elementId: clip.id, startTimeSeconds: 4.5 },
			],
		},
		baseRevision: afterInsert.payload.revision,
		projectId,
		idempotencyKey: key("move"),
	});
	const afterMove = await call("get_state");
	const movedClip = afterMove.payload.tracks
		.flatMap((t) => t.elements)
		.find((e) => e.id === clip.id);
	check(
		"element.move repositions in seconds, not ticks",
		moved.payload.applied === true &&
			movedClip?.startTimeSeconds === 4.5 &&
			movedClip?.endTimeSeconds === 7.5,
		JSON.stringify(movedClip),
	);

	// A real element id paired with the wrong track must name the problem rather
	// than silently doing nothing.
	const mispaired = await call("apply_operation", {
		operation: {
			type: "element.delete",
			elements: [
				{ trackId: "00000000-0000-4000-8000-000000000000", elementId: clip.id },
			],
		},
		baseRevision: afterMove.payload.revision,
		projectId,
		idempotencyKey: key("mispair"),
	});
	check(
		"a mispaired element reference is diagnosed, not silently ignored",
		mispaired.isError && mispaired.payload.code === "unresolved_reference",
		JSON.stringify(mispaired.payload),
	);

	// Pixel verification: the clip runs 4.5s-7.5s after the move, so a frame at
	// 6s must contain it and a frame at 0.2s must not.
	const rendered = await client.callTool({
		name: "render_frames",
		arguments: { atSeconds: [0.2, 6], projectId },
	});
	const meta = JSON.parse(rendered.content[0].text);
	const images = rendered.content.filter((c) => c.type === "image");
	check(
		"render_frames returns PNGs stamped with the revision they depict",
		images.length === 2 &&
			meta.stable === true &&
			meta.revision === (await call("get_state")).payload.revision &&
			// Not a hardcoded size: the canvas adapts to whatever footage the project
			// holds. What must hold is that every frame of one project agrees.
			new Set(meta.frames.map((f) => f.size)).size === 1,
		JSON.stringify(meta),
	);

	// Two independent properties, neither of which a broken renderer satisfies:
	// the same time renders identically (deterministic), and different times
	// render differently (time is actually honoured rather than ignored).
	const repeat = await client.callTool({
		name: "render_frames",
		arguments: { atSeconds: [6], projectId },
	});
	const repeatImage = repeat.content.find((c) => c.type === "image");
	check(
		"the same time renders deterministically, and a different time does not",
		// Only two properties, both independent of what else is on the timeline:
		// rendering is a function of (document, time). An earlier version compared
		// PNG sizes and encoded an assumption about compression that was simply
		// wrong for some content.
		images[0].data !== images[1].data && repeatImage?.data === images[1].data,
		`t1=${images[0]?.data.length}B t2=${images[1]?.data.length}B repeat=${repeatImage?.data.length}B`,
	);

	// Clean up every clip this probe created.
	const live = await call("get_state");
	const ours = live.payload.tracks.flatMap((t) =>
		t.elements
			.filter((e) => e.name.startsWith(titleName))
			.map((e) => ({ trackId: t.id, elementId: e.id })),
	);
	const cleaned = await call("apply_operation", {
		operation: { type: "element.delete", elements: ours },
		baseRevision: live.payload.revision,
		projectId,
		idempotencyKey: key("cleanup"),
	});
	const finalState = await call("get_state");
	check(
		"element.delete removes exactly what the probe created",
		cleaned.payload.applied === true &&
			!finalState.payload.tracks
				.flatMap((t) => t.elements)
				.some((e) => e.name.startsWith(titleName)),
		`deleted ${ours.length}`,
	);
}

// 8. undo reverts the LAST command, whatever that was — here, the cleanup delete.
// Checked against what actually preceded it rather than against the mute from
// step 1, which is now seven operations back.
const beforeUndo = await call("get_state");
const undone = await call("undo");
const afterUndo = await call("get_state");
check(
	"undo reverts the last command and advances the revision",
	undone.payload.revision === beforeUndo.payload.revision + 1 &&
		afterUndo.payload.tracks.flatMap((t) => t.elements).length >
			beforeUndo.payload.tracks.flatMap((t) => t.elements).length,
	JSON.stringify(undone.payload),
);

// 9. Redo it, then restore the mute explicitly. Leaving the document as we found
// it matters: this probe runs against whatever project the human has open.
await call("redo");
const preRestore = await call("get_state");
const nowMuted = preRestore.payload.tracks?.find(
	(t) => t.id === track.id,
)?.muted;
if (nowMuted !== track.muted) {
	await call("apply_operation", {
		operation: { type: "track.toggleMute", trackId: track.id },
		baseRevision: preRestore.payload.revision,
		projectId,
		idempotencyKey: key("restore-mute"),
	});
}
const after = await call("get_state");
const restored = after.payload.tracks?.find((t) => t.id === track.id);
check(
	"the document is left exactly as the probe found it",
	Boolean(restored) &&
		restored.muted === track.muted &&
		!after.payload.tracks
			.flatMap((t) => t.elements)
			.some((e) => e.name.startsWith(titleName)),
	`mute before=${track.muted} after=${restored?.muted}`,
);

await client.close();

const failed = results.filter((r) => !r.ok);
console.log(
	`\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length === 0 ? 0 : 1);
