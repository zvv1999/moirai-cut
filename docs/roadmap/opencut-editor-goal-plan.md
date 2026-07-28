# OpenCut Editor Goal Plan

Status: ACTIVE  
Owner: Codex goal `019fa427-c03a-7dd2-850c-0e25523c914f`  
Branch: `feat/agent-drivable`  
Started: 2026-07-28  
Target report: `docs/reports/opencut-editor-goal/index.html`

## Objective

Build OpenCut into a dependable, discoverable video editor with the everyday
usability of Jianying, then surpass it with agent-native planning, review,
atomic editing, and undo.

The goal is complete only when every feature row below is either:

- `DONE`: implemented, tested, browser-verified, and documented with evidence;
- `SUPERSEDED`: replaced by a better implementation with equivalent acceptance
  coverage; or
- `WONTDO`: explicitly approved by the user. Nothing may be silently dropped.

## Product direction

OpenCut should feel like a restrained professional editing console:

- dense enough for repeated daily work;
- clear enough that icon-only controls never require guessing;
- frame-accurate, reversible, and predictable;
- fast with long timelines and large media libraries;
- equally operable by a human and an agent through the same command model.

Do not copy Jianying membership promotions, paid-template merchandising, or
cloud lock-in. Copy interaction patterns only when they improve editing speed,
clarity, safety, or project portability.

## Status vocabulary

| Status      | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `TODO`      | Not started                                                   |
| `RED`       | Failing test or executable reproducer committed               |
| `BUILDING`  | Implementation in progress                                    |
| `GREEN`     | Targeted tests pass; broader verification still pending       |
| `VERIFYING` | Browser, performance, migration, or full-suite checks running |
| `DONE`      | All gates passed and evidence recorded                        |
| `BLOCKED`   | External dependency or user decision is required              |

## Definition of done

Every feature must satisfy the applicable gates:

1. A user journey and explicit acceptance conditions exist in this document.
2. A valid RED test or reproducer is committed before production code.
3. Unit/integration coverage for new logic is at least 80%.
4. Targeted tests, TypeScript, targeted ESLint, and the repository suite pass.
5. The feature is exercised in the in-app browser against a real project.
6. The browser console contains no new error.
7. At least one useful before/after or final-state screenshot is archived.
8. The HTML report links the feature ID to commits, tests, and screenshots.
9. Human and agent edits use the same undoable command path where applicable.

## Delivery sequence

| Milestone | Scope                                     | Exit condition                           | Status     |
| --------- | ----------------------------------------- | ---------------------------------------- | ---------- |
| M0        | Plan, evidence, and report infrastructure | Versioned plan and report scaffold exist | `DONE`     |
| M1        | P0 workbench foundations                  | W01-W08 are done                         | `BUILDING` |
| M2        | Media library and professional timeline   | M01-M07 and T01-T08 are done             | `TODO`     |
| M3        | Audio, captions, and text                 | A01-A07 and C01-C07 are done             | `TODO`     |
| M4        | Visual tools and effects                  | V01-V08 are done                         | `TODO`     |
| M5        | Reliability and export                    | R01-R08 and E01-E07 are done             | `TODO`     |
| M6        | Agent-native editing                      | G01-G08 are done                         | `TODO`     |
| M7        | Final qualification and report            | Q01-Q06 are done                         | `TODO`     |

## P0 workbench foundations

| ID  | Capability                         | Acceptance conditions                                                                                                                                                               | Status  |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| W01 | Missing-media management           | Detect missing media; show a consistent red placeholder in library, canvas, and timeline; relink one or many files without losing cuts, trims, retime, effects, masks, or keyframes | `DONE`  |
| W02 | Inspector information architecture | Show selected item identity, type, duration, and grouped Basic/Transform/Blend/Mask/Effect sections; every editable value has reset and keyframe affordances                        | `DONE`  |
| W03 | Complete keyframe interaction      | Add/delete, previous/next, current-time state, multi-select, copy/paste, drag, keyboard movement, interpolation, and curve editing all work from the human UI                       | `TODO`  |
| W04 | Playback transport                 | Previous/next frame, play/pause, start/end, loop, playback speed, and preview quality are visible, labelled, and frame-accurate                                                     | `TODO`  |
| W05 | Timeline navigation                | Fit timeline, reveal playhead, mouse-centred zoom, horizontal navigation, overview/minimap, and long-project navigation work without losing context                                 | `TODO`  |
| W06 | Edit-mode feedback                 | Snapping, ripple editing, source linking, and active tools have obvious persistent states, labels, and shortcut hints                                                               | `GREEN` |
| W07 | Track controls                     | Lock, visibility, mute, solo, rename, resize, add, delete, and type compatibility are clear and undoable                                                                            | `TODO`  |
| W08 | Precision trim modes               | Standard trim, ripple trim, roll, slip, and slide are frame-accurate for video, image, and audio where meaningful                                                                   | `TODO`  |

## P1 media library

| ID  | Capability                          | Acceptance conditions                                                                                                                                       | Status  |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| M01 | Bins and folders                    | Create, rename, nest, reorder, and delete bins without deleting underlying media unless explicitly requested                                                | `TODO`  |
| M02 | Search and filters                  | Search filename and filter by type, duration, resolution, usage, missing status, tag, and favourite; combined filters produce clear counts and empty states | `GREEN` |
| M03 | Tags, favourites, and colour labels | Batch-apply metadata; use it in filters and sorting; persist it across reloads                                                                              | `TODO`  |
| M04 | Source preview and in/out points    | Hover/scrub source media, play it, set source in/out, and insert/overwrite the chosen range                                                                 | `TODO`  |
| M05 | Batch media operations              | Batch rename, replace, relink, remove, export, and proxy generation with progress and undo where safe                                                       | `TODO`  |
| M06 | Proxy workflow                      | Generate, attach, toggle, refresh, and remove proxies while preserving original export quality                                                              | `TODO`  |
| M07 | Duplicate detection                 | Detect exact and probable duplicates without hiding legitimate alternates; provide review before removal                                                    | `TODO`  |

## P1 professional timeline

| ID  | Capability                   | Acceptance conditions                                                                                                       | Status  |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| T01 | Selection system             | Shift selection, command/control selection, box selection, range selection, and selection across tracks behave consistently | `TODO`  |
| T02 | Groups and links             | Group/ungroup and link/unlink audio/video; linked selections and edits remain predictable                                   | `TODO`  |
| T03 | Markers and ranges           | Timeline, clip, and ranged markers support names, colours, notes, navigation, and agent addressing                          | `TODO`  |
| T04 | Transitions at edit points   | Drag or add a transition at a valid cut; duration handles, replacement, removal, and invalid-overlap feedback work          | `TODO`  |
| T05 | Compound clips               | Create, open, rename, edit, and break apart compound/nested sequences while preserving timing                               | `TODO`  |
| T06 | Timeline snapshots           | Save named snapshots, compare revisions, restore safely, and expose snapshot diffs to agents                                | `TODO`  |
| T07 | Configurable shortcuts       | Discover, edit, validate conflicts, import/export, and reset shortcuts; menus and tooltips always show current bindings     | `GREEN` |
| T08 | Direct manipulation feedback | Trims, moves, snaps, overlaps, invalid drops, and ripple consequences preview before commit                                 | `TODO`  |

## P1 audio workbench

| ID  | Capability              | Acceptance conditions                                                                        | Status |
| --- | ----------------------- | -------------------------------------------------------------------------------------------- | ------ |
| A01 | Volume envelope         | Add and edit volume keyframes directly on clips with numeric inspector parity                | `TODO` |
| A02 | Fade handles            | Drag fade-in/out handles; inspector values and timeline handles remain synchronized          | `TODO` |
| A03 | Loudness and peaks      | Analyze loudness, detect clipping, normalize to target, and show non-destructive warnings    | `TODO` |
| A04 | Source-audio separation | Extract and recover source audio without duplication, drift, or loss of edits                | `TODO` |
| A05 | Audio processing        | Noise reduction, voice enhancement, channel balance, and gain are previewable and reversible | `TODO` |
| A06 | Waveform performance    | Cache waveforms and keep zoom, scroll, and trim responsive on long audio                     | `TODO` |
| A07 | Voice-over recording    | Select input, monitor level, count in, record, stop, and place the take on an audio track    | `TODO` |

## P1 captions and text

| ID  | Capability                   | Acceptance conditions                                                                                      | Status |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| C01 | Automatic transcription      | Transcribe timeline or selection with progress, cancellation, retry, and deterministic insertion           | `TODO` |
| C02 | Speaker-aware caption timing | Identify speakers where available and preserve editable word/cue timing                                    | `TODO` |
| C03 | Bulk text editing            | Search/replace, multi-cue editing, spelling review, and timing adjustments work without breaking cue order | `TODO` |
| C04 | Global caption styles        | Create, apply, update, duplicate, and detach reusable caption styles                                       | `TODO` |
| C05 | Bilingual captions           | Pair primary/secondary text, style independently, and keep timing linked                                   | `TODO` |
| C06 | Caption quality checks       | Detect overlong lines, unsafe placement, overlaps, gaps, unreadable duration, and out-of-bounds cues       | `TODO` |
| C07 | Caption interchange          | Import/export SRT, VTT, and ASS with explicit handling of unsupported style details                        | `TODO` |

## P2 visual tools and effects

| ID  | Capability               | Acceptance conditions                                                                                             | Status |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------ |
| V01 | Crop and geometry        | Crop, mirror, corner radius, shadow, and stroke are direct-manipulation friendly and keyframable where meaningful | `TODO` |
| V02 | Colour controls and LUTs | Exposure, contrast, temperature, saturation, highlights, shadows, curves, and LUT import are non-destructive      | `TODO` |
| V03 | Adjustment layers        | Effects and colour on an adjustment layer affect covered compatible tracks and remain editable                    | `TODO` |
| V04 | Mask workflow            | Built-in and freeform masks support feather, invert, combine, keyframes, and clear canvas handles                 | `TODO` |
| V05 | Motion tracking          | Track a point/region and bind compatible transform or mask parameters with editable confidence/failure ranges     | `TODO` |
| V06 | Retime tools             | Constant speed, speed curve, freeze frame, reverse, and source-boundary feedback are predictable                  | `TODO` |
| V07 | Stabilization and keying | Stabilization, chroma key, and background removal expose progress, preview, quality, and failure states           | `TODO` |
| V08 | Effect presets           | Save, name, organize, apply, replace, and export reusable effect/parameter presets                                | `TODO` |

## P2 project reliability

| ID  | Capability                | Acceptance conditions                                                                                                         | Status |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| R01 | Continuous autosave       | Changes persist without disruptive blocking and expose saved/saving/error state                                               | `TODO` |
| R02 | Crash recovery            | Interrupted work reopens to a recoverable recent state with an explicit recovery choice                                       | `TODO` |
| R03 | Version history           | Browse, name, compare, restore, and duplicate project versions safely                                                         | `TODO` |
| R04 | Undo/redo integrity       | Every supported human and agent edit has deterministic undo/redo, including selection restoration where relevant              | `TODO` |
| R05 | Project health checks     | Detect missing media, gaps, slivers, overruns, dead spans, hidden/muted content, clipping, caption issues, and export hazards | `TODO` |
| R06 | Large-project performance | Virtualize timeline/library UI; cache thumbnails/waveforms; establish repeatable performance budgets                          | `TODO` |
| R07 | Background jobs           | Export, proxies, transcription, and analysis survive UI navigation and expose retry/cancel/history                            | `TODO` |
| R08 | Portable project package  | Package project, media or proxies, fonts, captions, and a manifest; validate on import                                        | `TODO` |

## P2 export experience

| ID  | Capability                  | Acceptance conditions                                                                                       | Status |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| E01 | Platform presets            | Provide editable horizontal, vertical, square, and delivery-platform presets without hiding actual settings | `TODO` |
| E02 | Advanced encoding           | Resolution, frame rate, bitrate, codec, audio settings, alpha, and hardware capability checks are explicit  | `TODO` |
| E03 | Preflight                   | Run project health and render-sample checks before export; link each warning to its edit location           | `TODO` |
| E04 | Size and duration estimates | Show evidence-based output size and progress/time estimates, labelled as estimates                          | `TODO` |
| E05 | Component exports           | Export audio stems, captions, stills, alpha video, and selected ranges                                      | `TODO` |
| E06 | Batch export                | Queue multiple presets/ranges/versions with independent status and retry                                    | `TODO` |
| E07 | Export history              | Preserve settings, destination, result, errors, and rerun capability without exposing unavailable files     | `TODO` |

## Agent-native editing

| ID  | Capability                    | Acceptance conditions                                                                                          | Status  |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| G01 | Shared atomic commands        | Human and agent edits execute the same command implementations and history semantics                           | `GREEN` |
| G02 | Plan preview                  | Agent presents ordered operations, affected ranges/elements, assumptions, and expected output before mutation  | `TODO`  |
| G03 | Change review                 | After an agent run, highlight every changed clip/property and support accept, reject, or revert by group       | `TODO`  |
| G04 | Semantic project inspection   | Agent can address media, clips, tracks, captions, keyframes, loudness, markers, issues, and rendered evidence  | `GREEN` |
| G05 | Semantic editing              | Commands such as “tighten this section” or “unify captions” compile to validated, reviewable atomic operations | `TODO`  |
| G06 | Shared undo and concurrency   | Agent operations respect revisions/idempotency; stale plans fail closed; human undo works normally             | `GREEN` |
| G07 | Guardrails                    | Agent cannot bypass validation, storage, command history, permissions, or project boundaries                   | `GREEN` |
| G08 | Agent preflight and visual QC | Agent runs structural lint, representative frame review, audio checks, and export verification with evidence   | `TODO`  |

## Final qualification and report

| ID  | Capability                | Acceptance conditions                                                                                                             | Status |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Q01 | Automated regression      | Full unit/integration suite and critical E2E journeys pass with no skipped goal tests                                             | `TODO` |
| Q02 | Browser qualification     | Every milestone has real-project browser evidence and no new console error                                                        | `TODO` |
| Q03 | Performance qualification | Library, timeline, playback, and background-job budgets are measured and reported                                                 | `TODO` |
| Q04 | Migration qualification   | Existing projects open without data loss; new fields have tested migrations or safe defaults                                      | `TODO` |
| Q05 | Screenshot catalogue      | Before/after and final-state screenshots use stable feature IDs and captions                                                      | `TODO` |
| Q06 | HTML report               | A self-contained navigable report summarizes scope, implementation, commits, tests, screenshots, limitations, and remaining risks | `TODO` |

## Evidence registry

Evidence is append-only. Each entry must identify feature IDs.

| Date       | Feature IDs        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Result                                                                              |
| ---------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2026-07-28 | W02                | RED commit `78e250c`; GREEN commit `4408d7b`; 5 targeted tests; new inspector chrome at 83.33% function and 100% line coverage; full suite 362/362; production build compiled and passed TypeScript before the existing `/_global-error` prerender failure; real-project browser verification covered selection identity, type, duration, track, six named tabs, reset actions, and retained keyframe affordances; screenshot `W02-inspector-information-architecture.png` | Capability complete                                                                 |
| 2026-07-28 | W01                | RED commits `c0f0a73`, `157a7a5`, `33e3206`, `393bacc`; GREEN commit `29834f5`; 12 targeted tests; 82.35-100% function and 89.86-100% line coverage across new core modules; full suite 357/357; real file moved offline and relinked from browser; byte hashes matched; zero browser error; screenshots `W01-missing-media-library-timeline-canvas.png` and `W01-missing-media-relinked.png`                                                                              | Capability complete                                                                 |
| 2026-07-28 | M0                 | Versioned plan, report data, portable HTML/CSS report, browser DOM and lightbox verification, zero browser console warnings/errors, screenshot `M0-html-report-baseline.png`                                                                                                                                                                                                                                                                                               | Milestone complete                                                                  |
| 2026-07-28 | M02, W06, T07      | Commit `8086fad`; browser search `reed` returned 1/44; video filter returned 6/44; toolbar showed current shortcut labels                                                                                                                                                                                                                                                                                                                                                  | Partial capabilities verified                                                       |
| 2026-07-28 | G01, G04, G06, G07 | Existing agent manager, operation registry, revision/idempotency tests, MCP schema drift tests                                                                                                                                                                                                                                                                                                                                                                             | Existing foundation accepted as GREEN, final browser/report evidence still required |

## Artifact layout

```text
docs/
  roadmap/
    opencut-editor-goal-plan.md
  reports/
    opencut-editor-goal/
      index.html
      report-data.json
      assets/
        screenshots/
        thumbnails/
        styles.css
```

Screenshot naming:

```text
<feature-id>-<state>-<short-description>.png
```

Examples:

```text
W01-missing-media-relink-dialog.png
W03-keyframe-curve-editor.png
M02-media-search-filtered.png
G03-agent-change-review.png
```

## Progress update protocol

After every GREEN checkpoint:

1. update feature status and evidence here;
2. capture the browser state if it is visually meaningful;
3. add or update the HTML report section;
4. update the goal plan in Codex;
5. commit the documentation with the implementation or verification checkpoint.
