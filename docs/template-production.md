# Automated Template Production

The template production pipeline accepts Agent-authored editable designs, compiles
each against measured sample inputs, renders previews through the actual WebCodecs
editor, and publishes technically verified templates to the local template library.
Business state and validation live in Rust. The MCP/CLI adapter only transports
requests and drives the browser renderer.

## Generalization and Agent Adaptation

Follow [模板泛化与 Agent 应用规则](template-generalization-policy.md) when authoring or applying designs. Keep style invariants in the template; let the Agent adapt individual inputs within declared constraints. Application tuning must not silently overwrite library defaults. Validate generalization on unseen inputs with the saved version frozen; document adjustments and inspect actual effects.

## Run

### Production Content Check

Before creating projects, the production form calls Rust `/templates/plan` for
every selected template/input pair with the current transcript, semantic units,
caption spans and scoped resource overrides. Invalid content boundaries stop
submission before project creation. Plans report `content_missing_keyword:`
warnings for unannotated semantic units when the template has a keyword binding
whose intent filter applies. This is a content warning, not an execution error:
users may add keywords or explicitly continue without them. Continuation applies
only to the exact checked payload; changed content requires another check.
This check does not replace compilation or full media/execution preflight.

Desktop and mobile verification covers no premature production submission,
changed-payload rechecking and explicit continuation. The production endpoint was
intercepted for this UI check, so it creates no additional exports. Evidence:
`~/Downloads/template-content-precheck-2026-09-18`.

### Caption Boundary Editing

`POST /templates/captions/edit` accepts `wordCount`, `captionSpans` (ordered
`{startWord, endWord}` ranges, end exclusive), and an `action` of
`{kind: "split", index, at}` or `{kind: "merge", index}`. It returns
`{captionSpans}`. Ranges must cover all words exactly once; splits must be inside
a range and merges require a following range. Optional `semanticUnits` validate
the semantic partition and prevent merging captions across its boundaries.
This operation changes display
boundaries only: it neither accepts nor modifies semantic annotations or measured
word times. Pass the result as the production sample's `captionSpans`.
The production form offers automatic or custom segmentation, split/merge controls,
and includes custom spans in each sample. Automatic mode sends empty spans so each
template retains its own segmentation rules. It supplies semantic annotations to
the edit endpoint for early merge validation. Changing semantic boundaries after
custom caption editing can still require caption adjustments before production;
the compiler remains the final validator.

Start the configured local web and Rust services. Chrome is required by the preview
adapter; set `MOIRAI_CHROME` to its executable if it is not in the default location.
Rust starts the adapter in a persistent render job. The adapter starts its own
headless browser and leaves other browser tabs untouched. New batches automatically
queue compilation, rendering, technical verification and publication. CLI commands
submit or resume this same native job and wait for its result; closing the CLI does
not stop the native worker.

```sh
bun run templates:produce --designs /absolute/path/designs.json
bun run templates:produce --manifest /absolute/path/production.json
bun run templates:produce --batch production-BATCH_ID
```

The `--batch` command retries rendering for a submitted batch. Resume a paused batch
first using the dashboard or `control_template_production`. Finished items are skipped; completed
preview paths are retained in the native batch record. If a running export disappears
because its browser was closed, the next invocation starts a new export. A slow
export that is still present is polled rather than restarted. Template publication
has a durable idempotency receipt.

The workbench at `/templates/production` shows compilation and preview status,
per-fixture failures, pause/resume/retry controls, and playable published previews.
Importing a manifest there also materializes shared assets and queues automatic
rendering and publication. Compilation and rendering have separate job statuses;
`renderJob.succeeded` plus every item `published` proves technical completion.
Historical batches waiting for previews have a generate-and-publish action.
Failed compilations and failed renders remain visible and can be retried.

Each published preview has an Edit Sample link to its independent fixture project.
Rust supplies `fixtureProjects` with explicit fixture indices and project IDs;
historical entries derive this mapping from their immutable production request
without changing item revisions. The links open the editable timeline, while the
published MP4 remains the batch's recorded preview. Editing a sample does not
automatically revise the reusable template or replace its published preview.

Desktop/mobile navigation was verified against all four fixtures in
`production-e67fa49e50ca0beee16b8230413ed6df`, and the first link was opened in the
editor with its actual text, image, sticker and source-audio tracks visible.
Evidence is retained in `Downloads/template-editable-links-2026-09-17`.

Rendering uses a separate serial worker lane with a filesystem lock. On Unix the
adapter inherits the lock, so a restarted service waits for a surviving adapter to
exit before resuming. A timeout is not treated as proof of process death. Other
compilation and media jobs can continue while rendering runs. The lock inheritance
behavior is covered by a real subprocess test; Windows recovery is not yet verified.

For a relocated checkout set `MOIRAI_TEMPLATE_REPOSITORY` on the native service;
`MOIRAI_JS_RUNTIME` selects Bun/Node. The source checkout and local setup's Bun are
detected by default. Set `OPENCUT_BASE_URL` on the native service when the web editor
uses a different port, and `MOIRAI_CHROME` for a non-default Chrome path. Render logs
are retained under the native `templates/production` directory per batch.

## Authoring From Library Inputs

Internal quality reviews are submitted to `POST /templates/reviews` using the
`qualityReview` schema. Rust checks the current template revision, published batch
item, all preview hashes and technical checks, with at least three distinct preview
files. These checks establish evidence identity, not that the inputs are semantically
different; input diversity and visual findings remain the reviewer's responsibility.
Five bounded rubric scores require written reasons, inspection scope, limitations,
reviewer identity, listening status and explicit blocking findings. Rust computes
the total and marks the internal threshold only when the total is at least 90 and
there are no blocking findings. This does not certify perceptual listening.

Reviews are content-addressed records separate from technical publication. The
preview catalogue attaches a review only to its exact template revision, batch,
item and still-matching preview hashes. Changing a template or replacing a preview
does not inherit the prior score. The workbench displays the internal score,
deductions and listening limitation in the saved-preview view; dirty drafts keep
the existing saved-version warning. `aestheticQualityVerified` remains separate
from these scoped internal reports.

Text elements can bind to `semantic_number` for the one-based semantic-section
number. The number comes from the event's semantic index, not caption order or
the count of rendered instances: splitting a section into multiple captions keeps
its number, and filtering sections does not renumber the survivors. Events without
a semantic association produce no number. Use semantic scheduling with
`endAtNextEvent` for a section badge that remains visible between spoken phrases.
The workbench exposes this as `段落序号` in content binding.

`produce_templates` is the Agent entry point. Read `productionAuthoringInput` from
`template_schema`; the same request can be passed to the `--designs` CLI flag.
It takes a stable `idempotencyKey`, `name`, `brief`, 1-100 `designs` and 1-8 `samples`.
Each design is a complete editable `template` plus its library `baseRevision`.
Each sample identifies an imported `inputId`, reviewed `transcriptRevision`, title,
and optional semantic units, caption spans, translations, shared resource bindings,
events and normalized `focalPoint`. Every design is tested against every sample.
No fixture project IDs, media indexes or hand-assembled CompileInput are required.

Samples also accept `designResourceBindings`, a map from design template ID to
resource-binding arrays. Use this for independent per-template replacements within
one batch: identical slot IDs in two templates need not share an asset or media
type. Rust rejects unknown designs, unknown slots and duplicate slot overrides;
each design's bindings override shared sample bindings for the same slot. Existing
shared bindings remain strict and must be valid for every affected design. Empty
maps are omitted on serialization to preserve replay fingerprints of older requests.
The production form submits replacements through this scoped map.

Motion treatments may set `repeatSeconds` (0.2–60). Every channel must include
matching values at normalized times 0 and 1 so the loop closes. Rust expands
cycles over each instance's actual duration into editable keyframes, preserving
composition with existing motion. Omit the field for legacy single-cycle timing.
`capabilities.motionLoop` advertises the execution constraints.

`/templates/stickers` lists or registers immutable, content-addressed sticker
recipes: shared image, independently editable looping motion, preview-video asset,
name and tags. Source provenance is copied from the image asset. The registry
requires a valid closed motion and a preview covering a full cycle; visual
correspondence between the preview and recipe still requires production review.
`/templates/stickers/insert` returns an unsaved template draft with an independent
element, resource slot/binding, treatment and application. It validates instance ID
collisions and template bounds. `stickerRecipe`, `stickerInsert` and
`capabilities.animatedStickers` expose the contract to agents. The workbench's
animated-sticker view uses these endpoints and the existing save/copy controls.

`POST /templates/elements/remove` accepts `{template, elementId}` and returns a
validated unsaved template draft. Rust removes references from groups, treatments,
transitions, spatial relations and scheduling. Affected effects are removed only
when no surviving application uses them. The removed element's resource slot and
binding are retained if another element, secondary view or fallback uses the slot.
Shared assets themselves are never deleted. Unknown IDs and removal of the final
element are rejected. The agent schema exposes this request as `elementRemove`.

The Rust preparation endpoint pins measured words, source hashes, duration and
annotations in an immutable draft. It validates current template and transcript
revisions, constructs source tracks, and allocates independent preview identities.
The platform adapter supplies its existing empty-project serialization, copies
verified original media bytes, creates projects through the CAS writer and submits
the manifest to normal automatic production. Video samples use source-layout
framing; audio samples use an audible upload track. Original content is retained,
including source audio; shared visual bindings are materialized as usual.

For a non-speech design, omit `transcriptRevision` and provide explicit `events` or
`soundEvents`. Their evidence and timestamps remain caller supplied; preparation
does not invent ASR words or claim to have measured those events. The corresponding
template must schedule visual elements from those events.

Reusing an unchanged authoring key reuses the pinned draft, including its original
transcript snapshot even if the library transcript subsequently changes. Interrupted
project/media preparation resumes from verified files; modified project documents
or corrupt/changed media are refused. A transport-only media index stub can be
completed after its bytes pass hash verification. Once a batch exists, retry returns
that batch without touching its now editable projects. Change the key when changing
designs, samples or annotations. Draft preparation itself does not queue a renderer
until platform materialization and submission finish.

The project skill `.agents/skills/moirai-cut-template-production/SKILL.md` describes
reference inspection, orthogonal design, sample choice, submission and actual-frame
review. Agent authorship remains required; the new entry point automates preparation
and production, not aesthetic decision-making or a separate image/video generator.

## Explicit Fixture Contract

Read `template_schema.productionInput`. A batch contains a name, creative brief,
durable `idempotencyKey`, and 1-100 items. Each item has a complete v2 `template`,
the expected library `baseRevision` (0 for new designs), and 1-8 `fixtures` using
the authoritative `CompileInput` schema.

Create a separate project for every fixture, named `Template Production / ...`.
Import sample assets through the normal media importer and build a source document
with the sample narration or video. Pass its exact revision and media index.
Every existing timeline element needs its canonical `params` object. Uploaded audio
uses `sourceType: "upload"`, `mediaId`, and `params: { volume: 0, muted: false }`
(volume is in dB). Legacy top-level volume/muted fields are not sufficient.
The production renderer only writes these explicitly designated fixture projects;
the normal project CAS writer and compiler replay checks reject stale contexts.
Fixture projects are retained as editable examples, not deleted after publication.
Items with aligned speech require an audible timeline source by default. For an
intentionally silent caption design set `allowSilentPreviews: true` on the item.
This explicit exception does not disable stream coverage checks when its actual
timeline contains audio. It is stored with every compiled fixture for later audits.

Template text should bind to title, sentence, keyword or other semantic input.
Use resource slots for replaceable assets; sample project media IDs belong in
fixture bindings, not in a reusable design. Use measured transcription for speech,
and review ASR text before submission. Clearly mark author-created design choices;
reference analysis does not recover another product's proprietary editable template.

### Shared Visual Assets

`import_template_asset` accepts `visualAssetImport` from the native schema: a local
file path, image/video kind, name, description, tags and a provenance statement.
Rust snapshots the file and records the source hash, normalizes stills to RGBA PNG
and short videos to silent H.264 MP4, and retains immutable content and metadata.
The limits are 512 MB, 8192 pixels per dimension and 120 seconds for videos.
Use the existing sound catalog separately for audio. Importing a video as a still
is refused: extract and identify the intended frame explicitly.

Put the returned `visual-...` asset ID into a template `resourceBindings` entry.
`list_template_assets` exposes reusable assets and their dimensions, tags and hashes.
`apply_template` and the shared web production transport (used by the dashboard,
`create_template_production` and manifest CLI) automatically
copy selected shared assets into each project's media store before compilation.
Application bindings and explicit visual bindings can override the default; disabled
bindings do not import it. A project-local override remains a project-local asset.
Direct native `/production` calls still require prepared fixture media, because
the native service does not own the web project's file transport.

Materialization verifies SHA-256 before writing and before reusing existing copies.
Changed metadata or corrupt/missing indexed files produce an explicit error; they
are not silently overwritten. Import retries with identical content and metadata
reuse the same shared ID. Batch preparation returns a new request snapshot and
leaves the submitted manifest file unchanged. Provenance is caller-supplied;
this catalog does not certify licensing or aesthetic quality.

MCP exposes `create_template_production`, `list_template_productions`,
`read_template_production`, `read_template_production_item`,
`control_template_production`, `execute_template_production`,
`audit_template_production_item`, and `publish_template_production_item`.
`produce_templates` is the higher-level entry point described above.

## State and Verification

Each item moves through `queued -> compiling -> render_ready -> published`.
Failures are recorded per fixture and do not stop the rest of the batch. Duplicate
designs within a batch are `rejected`; the fingerprint ignores top-level names,
descriptions, tags, revisions and evidence, but is not a perceptual similarity model.
Changing an item requires a new immutable batch submission, not editing its snapshot.
Cancellation is observed at item boundaries and while the adapter polls exports.

`published` requires a preview for every fixture, matching request fingerprints,
matching canvas dimensions and duration, and successful full video decoding.
Video stream duration is checked independently of container duration. When the
compiled scene requires audio, missing or truncated audio streams block publication.
Stereo PCM measurements record RMS, sample peak and near-full-scale samples;
near-silence and near-full-scale warnings are advisory, not listening approval.
The dashboard and `audit_template_production_item` can recheck historical previews
using the current item revision. Rechecks retain an audit record and expose failures;
they do not revoke an already published template. Old unaudited previews are marked
as such. These checks cannot detect every missing sound within a full-length mix.
Previews are copied into the native production store and SHA-256 recorded before
template saving. Saving uses existing revision checks and immutable template history.

Rendered evidence is supplied by the renderer adapter. File validation alone cannot
prove that arbitrary manually submitted pixels correspond to a particular design.
`aestheticQualityVerified` remains false: technical completion does not prove good
typography, coherent narration, originality, or preference over a reference.
Real review and comparisons remain necessary to establish those claims.

## Current Scope

The Agent is the design author; this is not a new independent text-to-template LLM
service. The manifest captures those authored outputs and the pipeline automates
their production. A single adapter renders sequentially to avoid sharing a live
editor or overloading the encoder. There is no distributed render farm or measured
daily throughput claim. Shared visual assets now support cross-project reuse;
multi-asset package versioning and perceptual duplicate detection remain separate work.

## Verified Local Trial (2026-09-17)

A five-design product narration batch completed real compilation, browser MP4
rendering with audio, full native decode validation, and template publication.
The input used an existing library product shot, a derived still, and locally
synthesized narration with measured transcription. Each design used one fixture.
Re-running the completed batch skipped all five published items. Desktop and mobile
dashboard playback and layout were checked. This validates the production path for
this sample; it does not establish general image/video generation, cross-input
robustness, or aesthetic equivalence to Kaipai templates.

A subsequent three-design batch tested keyword emphasis, semantic sidebars and
paired scene dissolves against two measured narration inputs (roughly 7 and 12
seconds). The recipes use independent semantic-event scheduling for visual holds
and caption events for dialogue. `endAtNextEvent` bridges speech pauses without
altering source audio or word alignment. Review includes entry, stable display,
the actual dissolve boundary and exit frames. These are authored example designs,
not a validated broad aesthetic benchmark or an automatic reference reconstruction.

The automatic web trial exposed a cross-project edit replay bug: using the same
edit idempotency key in two projects returned the first project's result without
writing the second. Replay receipts now include project identity and refuse changed
payloads. A regression test exercises two project writes, exact retries and key
conflicts through the MCP server. Historical previews missing narration are retained
with failed audio audits; corrected runs use new immutable fixture projects.

Corrected batch `production-60daea97d8b156f200134b3116053e4e` was submitted from
the browser using a raw manifest with shared catalog bindings, without preloading
those images into the four projects. Both designs compiled and all four MP4s
rendered, passed audio checks and published automatically. Every fixture was
checked for narration before submission and required/present audio after export.
Repeating the manifest and CLI dispatch preserved item revisions, export job IDs
and preview hashes. This verifies automated execution on the sample, not Kaipai
visual parity, general generated assets or real-person footage robustness.

## Text Regions

Compiled text carries `text.maxWidth`, `text.maxHeight` and `text.maxLines` from
the element region and style. The browser uses actual font metrics and Unicode
word boundaries to wrap before reducing font size, retaining the complete text.
Long unbreakable words shrink to fit. Explicit authored line breaks are preserved;
their count can exceed the automatic wrapping budget. Legacy text without a line
budget retains its existing fitting behavior. Tests cover English sidebar phrases,
Chinese content, unbreakable words and region height. Caption word timings remain
independent of glyph wrapping.

## Speaking Video Trial (2026-09-17)

Batch `production-7ab56ae9a5b19bcb11867e7d8ccace7e` applies two editable designs
(portrait emphasis with a paired dissolve/punch-in, and editorial sidebar) to two
different excerpts from the NIOSH Elizabeth Masterson interview. The Commons file
page 58140712 labels the source public domain. Source metadata and SHA-256 are
retained with the local sample artifacts. Speech timing was measured locally;
Chinese translations and semantic annotations are Agent-authored, not recovered
from Kaipai. The source has no burned-in subtitles in the selected excerpts.

All four real exports published with audio stream coverage checks. Compiled source
layouts retain one continuous narration interval while pictures change. Original
versus exported decoded PCM correlation is 0.9962-0.9967 after an approximately
47.9 ms offset adjustment. This revealed export audio latency in that historical batch; it does not
prove sample-accurate lip synchronization or perceptual audio quality. No unreviewed
sound effects were added. A deliberately merged English caption still reports the
60-character budget advisory; rendered two-line text was reviewed without clipping.

The second rendering pass fixes long sidebar phrases shrinking into tiny single
lines by carrying and executing the style line budget. This is evidence for two
designs on one speaker, not a benchmark across speakers, camera angles, source
languages, effect families, or aesthetic parity with Kaipai.

## Native AAC Finalization

MP4 exports with AAC audio now render a temporary MOV containing the original
float PCM mix. `POST /exports/audio` in the Rust footage service validates that
intermediate, encodes AAC with FFmpeg, and copies the video stream into MP4.
FFmpeg records encoder priming in the container; no fixed time subtraction is
applied to speech, captions or pictures. MOV is used because older FFmpeg versions
do not recognize the newer ISO PCM sample entries in MP4. WebM and silent exports
retain their existing path.

The web renderer checks the local service before rendering and reports failure
instead of silently falling back to the delayed browser AAC encoder. Consequently,
MP4/AAC export requires the local footage service and FFmpeg. The authenticated
endpoint streams temporary files, limits uploads to 2 GiB and encoding to two
concurrent requests, and cleans up on completion/error/disconnection. Cancellation
aborts the browser request; an already running native encode finishes within its
timeout and then releases its temporary files. Export completion and 100% progress
are reported only after the finalized MP4 has returned.

A standalone known-PCM browser experiment reproduced 2112 samples (47.891 ms at
44.1 kHz) of AAC encoder delay while source-video decoding had zero measured lag.
The native replacement measured zero lag. The explicit FFmpeg integration test
`native_aac_preserves_sample_alignment_and_video_frames` verifies correlation at
the beginning and end, zero best-fit sample lag, unchanged decoded video frames,
and rejection of already compressed AAC input. Run it with `FFMPEG_BIN` and
`FFPROBE_BIN` set and `cargo test -p moirai-footage native_aac_preserves --lib -- --ignored`.

Batch `production-e6ac290c387e836b4e3e3bf1fc82fa69` reran the two speaking designs
against both original inputs through automatic production. All four previews
published at template revision 3. Each measured zero lag at 16 kHz against original
speech, with correlations 0.99977-0.99985. All 1258 decoded video frames matched the
previous batch exactly. Desktop/mobile playback and layout passed. Evidence files
are `original-audio-comparison-v3.json`, `video-comparison-v3.json`, `result-v3.json`
and the `review-v3-*.png` contact sheets in the speaking trial artifacts. These
measurements establish synchronization for this trial, not perceptual sound-effect
approval or broad aesthetic parity.

## Authoring Entry Trial (2026-09-17)

Two real MCP `produce_templates` calls prepared and produced eight previews without
manual project creation, source insertion or media import calls:

- `production-772b4c04db0da0f535bef522454c6322`: two speaking designs on two original videos.
- `production-291029d2a798b2cf0fd1cb5e786240ee`: two product designs on two local TTS inputs,
  with automatic materialization of the shared product image.

All four designs published with both previews. Identical MCP requests returned the
same batches without extra project writes; the `--designs` CLI also resumed the
existing product batch. Source-to-preview PCM comparisons measured zero lag at
16 kHz for all eight exports, correlations 0.99977-0.99994. Representative frames
and desktop/mobile playback were checked. Requests, results, contact sheets and
`audio-comparison.json` are retained in the `template-production-authoring-2026-09-17`
trial artifact directory. The trial reuses known designs to verify the new preparation
path; it does not expand the established style or aesthetic benchmark.

## Original Style Families Trial (2026-09-17)

The next design pass inspected reference-25 (torn paper), reference-47 (variety
emphasis), and reference-34 (product stickers), then authored three distinct
compositions. Original torn-paper, outlined sparkle and megaphone SVG graphics
were rasterized to transparent PNG and imported into the shared visual catalog.
Their provenance identifies programmatic drawing, not AI image generation or
graphics extracted from the references. Text remains a separate editable layer.

| Template | Source fixtures | Final batch |
| --- | --- | --- |
| original-torn-editorial | Two Chinese product narrations | production-87979c667ac81efe5c0c94004dfea261 |
| original-variety-bounce | Two Chinese product narrations | production-87979c667ac81efe5c0c94004dfea261 |
| original-promo-sticker | Two Chinese product narrations | production-87979c667ac81efe5c0c94004dfea261 |
| original-torn-editorial-speaking | Two original interview excerpts | production-d365750bae75b2d062be9275de97f5df |
| original-variety-bounce-speaking | Two original interview excerpts | production-d365750bae75b2d062be9275de97f5df |

All ten final previews were rendered and published through `produce_templates`,
with independent editable projects. Review covered entry, stable display, emphasis,
exit and actual camera-change boundaries, plus desktop/mobile dashboard playback.
Chinese product captions and bilingual interview subtitles were checked separately.
The original speaking pass used a dissolve into the close-up; boundary frames
exposed double-face ghosting. Revision 2 keeps the paper composition steady and
uses a direct close-up cut for the variety composition. The correction was made in
the reusable templates and all four speaking previews were produced again.

Every final preview passed full decoding and audio coverage checks. PCM comparison
against the original source measured zero best-fit lag at 16 kHz, with correlations
0.99977-0.99994. No unreviewed sound effects were introduced. Programmatic asset
creation, automatic catalog import, reuse across product and speaking designs,
and batch production are demonstrated by this trial. General AI image/video
generation and broad aesthetic parity with Kaipai remain unverified.

Local evidence lives in the `template-style-families-2026-09-17` and
`template-style-families-speaking-v2-2026-09-17` Downloads directories: immutable
requests, batch results, item documents, representative-frame contact sheets,
audio comparisons and desktop/mobile screenshots. SVG sources and asset receipts
are in the product directory; `transitions-1.png` in the final speaking directory
shows frames immediately before, at and after each direct close-up cut. The initial
speaking pass is retained separately as `production-147c0af72c19e094a8055e94950bd5b1`.

## Inline Emphasis Trial (2026-09-17)

Two further templates use independent `text_highlight` treatments to color semantic
keywords inside intact sentences. Rust resolves measured word spans into UTF-16
ranges; the browser maps those ranges through measured wrapping and draws the
whole shaped line with hard color stops. Highlighting composes with the existing
outline and caption-settle motion. It does not split captions into positioned word
elements, change narration timing or infer translation word alignment.

- `production-347cb927786327c5938a058bcf62d642`: `original-inline-product`, red keyword
  fills in Chinese product captions, two measured narration samples.
- `production-fb03960a0cf1d3272d936ff554b05300`: `original-inline-speaking`, yellow
  keyword fills in English interview captions with separate Chinese translations,
  two original video samples.

All four previews published, passed decoding and audio coverage checks, and measured
zero best-fit audio lag at 16 kHz. Desktop/mobile playback and actual caption frames
were reviewed, including a keyword crossing an English line break. An isolated
Chrome pixel check confirmed that highlighting the second occurrence in `go go now`
changes that occurrence while leaving the others white. The native canvas test
library renders hard-stop text gradients differently, so actual Chrome rendering,
not native-canvas pixel equivalence, is the visual evidence. Unit tests cover range
intersection, Unicode indexing, duplicate words, wrapping, stale text metadata,
incompatible targets and composition with motion.

Evidence is retained in `Downloads/template-inline-highlight-2026-09-17`, with
separate `product` and `speaking` requests, batch results, contact sheets, audio
measurements and browser screenshots. This extends the demonstrated typography
capabilities; it does not establish general AI media generation or aesthetic parity.

## Word-Follow Trial (2026-09-17)

`text_highlight` now also accepts `mode: "active_word"` on sentence-bound text.
Rust compiles measured word intervals into the existing discrete animation channel
for `text.highlightRange`; the browser samples that channel at the element's local
time. Pauses clear the highlight, seeking uses the same clock as other animation,
and incoming transition preroll shifts the keys while retaining an uncolored lead-in.
This is per-word switching, not an invented constant reading speed or within-word
karaoke sweep. The omitted mode retains existing keyword behavior and serialization.

- `production-ef622f00898923ea7000bb81adb483e7`: `original-word-follow-product`, two
  Chinese narration samples with red word-follow captions.
- `production-027619aaf8b082f4a12ec34abb9636ac`: `original-word-follow-speaking`, two
  original interview samples with yellow word-follow English and separate Chinese
  translations. Translation timings remain at caption level.

All four previews published and passed decoding, audio coverage and desktop/mobile
playback checks. Representative exported frames show the active word moving through
the original sentence, including wrapped English. Source-to-export PCM comparison
measured zero best-fit lag at 16 kHz. Unit tests cover pause boundaries, reverse seek,
delayed text entry, motion composition, invalid bindings and transition preroll.
Requests, results, frame sheets, audio comparisons and browser screenshots are in
`Downloads/template-word-follow-2026-09-17/{product,speaking}`. This adds an executable
style dimension for batch authorship; general AI image/video generation remains
outside the verified pipeline.

The template workbench exposes `text_highlight` as a treatment with keyword and
active-word modes and a color swatch. Desktop (1440 px) and mobile (390 px) trials
changed the mode and color, exported the draft JSON, and passed native template
validation without saving changes to the library. Evidence is retained in
`Downloads/template-workbench-controls-2026-09-17`. Web type checking also passed.

## Multiple Aspect Ratios Trial (2026-09-17)

Batch `production-43a6e37c4831d5d16b5114dce4e090b8` produced two independently
arranged product designs: `original-product-follow-landscape` (960 x 540, image
and text columns) and `original-product-follow-square` (720 x 720, stacked image
and captions). Both used the two existing measured Chinese narration samples,
longer titles and paragraph-level caption spans. Semantic annotations were grouped
into complete introduction, portability and conclusion units; measured word times
were retained. The initial request was correctly rejected because its captions
crossed the previously supplied semantic boundaries.

All four final previews published and passed decoding, audio coverage and desktop
and mobile playback checks. Source audio correlation measured 0.999827-0.999936
with zero best-fit lag at 16 kHz. Frame review confirmed full title/caption text
and changing active-word highlights. Longer spans retain character/duration budget
warnings; the square layout still has short trailing lines, so this trial does not
establish polished typography for arbitrary content. The production page now uses
the video's intrinsic aspect ratio instead of forcing every preview into 9:16.

Requests, batch/item records, frame sheets, audio measurements and browser
screenshots are retained in `Downloads/template-multiformat-2026-09-17`. This
expands tested output formats, not the number of distinct source products or
speakers, and does not verify AI media generation.

## Balanced Caption Lines Trial (2026-09-17)

The browser now balances automatically wrapped centered text after choosing its
font size and line count. It narrows the wrapping width using measured glyphs,
without adding lines, splitting words, changing explicit paragraph boundaries or
changing left/right-aligned layouts. This is a rendering decision; semantic
segmentation and measured word timing remain in Rust. Existing highlight ranges
are mapped through the resulting lines as before.

Batch `production-e67fa49e50ca0beee16b8230413ed6df` re-rendered the same two
multi-format templates and two inputs at template revision 2. All four previews
published. Actual frame comparison shows the square caption's short trailing
words redistributed into balanced lines and long titles balanced without a font
size reduction. Decode/audio coverage, zero best-fit audio lag at 16 kHz and
desktop/mobile playback passed. Nine focused text tests and web type checking
passed, including cross-line highlight mapping and explicit paragraph preservation.

Evidence lives in `Downloads/template-balanced-lines-2026-09-17`; compare its
frame sheets with the preceding multi-format trial. Balancing optimizes measured
line width, not linguistic phrase boundaries or overall aesthetic quality.

### 内容短语的优先同排

生产 `samples[]` 与计划输入可选 `layoutPhrases`，例如
`[{"wordSpan":{"startWord":13,"endWord":15}}]` 表示第13、14号对齐词优先同排（零起点、末端不含）。范围需要非空、按序、不重叠且在当前转写内；生产仍须固定 `transcriptRevision`。该字段属于内容应用，不保存进独立样式，也不复用 `semanticUnits[].keyword`。

Rust将完整包含的短语映射到实例的静态 `text.layoutPhrases`（原文和UTF-16范围）；字幕跨段时返回 `layout_phrase_crosses_caption:index:start:end` 并忽略该提示。不要为消除警告改造或伪造音频词时间。渲染器按实际字宽优先同排；短语过长会正常换行，显式换行优先，手工修改原文后过期范围失效。提示不影响逐词高亮，不保证任意画幅或字号下绝不换行。

工作台试映内容的“短语排版”可选择起止词、取消、随试映内容保存和恢复。校正转写后清空旧短语并需重新选择。此功能使用普通文字区域适配；双语专用排版尚未接入。成片的文本属性面板提供独立的同排短语选择、移除与清除；文案更改后旧范围失效，恢复原文可重新匹配。内容关键帧控制时不允许新增静态范围。

### Independent Text Background Motion

`MotionProperty.background_opacity` animates only an enabled text background;
text fill, outline, highlight, word alignment and element opacity are independent.
Element motion values are absolute alpha in `[0,1]` and compile to editable
`background.opacity` keys. In a reusable `motion` treatment the same channel is a
multiplier of the authored/static or already animated background alpha, matching
other composable opacity treatments. `motionTiming` and closed repeating treatments
use the existing timing rules. Values outside `[0,1]`, non-text targets, missing
backgrounds, layouts and isolated composite groups are rejected; shared groups
must consist entirely of text elements with backgrounds. The renderer clamps the
sampled alpha to `[0,1]`, including easing overshoot, without changing text alpha.

The current schema advertises `backgroundOpacityMotion` and includes the channel
in `motionChannels`. The style motion inspector exposes the track for text layers;
enable the background in Appearance first. Timeline editors use the same ordinary
keyframe parameter, with the label “底板不透明度”. No new timing is stored in the
style: fixed entry/exit phases still resolve against each applied sound event.

### Trial content exchange with an agent

The sound trial page (`/templates/effects/:id/try`) exposes **与 AI 交换试映内容**.
Export the current content JSON, edit its annotations, then import it to continue
human editing. This file contains input references and content configuration;
it does not contain a style definition, media bytes, or fixed timeline elements.
The selected style and placement remain controlled by the current page.

The transport envelope is the same versioned representation used by the page's
session save/restore:

```json
{
  "version": 1,
  "entries": [
    {
      "inputId": "input-existing-local-id",
      "transcriptRevision": 1,
      "title": "A real source",
      "semanticUnits": [],
      "captionSpans": null,
      "resourceBindings": []
    }
  ],
  "liveInputId": "input-existing-local-id"
}
```

Export first to obtain real input IDs and measured transcript revisions. Each entry
also supports the existing `captionPolicy`, `layoutPhrases` and `focalPoint` fields.
An empty semantic array requests native inference; nonempty units must satisfy the
native coverage constraints. `captionSpans: null` selects automatic segmentation;
explicit spans use exclusive `endWord` indexes into that input's current transcript.
Changing spans must not invent timestamps or change the transcript revision.
Input IDs and resource bindings must resolve in the receiving local library.

Import accepts 1–8 distinct input entries and files up to 5 MB. It reads each pinned
transcript, sends all samples to Rust `/templates/samples/validate`, and updates page state only
after all entries pass. A stale revision, invalid span, missing input, duplicate ID
or malformed envelope leaves the current selection intact. Import changes the page
draft. The dedicated style trial automatically checkpoints completed content in this tab
and validates it with Rust on return; **保存试映内容** remains an independent manual
snapshot. Other production entry points retain manual restore. Export again for a portable file.
This transport is not a new language-analysis service or a replacement for native
production validation. Production still verifies its full input contract.

`POST /templates/samples/validate` accepts `{template, samples}` using the native
production `Sample` schema. Its schema is exposed as `sampleValidationInput` in
`/templates/schema`. It shares production checks for count, duplicate IDs, focal
coordinates and per-design bindings, then plans each sample with the pinned
transcript and source hash. It returns `{validated: true, samples: [{inputId, plan}]}`
and creates no projects, jobs or library revisions. Invalid input fails the entire
request. This validates structure and planning, not asset decoding or render quality.
The workbench's file format supports the fields listed above; unsupported entry
fields are rejected rather than silently discarded.

Agents can call the read-only MCP tool `validate_template_samples` with
`{request: {template, samples}}` before handing content back or starting production.
It forwards to the same native endpoint used by the workbench importer.

### Renderer editor readiness

The browser adapter retries only the structured `editor_not_ready` response from
`open_editor`, up to three calls for the same project. Each call reuses the existing
tab and performs its own bounded readiness wait. Intermediate retries emit
`waiting_for_editor` with the batch, project and attempt. Other tool failures,
transport timeouts, synchronization errors and `start_export` are not replayed.
If readiness remains unavailable, the existing native render failure/receipt path
is used; executing the same batch later reuses completed fixture exports.

### Orthogonal content and timing for agent edits

`edit_dynamic_asset_layers` with `text_presentation` changes the text binding and
highlight presentation while preserving the layer's authored timing and motion.
Creation initializes default anchors; editing an existing binding does not reset
them. Change `definition.layers[].content.element.timing` explicitly when needed,
then preview and save through the ordinary revisioned definition contract.

For example, a keyword can start when spoken and remain to its semantic unit end:

```json
{
  "binding": "keyword",
  "timing": {
    "anchor": "keyword_start",
    "endAnchor": "semantic_end",
    "offsetSeconds": 0,
    "minSeconds": 0.1,
    "maxSeconds": 3
  }
}
```

The end is still capped by the configured maximum and input duration. `cue_end`
requires an associated caption and rejects events crossing its boundary;
`semantic_end` requires a semantic association. Literal content does not supply
these associations by itself. Omitting `endAnchor` keeps the legacy default;
never infer an explicit end field from a content-binding change.

Highlight mode `keyword` holds the marked phrase within the displayed caption;
`active_word` follows individual aligned words and requires sentence binding.
Native serialization can omit the default `keyword` mode. Neither highlight
mode alone changes event boundaries, and synthetic preview times are not measured
speech evidence.

### 编辑继承的共享高亮

选中组内文字时，样式面板会显示继承的分组高亮及影响范围。可通过 `edit_dynamic_asset_layers` 的 `highlight_treatment` 操作编辑：`{kind:"highlight_treatment",layerId,treatmentId,highlight:{mode:"keyword"|"active_word",color,stroke?}}`。修改作用于该已有 treatment 的所有引用；`highlight:null` 删除该 treatment 及全部应用。所有图层的内容绑定、时间和动效保持原样，原生验证所有目标兼容性；不相关的 layerId/treatmentId 被拒绝。已禁用的共享高亮不阻止文字使用独立高亮。

同一文字元素当前只允许一个启用的高亮 treatment（包括继承）；`keyword` 与 `active_word` 不能同时写入同一元素的高亮颜色通道。独立花字和逐词字幕可在不同文字元素上组合。这是明确的执行限制，不应将多个高亮堆叠写入后期望自动合并。

外观面板中的“高亮文字单独描边”配置同一高亮操作的 `stroke:{color,width}`（画布像素，0–30）。关闭时清除局部描边，沿用普通文字样式中的描边；不会关闭文字高亮或改变普通文字样式。直接绑定和继承的共享高亮均使用相同控件，继承时仍影响该共享操作的所有引用。

文字排版为普通描边与启用的高亮描边中较大的宽度预留空间（含继承的共享高亮），再扣除底板留白；左/右对齐锚点使用同一预留。预算在整个文字实例期间固定，不随当前高亮词变化。较粗的高亮描边可能使长句重新换行或缩小以适配区域；普通描边颜色/宽度、作者字号、声音时间均不被改写。新增高亮描边已占满布局区域时拒绝编译并提示调整。选中框仍表示原有文字测量边界，不包含描边、阴影和动效外扩。

### 原片模糊铺底属于应用方案

`prepare_dynamic_asset_application` 的 `blurredBackground?: boolean` 只控制本次应用的画面适配；为 true 时由 Rust 将投影布局设为 `blurred_fill`，省略或 false 保持原布局模式。它不修改保存的样式定义、内容绑定、声音事件或字幕动效。试映页“用原片模糊铺底”支持链接恢复、会话恢复及评审方案回读。

使用已有原生布局：前景按完整比例放入 videoRegion，背景使用同一原片铺满画布并采用原生模糊 85 / 不透明度 0.65；声音只保留一份。纯音频无视频背景。当前开关未开放模糊强度和背景不透明度编辑，不应向 AI 声称支持任意数值。背景适配不属于重点词、花字或字幕样式的保存属性。

### 单个图层独立外观

`edit_dynamic_asset_layers` 新增 `{kind:"detach_style",layerId}`。多个元素引用同一个 styleId 时，Rust 复制请求草稿中的完整视觉样式，只替换选中元素的 styleId；原样式和其他图层不变。已经独立时为无变化操作，不产生多余样式。组、无样式元素及未知图层被拒绝。操作仅返回草稿，须沿用版本校验的保存接口持久化。

工作台外观面板显示共用图层及影响范围，并提供“仅为当前图层独立外观”。该操作不分离内容输入、时间绑定、动效、分组继承或共享高亮；共享高亮继续由独立 treatment 操作管理。未保存的字体等视觉修改会一起复制，避免回退到库内旧值。

### 自适应文字底板圆角

视觉样式新增可选 `backgroundCornerRadius`，范围0–100，单位为短边一半的百分比。0为直角，100为最大圆角；它不是像素，应用时缩放画布不改变该比例。Rust校验范围并映射到编辑器已有的 `background.cornerRadius` 参数；省略时不添加新参数，保留旧定义序列化及默认行为。

样式工作台和组合模板外观面板在启用文字底板后开放圆角滑杆；底板颜色、留白、不透明度和圆角分别配置。关闭底板会保留圆角设置但不绘制背景，不影响文字、重点词、声音时间或动效。当前模板契约只开放静态圆角，不能当作新增可动画通道使用。

### New reusable style semantics

The Rust `dynamic-assets/create` endpoint sets initial semantic roles independently
of appearance and content binding: `keyword` starts as `emphasis`, `caption` as
`subtitle`, and `decoration` as `decoration`. `decorative_text` starts with no role:
lettering is a visual treatment and can later serve a title, callout or other role.
These are creation defaults only. Changing library `purposes` does not reclassify
the element role, and changing content binding does not reset its timing or motion.
Existing saved definitions are not migrated by these defaults.

Humans can edit or clear a selected element's role under the style workbench's
“应用规则 → 图层语义角色”. The UI and AI use the same native layer operation:
`{"kind":"semantic_role","layerId":"headline","role":"callout"}`.
Use `role:null` to clear it. This draft operation changes only `features.role`,
rejects groups/unknown IDs and invalid Role values, and requires the usual explicit
save with the current revision. It does not infer a new content binding or retime
an element when the role changes.

### Pilot seed reruns preserve saved styles

`scripts/templates/author-style-pilot.mjs` initializes only missing pilot assets.
When its stable asset ID already exists, it projects that exact saved revision
without creating, inspecting, or saving a replacement seed. This preserves human
and agent changes such as alignment, multiline typography, colors and layer
structure. New assets are saved with `baseRevision: 0`; concurrent creation is
left to the native revision conflict check. Updating an existing style requires
an explicit revision-aware edit rather than rerunning this seed script.

`node scripts/templates/verify-pilot-preserves-library.mjs` runs the script twice
against the local service through a proxy that rejects asset mutations. It checks
all three existing pilot versions, identical manifests, and an unchanged library.
The script prepares manifests only; this verification does not submit production
or certify visual quality.

### 原生图形描边的缩放单位

矩形、椭圆等原生图形的 `strokeWidth` 使用渲染器固定 512px 源图形坐标，随后随图形几何一起变换。动态素材应用或插入改变整体尺寸时，不应再将图形描边宽度乘一次应用缩放；否则小图标描边会按比例平方缩细。文字描边使用画布像素，仍随文字应用尺寸缩放。原生投影遇到文字/图形共用样式时派生独立图形样式引用，不改保存源定义；之后捕获、再应用仍保留各自单位。此修复影响新投影和新编译的应用，已有工程内的已编译参数不会自动迁移。

### 位置建议的可选阅读预算

`dynamic-assets/placement-advice` / `advise_dynamic_asset_placement` 可接收 `readingCheck`：

```json
{"maxLines":3,"minFontSizePx":28,"samples":[{"id":"cue-1","elementId":"headline","lineCount":3,"fontSizePx":32,"overflowing":false}]}
```

数字是调用方指定的验收预算，不是所有模板的固定设计规范。行数、最终字号及溢出由实际渲染器测得；Rust不估算字体、不复制Web断行逻辑。每个文字元素至少有一个样例，调用方应提交全部待验内容；样例ID不能重复，图形或未知元素不能作为文字测量提交。此接口信任调用方的测量，不是服务器对来源/全片覆盖的认证。

任何样例超过行数、低于字号或溢出，`readingCheck.status=failed`，原本位置清晰的候选也以`reading_quality`拒绝；返回的selectedId/application/template均为空。通过时为passed，但仅说明给定预算与样例通过，不等同审美分数、语义短语完整、听感或运动期间可读。未提供为not_provided，保留兼容的几何选择，不能宣称可读性通过。更换内容、字号、字体、画幅或布局必须重新测量；位置候选仅平移，同一请求的阅读测量可复用。

当前工作台圈选面板仍只做几何建议，界面明确说明不评价文字行数、缩小字号和阅读速度；AI可通过同一原生契约提交实测数据。浏览器实测验证脚本为build-reading-probe.mjs、measure-side-reading.mjs、verify-side-reading-gate.mjs，读取现有导出编译文档，不修改工程或素材。

每条 `readingCheck.samples[]` 现在还可提供可选的稳定阅读时间：

```json
{"id":"cue-1","elementId":"headline","lineCount":2,"fontSizePx":42,"overflowing":false,"timing":{"stableSeconds":1.74,"requiredStableSeconds":1.5}}
```

`stableSeconds` 是调用方针对当前成片测得的稳定阅读时长，范围0–600；`requiredStableSeconds` 是调用方根据该段文字和语言设定的预算，必须大于0且不超过600。Rust只比较两者，不估算语言读速、不验证测量来源。任一时长不足会增加 `stable_time_too_short` finding，整体检查失败，所有候选均不可选。不能把示例的1.5秒当作模板固定阈值。

返回 `readingCheck.timingCheck` 包含 `status`、`providedSamples`、`reviewedSamples` 和 `missingSampleIds`。有不足为 `failed`；全部提供且满足为 `passed`；部分提供且无不足为 `partial`；没有提供为 `not_provided`。部分时长证据时，整体 `readingCheck.status` 为 `partial`（空间检查失败仍为 `failed`）；保留几何候选供继续判断，不宣称完整阅读通过。完全省略时长仍保留旧字号/行数检查行为，须另看 `timingCheck.status`，不能把旧 `passed` 误当时长已验收。更换内容、时长、动效或任何影响稳定阶段的组合，均重新测量。

原生调度对实际采用展示保持规则的关键词/字幕锚点补充 `display_below_readability_minimum:{JSON}` 警告，JSON含 `eventId`、`elementId`、`actualSeconds`、`requiredSeconds`、`boundaries`。这表示选中非音频层的调度时长没有达到有效 `minDisplaySeconds`；边界包括输入结束、下一关键词、最大时长、显式结束锚点，未精确归因时为 `lifecycle_boundary`。警告保持现有字符串数组协议，不改变调度或音轨；不对未采用保持规则的显式 scheduling/语义生命周期假报。诊断在 lifecycle/累积列表解析后读取最终实例边界；这些规则覆写时间后只按新的边界判断，不保留过期的时长告警。这里的 `actualSeconds` 是最终实例时长，尚未扣除入退场，不能代替 `stableSeconds`。

### 可选短语保护与自动分段（2026-09-30）

`segmentation.preserveLayoutPhrases`（或当前输入的 `captionPolicy.preserveLayoutPhrases`）默认 false；false 不写入序列化结果，旧定义保持原行为。开启时，Rust 自动分段把输入 `layoutPhrases[].wordSpan` 中有效、可容纳的短语当作整体，避免在连续字幕之间拆开。内容词下标只属于输入，模板只保存是否启用的规则；不识别或硬编码具体句子。

短语不能跨语义单元、硬停顿、说话人变化或分句标点，不能突破字数/时长预算；过长时回退原分段，跨字幕提示继续保留。显式 `captionSpans` 仍优先，词时间和音频不变。默认短语标注仍只影响行内排版；开启此选项并重新生成分段才会改变自动字幕边界。

试映页“字幕分段 → 重新生成分段 → 自动分段保留已标注短语”支持该选项，随本标签页试映内容保存/恢复；模板策略编辑器也可设置。AI 可通过同一原生计划与生产接口传递字段。它不保证阅读速度、视觉质量或任意长短语完整同排；最终仍需渲染测量和视觉审查。

### 视频音频解码证据边界

浏览器整容器 `decodeAudioData` 与逐包解码/重采样可能因 AAC priming、edit-list 和输出长度不同而产生不同PCM，即使源文件SHA和词级时序相同。生产对比应先核对源输入SHA，再用前/中/后三个窗口搜索小范围lag；最佳lag为0只能证明所查窗口无明显时间偏移，不证明全程逐样本相等。视觉模板比较不得把旧导出PCM哈希当成唯一音频真值，也不能在未解释差异前静默忽略。若需要切换解码路径，必须另做音频回归，不与模板审美分数混合。
