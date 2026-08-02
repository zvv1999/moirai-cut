#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

/**
 * The whole loop, over real MCP: compose an edit against the project FILE with
 * no browser involved, then confirm the running editor followed the file and
 * that the rendered pixels match what was asked for.
 *
 * This is the thing the CDP probe cannot show. There, every edit went through a
 * live tab; here the edit is a file write, and the browser is a viewer that
 * happens to be watching. Needs `bun dev` and, for the pixel checks only, a
 * Chrome on the debugging port with the project open.
 */

import { randomUUID } from "node:crypto";

const serverPath = fileURLToPath(new URL("./server.mjs", import.meta.url));
const results = [];
// Unique per run so a replayed idempotency key from a previous run cannot make
// this run's edit look like a duplicate.
const RUN = randomUUID().slice(0, 8);

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
}

const client = new Client({ name: "opencut-file-probe", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath] }));

const call = async (name, args = {}) => {
  let response;
  try {
    response = await client.callTool({ name, arguments: args });
  } catch (error) {
    // Schema rejection arrives as a thrown protocol error, not a tool result.
    // Treating it as a crash would hide the very validation this layer adds.
    return { isError: true, payload: { code: "schema_rejected", message: String(error?.message ?? error) }, content: [] };
  }
  return {
    isError: Boolean(response.isError),
    payload: JSON.parse(response.content[0].text),
    content: response.content,
  };
};

/**
 * Re-read and retry on a revision conflict.
 *
 * This is not defensive padding — it is the normal operating mode. The human's
 * editor autosaves on its own schedule, so an agent holding a revision from a
 * moment ago will lose the race routinely. The CAS is what makes that safe:
 * the edit is refused rather than clobbering, and the correct response is to
 * re-read and re-decide, which is exactly what an agent should do.
 */
const editWithRetry = async ({ projectId: id, buildOperations, attempts = 5 }) => {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await call("read_project", { projectId: id });
    if (state.isError) return state;
    const operations = buildOperations(state.payload);
    if (!operations || operations.length === 0) return { isError: false, payload: { state: state.payload }, content: [] };
    last = await call("edit_project", {
      projectId: id,
      baseRevision: state.payload.revision,
      operations,
    });
    if (!last.isError || last.payload.code !== "revision_conflict") return last;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return last;
};

const bail = async (message) => {
  console.error(`\n${message}`);
  await client.close();
  process.exit(2);
};

// ---------------------------------------------------------------------------
// 1. Find a project without touching a browser.
// ---------------------------------------------------------------------------
const projects = await call("list_projects");
if (projects.isError || !projects.payload.ids?.length) {
  await bail(`No project files on disk: ${JSON.stringify(projects.payload)}`);
}
check(
  "list_projects reads the project directory with no browser",
  projects.payload.ids.length > 0 && typeof projects.payload.root === "string",
  `${projects.payload.ids.length} project(s) in ${projects.payload.root}`,
);

// A throwaway project of our own. Probing ids[0] — whatever happens to sort
// first in the human's project directory — meant scribbling card-* clips into
// a real project and demanding the human have exactly that one open in a tab.
const createdProbe = await call("create_project", { name: `probe-file-${RUN}` });
if (createdProbe.isError) await bail(`create_project failed: ${JSON.stringify(createdProbe.payload)}`);
const projectId = createdProbe.payload.projectId;

// Its own tab, so the follow/pixel checks depend on nothing the human did.
// No Chrome on the port degrades those checks, not the file checks.
const CDP_BASE = "http://127.0.0.1:9222";
const WEB_BASE = process.env.OPENCUT_BASE_URL ?? "http://localhost:3000";
const probeTab = await (async () => {
  try {
    const { evaluateInPage } = await import("./cdp.mjs");
    const tab = await (await fetch(`${CDP_BASE}/json/new`, { method: "PUT" })).json();
    await evaluateInPage({
      webSocketDebuggerUrl: tab.webSocketDebuggerUrl,
      expression: `location.href = ${JSON.stringify(`${WEB_BASE}/editor/${projectId}`)}`,
    });
    return tab;
  } catch {
    return null;
  }
})();

// Start from a known slate. A probe that depends on whatever a previous run left
// behind does not test what it claims to: leftover clips silently filled the
// timeline gap this run needs to be empty, and the pixel check passed or failed
// on history rather than on this run's edit.
const existing = await call("read_project", { projectId });
if (existing.isError) await bail(`read_project failed: ${JSON.stringify(existing.payload)}`);
const leftovers = existing.payload.tracks.flatMap((t) =>
  t.elements.filter((e) => e.name.startsWith("card-")).map((e) => ({ trackId: t.id, elementId: e.id })),
);
await editWithRetry({
  projectId,
  buildOperations: (state) => {
    const stale = state.tracks.flatMap((t) =>
      t.elements.filter((e) => e.name.startsWith("card-")).map((e) => ({ trackId: t.id, elementId: e.id })),
    );
    return stale.length > 0 ? [{ type: "element.delete", elements: stale }] : [];
  },
});

const before = await call("read_project", { projectId });
if (before.isError) await bail(`read_project failed: ${JSON.stringify(before.payload)}`);
check(
  "read_project returns a revision and addressable state",
  typeof before.payload.revision === "number" && Array.isArray(before.payload.tracks),
  `revision=${before.payload.revision} tracks=${before.payload.tracks.length}`,
);

// ---------------------------------------------------------------------------
// 2. Compose a real edit: a three-card title sequence, in one atomic batch.
// ---------------------------------------------------------------------------
const CARDS = [
  { name: "card-one", content: "ONE", startTimeSeconds: 0, durationSeconds: 2 },
  { name: "card-two", content: "TWO", startTimeSeconds: 2, durationSeconds: 2 },
  { name: "card-three", content: "THREE", startTimeSeconds: 4, durationSeconds: 2 },
];

const built = await editWithRetry({
  projectId,
  buildOperations: () => CARDS.map((card) => ({
    type: "element.insert",
    element: {
      type: "text",
      name: card.name,
      startTimeSeconds: card.startTimeSeconds,
      durationSeconds: card.durationSeconds,
      params: { content: card.content },
    },
  })),
});
if (built.isError) await bail(`edit_project failed: ${JSON.stringify(built.payload)}`);

const placed = built.payload.state.tracks.flatMap((t) =>
  t.elements.map((e) => ({ ...e, trackId: t.id })),
);
check(
  "edit_project builds a three-card sequence in one atomic batch",
  CARDS.every((card) =>
    placed.some(
      (e) =>
        e.name === card.name &&
        e.startTimeSeconds === card.startTimeSeconds &&
        e.durationSeconds === card.durationSeconds,
    ),
  ),
  placed.map((e) => `${e.name}@${e.startTimeSeconds}-${e.endTimeSeconds}s`).join("  "),
);

// ---------------------------------------------------------------------------
// 3. A stale revision, and a batch with one bad step, must both change nothing.
// ---------------------------------------------------------------------------
const stale = await call("edit_project", {
  projectId,
  baseRevision: before.payload.revision,
  operations: [
    { type: "element.rename", elements: [{ trackId: placed[0].trackId, elementId: placed[0].id, name: "nope" }] },
  ],
});
check(
  "a stale baseRevision is refused",
  stale.isError && stale.payload.code === "revision_conflict",
  JSON.stringify(stale.payload).slice(0, 160),
);

const current = await call("read_project", { projectId });
const partial = await call("edit_project", {
  projectId,
  baseRevision: current.payload.revision,
  operations: [
    // First is valid, second is not: neither may land.
    { type: "element.rename", elements: [{ trackId: placed[0].trackId, elementId: placed[0].id, name: "SHOULD-NOT-STICK" }] },
    { type: "element.delete", elements: [{ trackId: placed[0].trackId, elementId: "does-not-exist" }] },
  ],
});
const afterPartial = await call("read_project", { projectId });
check(
  "a batch with one bad step leaves the file untouched",
  partial.isError &&
    partial.payload.appliedNothing === true &&
    afterPartial.payload.revision === current.payload.revision &&
    !afterPartial.payload.tracks.flatMap((t) => t.elements).some((e) => e.name === "SHOULD-NOT-STICK"),
  JSON.stringify(partial.payload).slice(0, 200),
);

// ---------------------------------------------------------------------------
// 4. Refine the sequence — the operations compose, later ones see earlier ones.
// ---------------------------------------------------------------------------
const two = placed.find((e) => e.name === "card-two");
const refined = await editWithRetry({
  projectId,
  buildOperations: () => [
    { type: "element.move", moves: [{ trackId: two.trackId, elementId: two.id, startTimeSeconds: 2.5 }] },
    { type: "element.trim", elements: [{ trackId: two.trackId, elementId: two.id, durationSeconds: 1 }] },
    { type: "element.rename", elements: [{ trackId: two.trackId, elementId: two.id, name: "card-two-refined" }] },
  ],
});
const refinedTwo = refined.payload.state?.tracks
  .flatMap((t) => t.elements)
  .find((e) => e.id === two.id);
check(
  "operations compose within a batch",
  !refined.isError &&
    refinedTwo?.startTimeSeconds === 2.5 &&
    refinedTwo?.durationSeconds === 1 &&
    refinedTwo?.name === "card-two-refined",
  JSON.stringify(refinedTwo),
);

// ---------------------------------------------------------------------------
// 5. The frontend must follow the file, and its pixels must match.
// ---------------------------------------------------------------------------
const editorFollowed = await (async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const state = await call("get_state", { projectId });
    if (state.isError) continue;
    const names = state.payload.tracks.flatMap((t) => t.elements).map((e) => e.name);
    if (names.includes("card-one") && names.includes("card-three")) return names;
  }
  return null;
})();
check(
  "the running editor follows the file with no CDP write",
  editorFollowed !== null,
  editorFollowed ? editorFollowed.join(", ") : "editor never picked up the file change",
);

if (editorFollowed) {
  // card-one covers 0-2s, card-three covers 4-6s, and 3.5s falls in the gap the
  // move+trim opened up. Different content must produce different pixels.
  const frames = await call("render_frames", { atSeconds: [1, 3.5, 5], projectId });
  const images = frames.content.filter((c) => c.type === "image");
  check(
    "render_frames returns a frame per requested moment",
    !frames.isError && images.length === 3 && frames.payload.stable === true,
    JSON.stringify(frames.payload.frames),
  );
  check(
    "different moments of the edit render differently",
    // Deliberately not a claim about which frame compresses smallest: the
    // project may hold other footage, and PNG size is a poor proxy for content.
    // What the edit guarantees is that these three moments are distinct.
    images.length === 3 &&
      new Set(images.map((image) => image.data)).size === 3,
    `1s=${images[0]?.data.length}B  3.5s=${images[1]?.data.length}B  5s=${images[2]?.data.length}B`,
  );
}

// ---------------------------------------------------------------------------
// 5b. EQUIVALENCE: the file implementation and the editor's own Command must
// produce the same document for the same operation. Two implementations of one
// vocabulary is the standing risk in this design, and this is the check that
// would catch them drifting.
// ---------------------------------------------------------------------------
if (editorFollowed) {
  const shape = (state) =>
    JSON.stringify(
      state.tracks
        .flatMap((t) => t.elements)
        .filter((e) => e.name.startsWith("equiv-"))
        .map((e) => ({
          name: e.name,
          start: e.startTimeSeconds,
          dur: e.durationSeconds,
          ts: e.trimStartSeconds,
          te: e.trimEndSeconds,
        }))
        .sort((a, b) => a.start - b.start),
    );

  const seed = async () => {
    const state = await call("read_project", { projectId });
    const stale = state.payload.tracks.flatMap((t) =>
      t.elements.filter((e) => e.name.startsWith("equiv-")).map((e) => ({ trackId: t.id, elementId: e.id })),
    );
    const built = await call("edit_project", {
      projectId,
      baseRevision: state.payload.revision,
      operations: [
        ...(stale.length ? [{ type: "element.delete", elements: stale }] : []),
        {
          type: "element.insert",
          element: {
            type: "text",
            name: "equiv-clip",
            startTimeSeconds: 0,
            durationSeconds: 6,
            params: { content: "equivalence" },
          },
        },
      ],
    });
    return built.payload.state.tracks
      .flatMap((t) => t.elements.map((e) => ({ ...e, trackId: t.id })))
      .find((e) => e.name === "equiv-clip");
  };

  // Split through the FILE.
  const viaFile = await (async () => {
    const clip = await seed();
    const state = await call("read_project", { projectId });
    const result = await call("edit_project", {
      projectId,
      baseRevision: state.payload.revision,
      operations: [
        { type: "element.split", elements: [{ trackId: clip.trackId, elementId: clip.id }], splitTimeSeconds: 2.5 },
      ],
    });
    return shape(result.payload.state);
  })();

  // The same split through the EDITOR's own command.
  const viaEditor = await (async () => {
    const clip = await seed();
    const live = await (async () => {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const state = await call("get_state", { projectId });
        const file = await call("read_project", { projectId });
        if (
          !state.isError &&
          state.payload.loadedFileRevision !== null &&
          state.payload.loadedFileRevision >= file.payload.revision
        ) {
          return state.payload;
        }
      }
      return null;
    })();
    if (!live) return null;
    const target = live.tracks
      .flatMap((t) => t.elements.map((e) => ({ ...e, trackId: t.id })))
      .find((e) => e.name === "equiv-clip");
    if (!target) return null;
    const applied = await call("apply_operation", {
      operation: {
        type: "element.split",
        elements: [{ trackId: target.trackId, elementId: target.id }],
        splitTimeSeconds: 2.5,
      },
      baseRevision: live.revision,
      projectId: live.projectId,
      idempotencyKey: `equiv-split-${RUN}`,
    });
    if (applied.isError) return null;
    return shape((await call("get_state", { projectId })).payload);
  })();

  check(
    "a file split and an editor split produce the same document",
    viaEditor !== null && viaFile === viaEditor,
    `file=${viaFile}\n      editor=${viaEditor}`,
  );

  // Leave nothing behind.
  const leftover = await call("read_project", { projectId });
  const mine = leftover.payload.tracks.flatMap((t) =>
    t.elements.filter((e) => e.name.startsWith("equiv-")).map((e) => ({ trackId: t.id, elementId: e.id })),
  );
  if (mine.length) {
    await call("edit_project", {
      projectId,
      baseRevision: leftover.payload.revision,
      operations: [{ type: "element.delete", elements: mine }],
    });
  }
}

// ---------------------------------------------------------------------------
// 6. Clean up through the same file API.
// ---------------------------------------------------------------------------
const beforeCleanup = await call("read_project", { projectId });
const ours = beforeCleanup.payload.tracks.flatMap((t) =>
  t.elements.filter((e) => e.name.startsWith("card-")).map((e) => ({ trackId: t.id, elementId: e.id })),
);
if (ours.length > 0) {
  const cleaned = await editWithRetry({
    projectId,
    buildOperations: (state) => {
      const mine = state.tracks.flatMap((t) =>
        t.elements.filter((e) => e.name.startsWith("card-")).map((e) => ({ trackId: t.id, elementId: e.id })),
      );
      return mine.length > 0 ? [{ type: "element.delete", elements: mine }] : [];
    },
  });
  const finalState = await call("read_project", { projectId });
  check(
    "cleanup removes exactly what the probe created",
    !cleaned.isError &&
      !finalState.payload.tracks.flatMap((t) => t.elements).some((e) => e.name.startsWith("card-")),
    `deleted ${ours.length}`,
  );
}

if (probeTab) await fetch(`${CDP_BASE}/json/close/${probeTab.id}`).catch(() => {});
await call("delete_project", { projectId, confirm: true });

await client.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
