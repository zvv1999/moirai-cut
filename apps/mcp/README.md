# @opencut/mcp

An MCP server that lets an agent edit OpenCut projects — normally by writing the
**project file**, and optionally by driving a **live editor tab**.

For the complete OpenCut ↔ Codex Smart Edit orchestration, context schemas,
scene-aware multimodal workflow, and iterative editing protocol, read
[`../../docs/agent-smart-edit.md`](../../docs/agent-smart-edit.md).

```
agent → MCP → /api/projects → project.json          ← edits, no browser needed
                                    ↓ file watcher
                              the open editor follows and previews

agent → MCP → CDP → window.__opencutAgent → Command  ← selected context, pixels, undo history
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

For users, start OpenCut once and use **智能剪辑 → 设置**:

```bash
bun run setup:local
```

OpenCut detects the existing Codex and Claude login, then installs this MCP with
one click. Installation is user-scoped, idempotent, and verified with the
client's own `mcp get opencut` command.

Developer-only manual equivalents:

```bash
codex mcp add \
  --env OPENCUT_BASE_URL=http://127.0.0.1:3000 \
  --env OPENCUT_PROJECTS_DIR=/absolute/path/to/OpenCutProjects \
  opencut -- bun /absolute/path/to/opencut-classic/apps/mcp/src/server.mjs

claude mcp add --scope user \
  --env OPENCUT_BASE_URL=http://127.0.0.1:3000 \
  --env OPENCUT_PROJECTS_DIR=/absolute/path/to/OpenCutProjects \
  opencut -- bun /absolute/path/to/opencut-classic/apps/mcp/src/server.mjs
```

File tools require no debug browser. Only tab-only inspection and undo tools
need CDP; set `OPENCUT_CDP_PORT` (default `9222`) and `OPENCUT_URL_MATCH`
(default `/editor/`) when developing those tools.

## Two ways in

**File tools — the normal way to edit.** They change `project.json` on disk and
need no browser at all. The open editor notices the file changed and follows it.

| Tool                                         | Purpose                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `list_projects`                              | Every project file on disk, and the directory they live in.                   |
| `read_project`                               | Revision, scene, and every track with its clips and effects. Read this first. |
| `edit_project`                               | Apply a batch of operations to the file, atomically.                          |
| `list_media`                                 | The project's media assets, with duration, dimensions and frame rate.         |
| `import_media`                               | Copy a file from disk into the project. Probed with ffprobe.                  |
| `delete_media`                               | Remove a media asset and report any timeline elements removed with it.        |
| `inspect_media`                              | Sample source footage into one labeled JPEG contact sheet.                    |
| `inspect_media_scenes`                       | Detect shot boundaries and sample every scene or long-shot time sequence.     |
| `inspect_timeline_range`                     | Map a timeline interval through trims/retiming to source frames.              |
| `build_media_catalog` / `read_media_catalog` | Maintain compact Agent-readable metadata and timeline uses.                   |
| `save_media_analysis`                        | Persist Codex multimodal observations for later turns.                        |
| `analyze_audio`                              | Find silence and loudness intervals without opening the editor.               |
| `lint_cut`                                   | Check timeline gaps, overlaps, slivers, missing media and duration drift.     |

`edit_project` is **all-or-nothing**: the batch is applied to a working copy, and
if any step fails nothing is written. Operations compose — later ones see the
results of earlier ones — so a whole sequence can be built in one call.

**Tab tools — for what only a running editor knows.** Human-selected Codex
context, rendered pixels, and the undo history. These drive a live tab over CDP.

| Tool                                            | Purpose                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `status`                                        | Is a debugging port and an editor tab reachable? Start here when anything fails.                  |
| `get_state`                                     | Revision, project id, frame rate, media library, and every track with its clips.                  |
| `get_context`                                   | Compact pinned/live selection with stable `opencut://` paths and a prompt-ready block.            |
| `reveal_context`                                | Select an `opencut://` element or range and move the playhead to it.                              |
| `list_operations`                               | What this build can execute — read from the page's registry, not from this server.                |
| `apply_operation`                               | Apply one edit. Requires `baseRevision` and `projectId`.                                          |
| `render_frames`                                 | Render full PNGs, or one labeled JPEG contact sheet, to check an edit.                            |
| `start_export` / `get_export` / `cancel_export` | Encode to a video file, including fast agent-only draft reviews. Long-running, so start and poll. |
| `start_transcribe` / `get_transcribe`           | Transcribe the timeline's audio to caption chunks.                                                |
| `undo` / `redo`                                 | Move through the editor's history — including the human's edits.                                  |

## The edit vocabulary

Track and scene level: `track.add`, `track.remove`, `track.toggleMute`,
`track.toggleVisibility`, `scene.rename`.

Clip level: `element.insert`, `element.delete`, `element.move`, `element.split`,
`element.trim`, `element.rename`, `element.duplicate`.

Effects on a clip: `element.addEffect`, `element.removeEffect`,
`element.toggleEffect`, `element.setEffectParams`, `element.reorderEffect`.
Read the clip's `effects[]` from `read_project` to get the ids they address.

## Captions

`start_transcribe` runs whisper in the browser over the timeline's own audio and
returns `{text, startTime, duration}` chunks in seconds. It deliberately stops
there rather than also putting them on the timeline: captions are ordinary text
clips, so an agent inserts them with `element.insert` — which means it can fix
the wording, merge or retime chunks, or drop the ones it does not want first.

The model is downloaded on first use, so the first run is slow; `step` says
whether it is fetching the model, decoding, or transcribing.

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
a compatible track _and_ puts the clip on it in one command, which is what makes
it survive the prune reactor. `track.add` alone always reports `noEffect`.

## Errors worth distinguishing

| code                                     | meaning                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `revision_conflict`                      | Someone edited between your read and your write. Re-read and re-decide.                          |
| `project_mismatch`                       | The tab is on a different project than the one you read.                                         |
| `unresolved_reference`                   | A `{trackId, elementId}` pair does not resolve — the message says where the element actually is. |
| `no_editor_tab` / `ambiguous_editor_tab` | Tab selection, before anything was evaluated.                                                    |
| `target_gone`                            | The tab closed or navigated mid-call.                                                            |

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
_rejected_ (`revision_conflict`), never merged. If the human moved a clip between
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
frame was actually taken — comparing pixels against the time you _asked_ for
would otherwise silently compare the wrong moment.

## The review loop

The cheapest useful review happens in four passes:

1. **Survey the source.** Call `list_media`, then `inspect_media` with its default
   16 midpoint samples. It returns one JPEG contact sheet plus a cell-to-source
   time map. Use `atSeconds` for a second, focused look around likely cut points,
   and increase `cellWidth` from 320 to 640 only when fine detail matters.
2. **Remove mechanical defects.** Run `lint_cut` before spending browser time.
   It reports main-track gaps, same-track overlaps, sub-threshold slivers,
   missing assets, trims beyond source duration, completely dead spans, hidden
   or muted tracks with content, and optional drift from `targetDurationSeconds`.
   Findings are advisory: a clean result proves structural consistency, not
   editorial quality.
3. **Survey the result.** Call `render_frames` with `tile: true` for up to 24
   timeline positions in one labeled JPEG. Full-resolution PNG mode remains
   capped at eight frames for close inspection. In either mode, reject the
   evidence if `stable` is false or `revision` is not the revision you edited.
4. **Review motion and sound.** Start an export with `quality: "draft"`. Drafts
   use 12 fps and the low bitrate while retaining full-rate audio, and their
   filenames are branded `-draft`. Once the cut is approved, export `high` or
   `very_high` exactly once for delivery.

`inspect_media` samples **source-media seconds** and requires every explicit
time to be before the source duration. `render_frames` samples **timeline
seconds** and reports any end-of-timeline clamp through `renderedAtSeconds`.
Keeping those two clocks distinct prevents a visually plausible but incorrect
trim.

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
