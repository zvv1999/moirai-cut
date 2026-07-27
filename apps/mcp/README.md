# @opencut/mcp

An MCP server that lets an agent edit OpenCut projects — normally by writing the
**project file**, and optionally by driving a **live editor tab**.

```
agent → MCP → /api/projects → project.json          ← edits, no browser needed
                                    ↓ file watcher
                              the open editor follows and previews

agent → MCP → CDP → window.__opencutAgent → Command  ← pixels, undo history
```

Nothing here knows how to edit video. The file path applies the same operation
vocabulary the editor exposes; the tab path routes through the editor's own
`Command` objects, so those edits are undoable and indistinguishable from a
human's.

## Why the file is the source of truth

While the document lived in IndexedDB + OPFS it was reachable only from inside a
tab — which is why driving the editor needed CDP at all. As a file it is
reachable by any Node process: this server, LocalCut's harness, git, your editor.
The browser becomes a shell that loads it.

Turn it on with `NEXT_PUBLIC_OPENCUT_PROJECT_FILES=1` and point
`OPENCUT_PROJECTS_DIR` at a directory. Layout:

```
<OPENCUT_PROJECTS_DIR>/<projectId>/project.json
```

Two writers now share that file — you and the human — which is what the revision
and compare-and-swap below are for.

## Setup

**1. Start the editor** (from the repo root):

```bash
bun dev
```

**2. Start Chrome with a debugging port.** Use a separate profile so this never
touches your normal browser session:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/opencut-agent-profile http://localhost:3000/projects
```

**3. Open a project** in that Chrome. The bridge is installed by the editor
provider, so it only exists once a project is actually open.

**4. Register the server** with your MCP client:

```json
{
  "mcpServers": {
    "opencut": {
      "command": "node",
      "args": ["/absolute/path/to/opencut-classic/apps/mcp/src/server.mjs"]
    }
  }
}
```

Environment overrides: `OPENCUT_CDP_PORT` (default `9222`), `OPENCUT_URL_MATCH`
(default `/editor/`).

## Two ways in

**File tools — the normal way to edit.** They change `project.json` on disk and
need no browser at all. The open editor notices the file changed and follows it.

| Tool | Purpose |
| --- | --- |
| `list_projects` | Every project file on disk, and the directory they live in. |
| `read_project` | Revision, scene, and every track with its clips and effects. Read this first. |
| `edit_project` | Apply a batch of operations to the file, atomically. |
| `list_media` | The project's media assets, with duration, dimensions and frame rate. |
| `import_media` | Copy a file from disk into the project. Probed with ffprobe. |

`edit_project` is **all-or-nothing**: the batch is applied to a working copy, and
if any step fails nothing is written. Operations compose — later ones see the
results of earlier ones — so a whole sequence can be built in one call.

**Tab tools — for what only a running editor knows.** Rendered pixels, and the
undo history. These drive a live tab over CDP.

| Tool | Purpose |
| --- | --- |
| `status` | Is a debugging port and an editor tab reachable? Start here when anything fails. |
| `get_state` | Revision, project id, frame rate, media library, and every track with its clips. |
| `list_operations` | What this build can execute — read from the page's registry, not from this server. |
| `apply_operation` | Apply one edit. Requires `baseRevision` and `projectId`. |
| `render_frames` | Render frames as PNGs to check what an edit actually produced. |
| `start_export` / `get_export` / `cancel_export` | Encode to a video file. Long-running, so start and poll. |
| `undo` / `redo` | Move through the editor's history — including the human's edits. |

## The edit vocabulary

Track and scene level: `track.add`, `track.remove`, `track.toggleMute`,
`track.toggleVisibility`, `scene.rename`.

Clip level: `element.insert`, `element.delete`, `element.move`, `element.split`,
`element.trim`, `element.rename`, `element.duplicate`.

Effects on a clip: `element.addEffect`, `element.removeEffect`,
`element.toggleEffect`, `element.setEffectParams`, `element.reorderEffect`.
Read the clip's `effects[]` from `read_project` to get the ids they address.

## What the file path cannot do

`element.split` on a clip carrying keyframe **animations** is refused, not
approximated: splitting keyframes needs the editor's interpolation and bezier
subdivision, and a close-enough version puts both halves on the wrong curve while
looking correct in the timeline. Use `apply_operation` against the open tab for
those clips. Duplicating an animated clip IS supported — it mints fresh keyframe
ids, as the editor does.

`start_export` refuses while the editor is behind the file (`editor_behind_file`).
The encode reads the tab's in-memory document, so exporting before it has caught
up silently produces a video of the previous cut.

Every one routes to the same `Command` class the UI uses, so agent edits land in
the same undo history as the human's.

**Times are always seconds.** The editor stores integer ticks at 120 000/second;
a caller that reads a tick count and writes back seconds is wrong by five orders
of magnitude, and `MediaTime`'s type brand is erased at runtime so nothing would
catch it. Conversion happens at the boundary, in one place.

**A clip is named by `{trackId, elementId}`, not by element id alone** — that
pair is literally the constructor argument of the underlying commands. `get_state`
reports elements nested under their track, so both halves are always at hand. Ids
change when a clip is split or replaced, so re-read rather than caching them.

Use `element.insert` rather than `track.add` when you want a new track: it creates
a compatible track *and* puts the clip on it in one command, which is what makes
it survive the prune reactor. `track.add` alone always reports `noEffect`.

## Errors worth distinguishing

| code | meaning |
| --- | --- |
| `revision_conflict` | Someone edited between your read and your write. Re-read and re-decide. |
| `project_mismatch` | The tab is on a different project than the one you read. |
| `unresolved_reference` | A `{trackId, elementId}` pair does not resolve — the message says where the element actually is. |
| `no_editor_tab` / `ambiguous_editor_tab` | Tab selection, before anything was evaluated. |
| `target_gone` | The tab closed or navigated mid-call. |

## The three guarantees

`CommandManager` gives you undo. It does not give you these, and an agent sharing
a document with a human needs all three:

**Revision.** A monotonic counter naming the state you read. `get_state` returns
it; `apply_operation` requires it. It advances on every real edit, on undo/redo,
and when the tab switches documents — it never resets, so a number held across a
project switch is stale rather than ambiguous.

**Expect conflicts, and retry by re-reading.** The human's editor autosaves on
its own schedule, so an agent holding a revision from a moment ago loses the race
routinely — this is normal operation, not an error condition. The correct
response is always the same: re-read, rebuild the operations against the fresh
state, and retry. `edit_project` also takes an `idempotencyKey`; reuse it on
retry so a lost response cannot apply the batch twice. See `editWithRetry` in
`probe-file.mjs` for the shape.

**Optimistic concurrency.** An operation built against a stale revision is
*rejected* (`revision_conflict`), never merged. If the human moved a clip between
your read and your write, you find out instead of silently clobbering them.
Re-read and re-decide — do not blindly retry with a bumped number.

`apply_operation` also requires the `projectId` from the same `get_state` call,
because a revision number alone does not identify a document. If the tab is on a
different project by the time the edit lands, you get `project_mismatch`, not a
misapplied edit.

**Idempotency.** Supply your own `idempotencyKey` and reuse it verbatim on retry,
so a dropped response cannot double-apply the edit. Omitting it generates a fresh
key each call, which means **retries are not deduplicated**. Only the 256 most
recent keys are remembered, so a burst of keyless edits can evict a key you were
relying on.

## Read the result, don't assume it

```jsonc
{ "applied": true,  "revision": 4, "deduplicated": false, "noEffect": false } // edit landed
{ "applied": false, "revision": 3, "deduplicated": true,  "noEffect": false } // already applied; not repeated
{ "applied": false, "revision": 3, "deduplicated": false, "noEffect": true  } // ran, but changed nothing
```

`noEffect: true` is the one that catches people. The editor runs reactors after
every command — one of them prunes tracks with no elements — so a command can be
completely neutralised the instant it lands. `track.add` on its own does exactly
this. **The edit did not happen**: the revision does not move, and the operation
does not consume an undo slot.

## Checking your own work

`render_frames` draws from the same `buildScene` + `CanvasRenderer` path the
exporter uses, so a frame you inspect is the frame the export would produce —
not a preview approximation.

Every result is stamped with the `revision` it depicts and a `stable` flag.
**Check them.** Rendering is asynchronous and the human can edit during it; an
image whose revision is not the one you edited at is a picture of a document
state you know nothing about, not evidence.

Times are clamped to the last frame, and `renderedAtSeconds` reports where the
frame was actually taken — comparing pixels against the time you *asked* for
would otherwise silently compare the wrong moment.

## Verifying end to end

```bash
node src/probe-file.mjs   # the file loop: edit with no browser, then check pixels
node src/probe.mjs        # the tab loop: drive a live editor over CDP
```

Both spawn the server as a subprocess and speak real stdio JSON-RPC to it.

`probe-file.mjs` is the one that shows the whole point: it composes a three-card
title sequence by writing the file, waits for the running editor to follow it,
and then renders frames to confirm the pixels match — including that the gap the
edit opened up is actually empty. It also asserts what must NOT happen: a stale
revision is refused, and a batch containing one bad operation leaves the file
completely untouched.

`probe.mjs` covers the tab path: replayed keys deduplicate, stale revisions
conflict, and a command the editor neutralises reports `noEffect` rather than
success. Both clean up after themselves.

```bash
node --test "src/__tests__/*.test.mjs"
```

Includes a drift guard: the edit vocabulary is declared both in
`apps/web/src/agent/operations.ts` (what can execute) and in `src/schema.mjs`
(what an agent may ask for). The test fails if they diverge.
