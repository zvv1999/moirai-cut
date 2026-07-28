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
| M1        | P0 workbench foundations                  | W01-W08 are done                         | `DONE`     |
| M2        | Media library and professional timeline   | M01-M07 and T01-T08 are done             | `BUILDING` |
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
| W03 | Complete keyframe interaction      | Add/delete, previous/next, current-time state, multi-select, copy/paste, drag, keyboard movement, interpolation, and curve editing all work from the human UI                       | `DONE`  |
| W04 | Playback transport                 | Previous/next frame, play/pause, start/end, loop, playback speed, and preview quality are visible, labelled, and frame-accurate                                                     | `DONE`  |
| W05 | Timeline navigation                | Fit timeline, reveal playhead, mouse-centred zoom, horizontal navigation, overview/minimap, and long-project navigation work without losing context                                 | `DONE`  |
| W06 | Edit-mode feedback                 | Snapping, ripple editing, source linking, and active tools have obvious persistent states, labels, and shortcut hints                                                               | `DONE`  |
| W07 | Track controls                     | Lock, visibility, mute, solo, rename, resize, add, delete, and type compatibility are clear and undoable                                                                            | `DONE`  |
| W08 | Precision trim modes               | Standard trim, ripple trim, roll, slip, and slide are frame-accurate for video, image, and audio where meaningful                                                                   | `DONE`  |

## P1 media library

| ID  | Capability                          | Acceptance conditions                                                                                                                                       | Status  |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| M01 | Bins and folders                    | Create, rename, nest, reorder, and delete bins without deleting underlying media unless explicitly requested                                                | `DONE`  |
| M02 | Search and filters                  | Search filename and filter by type, duration, resolution, usage, missing status, tag, and favourite; combined filters produce clear counts and empty states | `DONE`  |
| M03 | Tags, favourites, and colour labels | Batch-apply metadata; use it in filters and sorting; persist it across reloads                                                                              | `DONE`  |
| M04 | Source preview and in/out points    | Hover/scrub source media, play it, set source in/out, and insert/overwrite the chosen range                                                                 | `DONE`  |
| M05 | Batch media operations              | Batch rename, replace, relink, remove, export, and proxy generation with progress and undo where safe                                                       | `DONE`  |
| M06 | Proxy workflow                      | Generate, attach, toggle, refresh, and remove proxies while preserving original export quality                                                              | `DONE`  |
| M07 | Duplicate detection                 | Detect exact and probable duplicates without hiding legitimate alternates; provide review before removal                                                    | `DONE`  |

## P1 professional timeline

| ID  | Capability                   | Acceptance conditions                                                                                                       | Status  |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| T01 | Selection system             | Shift selection, command/control selection, box selection, range selection, and selection across tracks behave consistently | `DONE`  |
| T02 | Groups and links             | Group/ungroup and link/unlink audio/video; linked selections and edits remain predictable                                   | `DONE`  |
| T03 | Markers and ranges           | Timeline, clip, and ranged markers support names, colours, notes, navigation, and agent addressing                          | `DONE`  |
| T04 | Transitions at edit points   | Drag or add a transition at a valid cut; duration handles, replacement, removal, and invalid-overlap feedback work          | `DONE`  |
| T05 | Compound clips               | Create, open, rename, edit, and break apart compound/nested sequences while preserving timing                               | `DONE`  |
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
| 2026-07-28 | T05                 | RED commit `212125e`; GREEN commit `06cc72b`; 4/4 new compound-planner/document tests plus MCP document, schema-drift, agent-manager, renderer, and toolbar regressions; repository suite 445/445 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed; clean-worktree production build passed compilation, TypeScript, page data, and static generation. Multiple visual clips on one track can now become one addressable nested container. The compound stores each complete child element, its original track address, and relative start time; moving the container preserves internal rhythm, the renderer recursively expands nested children for preview/export, and Agent state/MCP inspection exposes compact child addresses and timing. The manager creates, opens, renames, edits child names/timing in 0.1s steps, and breaks apart through shared command history; a visible badge shows child count. Real-project browser verification nested two adjacent clips into a 3.80s container, renamed the container, renamed the second child, nudged it 0.1s, refreshed successfully, then broke apart/undid/redid as 0→1→0. The final persisted project restored the original clip names and exact 0/288000/456000 tick boundaries with zero compounds. Screenshot `T05-compound-clips.png`. | Capability complete |
| 2026-07-28 | T04                 | RED commit `e370c11`; GREEN commit `bd1d192`; 4/4 new transition-planner and document-transform tests plus MCP document, schema-drift, agent-manager, and toolbar regressions; repository suite 441/441 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed; clean-worktree production build passed compilation, TypeScript, page data, and static generation. Two adjacent visual clips now form a stable, addressable transition object while the incoming clip is placed on a compatible overlay lane and driven by transition-owned opacity keys. The transition manager supports Cross dissolve and Fade through black, a drag duration handle plus 0.05s steps, replacement, removal, explicit invalid-cut feedback, count badges, and visible clip badges. Removal filters only transition-owned keys and restores the exact original track/start; both page and MCP Agent crossfade paths emit the same metadata so human controls can continue an Agent edit. Real-project browser verification added a 0.50s dissolve, replaced it with a 0.55s fade through black, refreshed to prove persistence, then removed/undid/redid as 0→1→0 and confirmed non-adjacent clips were blocked. The persisted project ended with zero verification transitions. Screenshot `T04-edit-point-transitions.png`. | Capability complete |
| 2026-07-28 | T03                 | RED commit `8f40359`; GREEN commit `ff88630`; 4/4 new marker-model tests plus MCP document, schema-drift, and agent-manager regressions; repository suite 437/437 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed for the new marker modules (existing broad agent/bookmark files retain unrelated baseline lint findings); clean-worktree production build passed compilation, TypeScript, page data, and static generation. Markers now persist stable IDs, optional names, notes, colours, duration ranges, timeline/clip scope, and clip track/element addresses. The marker manager adds playhead or selected-clip ranges, lists stable ID prefixes, seeks previous/next, and deletes through command history; the existing detail popover now edits names alongside note, colour, and duration. Agent state and both in-page and MCP operation paths expose ID-based remove/move/update with legacy time fallback. Real-project browser verification added a coloured `Beat change` timeline marker with note plus a full-span clip marker, navigated 1.40s→0.00s→1.40s, refreshed with both IDs/names intact, then deleted both and verified global undo/redo restored 2→0; the persisted project ended with zero verification markers. Screenshot `T03-markers-ranges.png`. | Capability complete |
| 2026-07-28 | T02                 | RED commit `873eba8`; GREEN commit `f72d2f0`; 4/4 new relation-planner tests plus retained selection regressions; repository suite 433/433 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed; clean-worktree production build passed compilation, TypeScript, page data, and static generation. Timeline elements now persist independent general `groupId` and audio/video `linkGroupId` relationships. The toolbar groups or ungroups any multi-selection and links or unlinks only overlapping visual/audio selections; badges identify G/L state. Related selection expands transitively, so existing multi-clip move and delete commands receive the full connected set while all relationship changes remain undoable. Real-project browser verification grouped two main clips and proved single-click expansion, then ungrouped. It linked an overlapping first main clip and score, refreshed to prove persistence, selected both by clicking one, then verified unlink/undo/redo as 0→2→0 badges and left the project clean. Screenshot `T02-groups-links.png`. | Capability complete |
| 2026-07-28 | T01                 | RED commit `af30d41`; GREEN commit `cf4b5de`; 4/4 new selection-planner tests plus retained interaction-shell and mode-status regressions; repository suite 429/429 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed; clean-worktree production build passed compilation, TypeScript, page data, and static generation. Selection now keeps an explicit range anchor: regular click replaces, Command/Control toggles one clip, Shift chooses a deterministic chronological range across tracks, and drag-box selection remains additive with modifiers. Every timeline clip exposes an accessible identity and pressed state, while a persistent status chip reports the current count and interaction hints. Real-project browser verification selected a six-clip Shift range spanning text, main video, and audio, toggled one clip out with Command to reach five, then box-selected six clips across tracks. Screenshot `T01-selection-system.png`. | Capability complete |
| 2026-07-28 | M07                 | RED commit `ffbf427`; GREEN commit `08a5743`; 4/4 targeted duplicate-classification tests; repository suite 425/425 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed; clean-worktree production build passed compilation, TypeScript, page data, and static generation. Exact matches require equal type, byte size, and SHA-256 content; probable matches require conservative filename and media-property agreement. Real-project browser verification scanned 44 legitimate assets without hiding any, then detected a byte-identical `DSC_5396 copy.JPG` beside its source. Both candidates remained unselected and labelled with reasons, the chosen copy alone was removed after confirmation, undo restored 45 visible assets, redo returned to 44, and the persisted index retained the original plus its proxy while omitting the test duplicate. Screenshot `M07-duplicate-review.png`. | Capability complete |
| 2026-07-28 | M05, M06            | RED commit `1b4539d`; GREEN commit `1489f19`; browser-found persistence repair `b322615`; 6/6 targeted tests; repository suite 421/421 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed for new modules (the pre-existing storage service still reports two unrelated unsafe-assertion lint findings); clean-worktree production build passed compilation, TypeScript, page data, and static generation. The selection-aware browser workbench exposed sequential rename, ordered replacement, filename relink, original export, guarded removal, and proxy generation with progress. A real `DSC_5396.JPG` proxy generated at 640×960 / 33 KB, survived refresh with the library remaining exactly 44 assets, showed a persistent `P` badge, toggled off/on, removed/restored, and batch-renamed/restored through command undo. The first browser attempt revealed that `.__proxy` violated the disk API safe-ID contract; the fix switched to `-proxy`, filtered internal proxy records from the user library, and serialized shared-index deletion to prevent races. Screenshots `M05-batch-media-operations.png` and `M06-proxy-workflow-ready.png`. Development-mode cold reload intermittently failed one large media fetch; a clean server restart and retry restored all 44 assets, while health and media endpoints remained 200. | Both capabilities complete |
| 2026-07-28 | M04                 | RED commit `d081554`; GREEN commit `d8a0af7`; 4/4 targeted tests; source-range core at 83.33% function and 98.58% line coverage; repository suite 415/415 from the repository root with the required `apps/web/test-preload.ts`; TypeScript and focused ESLint passed for the new modules (the pre-existing timeline-manager file still reports three unrelated unsafe-assertion lint findings); clean-worktree production build passed compilation, TypeScript, page data, and static generation; real-project browser verification opened `IMG_2133.MOV` through both direct and context-menu entry points, set 0.40s/1.80s In/Out, played until the Out point, inserted the 1.40s source span (31→32 clips) and undid it, overwrote the Main Track with boundary splitting (31→32 clips) and restored the exact prior clip-name sequence with one undo; screenshots `M04-source-monitor-in-out.png` and `M04-source-overwrite-result.png`. One transient local media-API fetch failure occurred during hot reload, `/api/health` and `/api/media` then returned 200, and the clean verification session had no further application warning/error. | Capability complete |
| 2026-07-28 | M02, M03            | RED commit `3a22d5c`; GREEN commit `36f76e3`; static-import build fix `96d54a3`; 14/14 targeted tests (6 new capability tests plus retained media-organization regressions); media-filter core at 100% function and 91.36% line coverage; media-organization/metadata core at 93.88% function and 91.15% line coverage; repository suite 411/411 from the repository root with the required `apps/web/test-preload.ts`; standalone TypeScript and targeted ESLint passed; clean-worktree production build passed compilation, TypeScript, page data, and static generation; real-project browser verification applied a `select` tag, favourite, and blue colour label to `DSC_5396.JPG`, combined favourite and tag filters to return 1/44 assets, refreshed to prove persistence, then removed all verification metadata; zero application warning/error; screenshots `M02-advanced-media-filters.png` and `M03-batch-metadata-editor.png` | Both capabilities complete |
| 2026-07-28 | M01                | RED commit `53b94a4`; GREEN commit `c71775f`; 5 targeted tests; media-organization core at 92.5% function and 88.67% line coverage; full suite 405/405; standalone TypeScript and targeted ESLint passed; clean-worktree production build completed compilation, TypeScript, page data, and static generation; real-project browser verification created a root bin and nested child, renamed it, moved a real asset from the context menu, verified direct counts and filtered contents, deleted both bins while retaining and rehoming the asset, undid the deletion, refreshed to prove persistence, then removed the test bins and restored all 44 assets to Unfiled; zero browser warning/error; screenshot `M01-nested-media-bins.png` | Capability complete |
| 2026-07-28 | W08                | RED commit `9384172`; GREEN commit `d1bad1e`; 7 targeted tests; precision-trim core at 86.67% function and 83.54% line coverage; full suite 400/400 using the required `apps/web/test-preload.ts`; standalone TypeScript and targeted ESLint passed; clean-worktree production build completed compilation, TypeScript, page data, and static generation; real-project browser verification moved a shared Roll cut while preserving pair duration, moved a middle clip with Slide while rolling both neighbours, verified mode availability feedback, undid both changes, and restored Standard/Ripple Off; screenshot `W08-precision-trim-modes.png` | Capability and M1 milestone complete |
| 2026-07-28 | W07                | RED commit `57e699f`; GREEN commit `0e02216`; 7 targeted tests; track-control core at 100% function and line coverage; full suite 393/393 using the required `apps/web/test-preload.ts`; standalone TypeScript check passed; clean-worktree production build completed compilation, TypeScript, page data, and static generation; real-project browser verification covered five-type add menu, inline rename and undo, lock/unlock, solo on/off, 65→101 px resize and undo, visible type compatibility, and restored defaults; zero browser warning/error; screenshot `W07-professional-track-controls.png` | Capability complete                                                                 |
| 2026-07-28 | W06                | RED commit `08da1db`; GREEN commit `8ea67f7`; TypeScript narrowing fix `d41be99`; 2 targeted status-view tests plus 2 retained toolbar-accessibility tests; full suite 386/386; clean-worktree production build completed compilation, TypeScript, page data, and 18 static pages; real-project browser verification toggled Snap On/Off and Ripple Off/On, selected a real video, changed Audio Linked to Separated and recovered it to Linked, then restored mode defaults; zero browser warning/error; screenshot `W06-persistent-edit-mode-status.png` | Capability complete                                                                 |
| 2026-07-28 | W05                | RED commits `51b006c`, `0ce61e5`; GREEN commit `fbf857a`; 6 targeted tests; navigation core at 100% function and 96% line coverage; full suite 384/384; clean-worktree production build completed compilation, TypeScript, page data, and 18 static pages; real-project browser verification covered true fit at 552/552 px, reveal playhead, overview click and drag, persistent narrow-screen controls, and 40 px horizontal-wheel navigation; zero browser warning/error; screenshot `W05-timeline-navigation-overview.png` | Capability complete                                                                 |
| 2026-07-28 | W04                | RED commit `64897bf`; GREEN commit `6487908`; 7 targeted tests; new transport timing core at 100% function and 98.75% line coverage; full suite 378/378; production build compiled and passed TypeScript before the existing `/_not-found` prerender failure; real-project browser verification covered start/end, exact previous/next frame stepping, play/pause, 2x playback, loop wrap, and Performance preview cadence; screenshot `W04-playback-transport-controls.png` | Capability complete                                                                 |
| 2026-07-28 | W03                | RED commits `c9f6ac8`, `d50740a`; GREEN commit `07bef55`; 11 targeted tests; new navigation, action planning, and inspector-control modules at 100% line/function coverage; full suite 371/371; production build compiled and passed TypeScript before the existing `/_global-error` prerender failure; real-project browser verification covered previous/next/current keyframe state, expanded lanes, Meta multi-select, clipboard enablement, one-frame movement, interpolation, and curve editing; screenshots `W03-keyframe-navigation-toolbar-curve.png` and `W03-keyframe-multiselect-lanes.png` | Capability complete                                                                 |
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
