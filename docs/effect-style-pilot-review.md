# Effect style pilot review

Date: 2026-09-23

## Scope and result

Three editable style assets were exercised against two measured audio inputs.
Batch `production-a4accdf71389ce5f226b810ffe59ba79` completed with three technical
publications and six decoded MP4 previews. All are preview-only isolated projects.
This is evidence of the reusable-style pipeline, not aesthetic certification or
completion of the broader template-workbench goal.

| Asset (revision 1) | Purpose | Authored construction |
| --- | --- | --- |
| `style-pilot-20260923-caption` | Sentence captions | White outlined text, yellow active word, short fade/rise |
| `style-pilot-20260923-offset` | Keyword decorative text | White foreground, pink offset text layer, scale and rotation entrance |
| `style-pilot-20260923-marker` | Keyword emphasis | Dark text, chartreuse rectangle and separate side bar |

The local Kaipai variety reference was inspected as a contact sheet before authoring.
These are original studies, not extracted designs or a claim of reference fidelity.

## Evidence

Artifacts are machine-local under
`/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23/`:

- `effects.json`: saved asset IDs and pinned revisions.
- `designs.json`: three applications, two measured fixtures, preview-only manifest.
- `batch.json`: terminal render state, exported paths, hashes and audio measurements.
- `render-{0,1,2}-{0,1}.jpg`: all six exports sampled at 2 fps and visually inspected.
- `style-pilot-20260923-{caption,offset,marker}-{short,long}.png`: six completed
  workbench canvas captures; nonblank pixel checks passed.

`inspect-style-pilot.mjs` now selects the named asset rather than assuming the
asynchronously filtered list contains one button. It waits for the request matching
the asset and example, samples inside the keyword timing returned by Rust, and waits
for a new completed canvas generation. Synthetic examples are not measured speech.

`review-style-pilot.mjs` refuses an unfinished render batch, saves authoritative
batch evidence, and decodes the six MP4s into contact sheets. Empty final cells are
contact-sheet padding, not extra frames in the video.

An author-script rerun retained revision 1 for all three unchanged assets, confirming
that normalization does not create spurious revisions for this pilot.

## Visual findings

### Offset style contrast refinement, 2026-09-24

Saved `style-pilot-20260923-offset` revision 3 increases the back text offset
from (0.006, 0.012) to (0.012, 0.022) on the design canvas. Its stroke now uses
the same pink as its fill, with width 12 instead of a dark stroke at width 10.
Foreground white text and dark outline are retained. The author script supports
`PILOT_STYLE=offset` for focused iteration; rerunning retained revision 3.

Batch `production-95f43a93a2deaf3f8b6f410469b77fa9` finished with two decoded
exports and passed native audio presence/signal checks. Artifacts are under
`/Users/zhengwei/Downloads/effect-offset-refine-2026-09-24/`. Two before/after
crops compare the original pilot at left and revised output at right at the same
source times. Both comparisons and both whole-video contact sheets were viewed.

The revised pink extrusion is clearly visible on the interview and Chinese
audio-only background. Foreground glyphs remain readable and long Chinese text
is complete in inspected frames. This is a more pronounced variety/sticker
style, not proof of general aesthetic approval or reference fidelity. Original
project and historical effect revisions are preserved. Audio was not auditioned.

All six exported contact sheets were inspected. Text was readable in sampled stable
frames. The interview overlays occupied the lower torso area without covering the
face in the inspected frames. Chinese long keywords remained complete. The caption
sample showed changing active-word color; keyword samples appeared selectively.

Remaining design issues:

1. The fixed marker panel leaves excessive space around short words while longer
   phrases shrink. Content-aware padding and width need a reusable layout rule.
2. Containing a square style inside a landscape canvas creates a narrow caption
   column and early wrapping. Caption line width needs a separate application
   layout policy rather than indiscriminately stretching every decorative effect.
3. The pink offset layer is subtle over busy real footage. Its visual strength
   needs review at actual playback size before claiming reference-level quality.
4. The three effects were validated separately. A combined sentence-caption plus
   keyword-decoration composition still needs overlap and hierarchy verification.

The Chinese input is audio-only: its black background is suitable for typography
inspection but does not prove Chinese talking-head composition quality. This pass
did not listen to audio or inspect every motion frame. Audio presence, duration and
decoded signal checks passed, but perceptual audio quality remains unverified.

## Next acceptance work

Prioritize content-aware sizing and aspect-ratio-aware caption placement, then test
combined styles on clean footage with measured speech. Preserve independent style,
motion and binding contracts; keep absolute word timings in generated instances.
Do not count these three technical successes as twenty approved templates or assign
a 90+ aesthetic score from renderer success.

## Caption width follow-up

Added optional `Application.captionWidth` (0.1-1 of output width). Rust applies it
after proportional placement and optional transform, to sentence-bound text only.
It preserves the text center, font metrics, motions and keyword layers. Off-canvas
regions are rejected by the existing validator. Omission preserves legacy behavior;
the saved effect is never modified. This is explicit reflow, not automatic layout.

The trial panel exposes an independent caption-width checkbox and slider only for
applications containing sentence text. The value survives URL reload and flows
into the same application template used for previews and production. The native
schema and `prepare_dynamic_asset_application` document the AI-callable field.

Verification: 13 native dynamic-asset tests passed, web typecheck passed, and the
MCP transport test passed. `verify-caption-width.mjs` checked native output width,
URL persistence, landscape and portrait completed nonblank renders, and absence
of the control for keyword-only effects. It does not certify production exports
or solve content-sized panels and automatic collision handling.

## Content-sized text background follow-up

`Style.background` now has a companion optional `backgroundPadding: {x,y}` in
design-canvas pixels. Values must be finite and between 0 and 256. Application
scaling scales the padding along with typography. The compiler reserves space in
the text region and converts the padding to the existing renderer's font-relative
units. A background with insufficient available space is rejected during compilation.
Omitted padding preserves the old zero-inset output.

The effect workbench exposes a text-background toggle, color swatch, and horizontal
and vertical padding inputs. These fields are part of the Rust style schema and
saved definition, available to AI inspection and save without a second API.

Created independent editable study `style-pilot-20260923-adaptive`, revision 2,
named `重点标记 · 自适应底色`. The original side-bar design is retained. The new
study has one keyword text layer with an intrinsic background, rather than an
independent fixed-width panel. This is not a general attachment/layout relation.

Verification: 164 template tests passed, one existing reference-dependent test
ignored; web typecheck passed. `verify-adaptive-background.mjs` exercised real
workbench controls, saved and reloaded padding `{x:24,y:12}`, then rendered short
and long keyword examples. Green-pixel bounds measured 212 and 598 pixels on the
720px canvas. Both `/tmp/adaptive-background-short.png` and
`/tmp/adaptive-background-long.png` were visually inspected: no text clipping was
observed, and short text no longer occupies a fixed full-width panel. This pass
did not export the new study to MP4 or validate independently attached icons/bars.

## Combined production follow-up

Batch `production-1757cd99715096b352dd98bf138ef151` completed: two designs, two
measured samples each, four decoded MP4s, all audio presence/signal checks passed.
One design applies the adaptive badge alone. The other combines the saved caption
revision 1 with adaptive badge revision 2 using native application and insertion.
Caption width is 85% of output; caption center is at 87% of height. Keyword
placement is above it. This is authored placement, not automatic collision repair.

Evidence directory:
`/Users/zhengwei/Downloads/effect-combined-pilot-2026-09-23/`.
It contains the manifest, terminal batch record, four portable MP4 copies,
2 fps whole-video contact sheets, 10 fps first-keyword boundary contact sheets,
and `timing-audit.json`. All eight contact sheets were visually inspected.

Observed: short/long badges have different background widths; the combined
caption and emphasis occupy separate vertical bands; the inspected interview
frames do not put text over the face. The green emphasis is visually strong
and stylistically simple; this is not a reference-quality approval. The final
Chinese long keyword fits without clipping in the inspected frames.

`audit-combined-pilot.mjs` decoded both Chinese exports at 30 fps (314 frames each)
and detected background pixels. Every measured keyword window contained visible
background, and detected background never fell outside those windows beyond one
frame tolerance. The mask distinguishes green backgrounds from yellow caption
highlight. Near-transparent pixels below the threshold are outside this audit's
scope. The first-keyword boundary sheets show the text and background fading
together with no persistent panel after the event.

These tests complete the new background feature's production-export check and a
specific two-style composition check. They do not prove general automatic
avoidance, independent icon attachment, listening quality, or twenty approved
templates. Chinese footage composition remains unverified because its fixture is
audio-only. Source audio was preserved but not perceptually auditioned in this pass.

## Persistent decoration relations

Dynamic definitions now retain optional `spatialRelations`, reusing the native
composition contract. An element can remain above/below/left/right/overlaid on
another element, with canvas-normalized gap and offsets. Optional `followMotion`
inherits position, scale and rotation through the existing compiler. It does not
inherit opacity or duration. Compilation still requires a unique parent instance
covering the child interval; mismatched timing is rejected, not silently guessed.

The workbench's relative-placement controls can establish this relation, toggle
motion following and detach. Existing one-time placement remains separate and is
disabled for an attached element. Offset fields replace absolute position fields
for attached elements. Canvas dragging/resizing updates relation offsets; detach
retains resolved placement. Preview editing bounds use resolved static layout.
These are layout-box relationships, not measured-text-edge attachments.

Rust owns relationship validation, layout, adaptation and editing. Copying a
subtree remaps internal references; deleting layers removes dangling relations.
Insertion namespaces both ends. Proportional application scales gaps and offsets
by the correct canvas axis. Cycles and invalid targets are rejected.

Verification: full template suite 165 passed and 1 ignored; subsequent focused
dynamic-asset tests 27 passed; web typecheck passed. The new native test covers
projection, compiled attachment keys, movement, resizing, detach, subtree copying,
deletion and cycle rejection. `verify-effect-follow.mjs` exercises real controls,
save/reload, native insertion namespaces and completed animated canvas frames.
The square-decoration fixture `effect-follow-validation-20260923` is an execution
fixture, not a finished icon design. Inspected frames at 0.04s and 0.5s show the
decoration changing size with its parent; its opacity intentionally remains
independent. The export follow-up below verifies this relation in actual MP4 samples.

## Follow decoration export verification

Saved study `style-pilot-20260923-sparkle-follow`, revision 2, combines the adaptive
keyword background with a separate licensed Sparkles image. The image follows
the headline's position, scale and rotation. Its keyword binding and opacity
are authored independently, matching the headline for this design.

Batch `production-014ac21674f74d4253802671f5e39400` finished with two decoded
MP4s. Evidence is under
`/Users/zhengwei/Downloads/effect-follow-pilot-2026-09-23/`: `batch.json`,
`designs.json`, `preview-0-{0,1}.mp4`, whole-video and boundary contact sheets,
and `timing-audit.json`. Inspection of the final revision's isolated project
files confirmed three English and five Chinese image instances. Every image
references an existing parent instance, matches its start/duration and opacity
time/value pairs, and contains animated scale keys.

The decoded Chinese background audit contains 314 frames, 109 with detected
green background, all within measured keyword windows plus one frame tolerance.
This mask verifies the background, not icon visibility. Contact-sheet review
found no lingering icon at the inspected first keyword boundary.

Remaining limitations: the gold icon has weak contrast over parts of the real
interview, and attachment uses layout bounds rather than measured text edges.
Long keywords therefore extend beyond the icon's intended corner position.
These are technically verified samples, not aesthetic approval. Chinese input
remains audio-only; perceptual audio quality was not checked.

## Style editing and trial navigation

### Representative initial frame

Native synthetic previews now return `previewTimeSeconds`. Rust prioritizes
keyword text instances, then the first other text instance, and samples its
compiled opacity at output-frame times. Highest opacity wins; ties favor the
instance midpoint. The fallback for no text is time zero. This is a visibility
heuristic, not a design-quality score or a claim that every layer is visible.

Follow-up: the candidate list now includes images, video, graphics and stickers
after text candidates. Hidden elements are excluded, and candidates transparent
throughout their sampled interval are skipped. A pure graphic no longer defaults
to its transparent first frame. The final fallback is zero only when no sampled
visible candidate exists. All 33 dynamic-asset tests passed, including pure
graphics and transparent-text/visible-decoration cases. A live unsaved rectangle
preview returned an interior frame time through the same endpoint.

The UI uses the recommendation for a new style/example/duration and preserves
manual seeking during style edits. Browser verification opened offset style at
the returned 0.6s frame rather than the previous partly transparent 0.5s frame;
the completed canvas was inspected. Seeking to 0.3s and changing weight retained
0.3s after recompilation. Native interval/opacity coverage, the 30 existing
dynamic-asset tests, and web typecheck passed. Measured source-video previews
retain their existing behavior; no timeline or saved effect timing is changed.

### Inspection backgrounds

Standalone effect previews offer black, white, gray and checker backgrounds as
swatches. Backgrounds are UI inspection state, not part of the saved definition
or application. The checker is an ephemeral renderer image below authored layers;
actual sample-video previews do not expose the control and retain source footage.

Browser verification inspected canvas corner pixels for white/gray and alternating
checker cells, checked that switching did not issue native compilation requests
or dirty the draft, and checked mobile overflow at 390px. White/checker preview
screenshots were visually inspected. Web typecheck passed. These backgrounds do
not establish an alpha-capable export format or alter exported videos.

### Reverted edits

The editor previously compared nested style values by object identity, so changing
and restoring shadow or background padding left the draft falsely dirty. Purpose
tag ordering also caused false changes after unchecking and rechecking a tag.
Style comparison now uses serialized values; purpose comparison uses sorted copies
without mutating saved arrays. Genuine changes retain the existing save guard.

`verify-effect-reverted-edits.mjs` exercised shadow blur, background padding and
purpose toggles in the real workbench, checked the save button while changed and
after restoration, and entered the trial page without a discard dialog. The
verification saved no data. Web typecheck passed.

### Typography controls

### Numeric font weight correction

Further inspection found that saved numeric weights were compiled into only
`normal` or `bold`, and the renderer also discarded other values. Rust now
emits the exact validated weight as a CSS numeric string. Text measurement and
layout preserve weights from 100 through 900, while retaining legacy aliases
and falling back for invalid values. The project property selector includes
numeric weights so instantiated text remains editable.

Verification: 168 native template tests passed, one ignored; 15 text tests
passed; web typecheck passed. `verify-effect-weight.mjs` checked compiled values
and distinct completed frames for PingFang SC at 400 and 800. Both images were
visually inspected. Available font faces still determine whether adjacent
weights look distinct. The check did not save edits or export a new MP4.

Text-edge attachment remains incomplete. This investigation corrected weight
fidelity first because it affects the measurements used for future attachments.

### Numeric weight production export

Batch `production-65d48ac2710cb18b08e6048ea0cd7f74` completed on 2026-09-24:
two test variants of offset decorative text (400 and 800), each applied to the
existing measured English interview and Chinese TTS input. All four MP4s decoded
and passed native audio presence/signal checks. These are two verification
variants of one style, not two new aesthetically approved designs.

Artifacts: `/Users/zhengwei/Downloads/effect-weight-export-2026-09-24/`, including
`designs.json`, terminal `batch.json`, `audit.json`, four `preview-*.mp4` files,
four whole-video contact sheets and representative full-resolution frames.
`audit-weight-export.mjs` checked all 32 text instances across four isolated
projects for exact numeric `fontWeight` values. The source effect remains
`style-pilot-20260923-offset` revision 2; only application templates were varied.

All four contact sheets were visually inspected. Weight differences are visible
in both languages. Inspected text remains complete and does not cover the face
in the interview. Pink offset styling remains visually subtle on busy footage.
Chinese input is still audio-only. Audio was not perceptually auditioned. This
pass verifies the numeric-weight production path, not text-edge attachment,
general preview/export pixel equivalence, or the broader 90+ quality target.

Font family is now an editable input with native datalist suggestions from the
existing system-font list, common macOS Chinese families and fonts already used
by the selected definition. It does not download fonts or guarantee that a family
exists on another machine; unavailable fonts retain the browser's fallback
behavior. Online catalog integration remains incomplete because the shared
loader currently hides load failures.

`verify-effect-fonts.mjs` switched between PingFang SC and Songti SC, waited for
distinct completed canvas generations, verified different rendered pixels, and
saved/reloaded Songti SC on the independent verification copy. Both canvas images
were inspected. This proves the two local fonts on this machine, not arbitrary
font availability or export portability. Web typecheck passed.

The effect editor now exposes existing native style fields for weight, italic,
alignment, line height, maximum lines and text shadow (color, opacity, blur and
offsets). These controls edit the same definition used by native validation and
preview; no separate typography model or rendering path was added.

On 2026-09-24, `verify-effect-typography.mjs` edited the independent duplicate
`dynamic-ac330f19-affe-4aed-b3c4-a6b63f2c85ae` to revision 2. It checked native
saved values, reloaded controls, completed-render pixels containing the authored
pink shadow, and absence of horizontal overflow at 390px. The preview image at
`/tmp/effect-typography-preview.png` was visually inspected. Web typecheck passed.
This deliberately conspicuous shadow is a control-verification sample, not an
approved visual design. No production export was performed in this check.

### Independent style copies

Copy-save recovery retains the generated draft and its idempotency key after a
failed response. Retrying unchanged source edits reuses the exact save payload
instead of generating another asset ID. Success clears pending state and merges
the returned asset by ID. Changing source edits starts a different copy request.
This retry state is in memory; reload recovery is not implemented.

`verify-effect-copy-retry.mjs` intercepts writes, aborts the first save response,
then verifies one duplicate call and two identical save requests, retained source
edits, and selection of the successful copy. No library assets are created by the
test. Web typecheck passed.

Rust exposes `POST /templates/dynamic-assets/duplicate` with `{definition,name}`.
It validates the draft, assigns a fresh asset ID and revision zero, and preserves
the graph, purpose tags, provenance and media bindings. It returns an unsaved
definition; the existing revisioned save endpoint persists it. Source media files
remain shared while editable layer definitions are independent.

The workbench's `另存为新样式` icon copies current unsaved edits into a new saved
style and selects it. The AI tool `duplicate_dynamic_asset` uses the same native
schema and endpoint. It does not certify the copied design's visual quality.

Verification on 2026-09-24: native duplicate/save isolation test passed, existing
28 dynamic-asset tests passed, web typecheck passed, and 10 MCP tests passed.
Browser verification copied a modified draft of the follow study into
`dynamic-ac330f19-affe-4aed-b3c4-a6b63f2c85ae` revision 1, checked unchanged source
JSON, preserved purpose tags and spatial relations, and successful reload.
Desktop completed-preview screenshot `/tmp/effect-duplicate-desktop.png` was
inspected; mobile width 390px had no horizontal overflow. No project was edited.

Standalone effect selection is retained in the `effect` URL parameter. Reloading
restores the selected saved style, and the trial page's return link identifies
that same style. Embedded insertion in a composition does not rewrite this URL.
The selection link names an asset, not a fixed revision; trial URLs continue to
pin the saved revision explicitly. Unsaved edits still require saving before
switching styles or entering the trial page.

## Library navigation follow-up

### Desktop editing viewport

At widths of 1100px and above, the standalone workbench now bounds its editing
area to the viewport and scrolls the property inspector independently. The save
bar remains above both columns; the preview has its own overflow for short
viewports. Changing styles resets inspector scrolling. Mobile retains natural
single-column page flow. Embedded composition editing retains its prior sizing.

Browser verification at 1280x800 scrolled to the bottom of the inspector and
confirmed unchanged preview/save-bar bounding boxes. At 390x844 the inspector
returned to visible overflow and no horizontal overflow occurred. Screenshots
`/tmp/effect-inspector-desktop.png` and `/tmp/effect-inspector-mobile.png` were
inspected. Switching to another style reset inspector scroll to zero. Web
typecheck passed.

### Authored purpose filters

Definitions now support optional `purposes`, an array of `keyword`,
`decorative_text`, and `caption`. Tags are discovery metadata independent of
content binding and runtime timing. Explicit create purposes initialize the
corresponding tag; legacy definitions remain unclassified. Multiple tags can
coexist, so decorative keyword effects are not forced into one exclusive class.
The same native schema and revisioned save contract are available to AI tools.

The workbench exposes multi-select checkboxes, purpose filtering (including
unclassified), and combined name search. Five known pilot styles were tagged;
this increments their saved revisions without changing their visual design.
Earlier production evidence above remains pinned to its original revisions.

Verification: 166 native template tests passed, one existing test ignored; web
typecheck passed. Native coverage checks legacy deserialization, invalid tags,
multi-purpose round trips and unchanged projected execution. The browser script
`verify-effect-purposes.mjs` checks multi-purpose save/reload, independent filters,
empty search results and preservation of unsaved edits. Completed canvas captures
at 1280px and 390px were inspected; no horizontal overflow was detected.

On 2026-09-24, author-script review found that rebuilding offset text would
drop its decorative-text tag, and rebuilding the follow study would inherit
only its source badge's keyword tag. Both scripts now retain existing authored
purpose arrays, including an explicitly empty array, and supply appropriate
defaults on first creation. The follow script also accepts `PILOT_OUTPUT` so
verification does not overwrite earlier export evidence.

Live reruns against Rust completed successfully: caption, offset and marker
retained revision 2; sparkle-follow retained revision 3. Manifests were written
to `/tmp/effect-style-rerun-20260924/` and
`/tmp/effect-follow-rerun-20260924/`. This verifies classification preservation
and unchanged-definition idempotence, not preservation of arbitrary visual edits
by these authored study generators. No new render batch was started.

The standalone effect library now scrolls its results independently, keeping the
search field visible. Desktop navigation is sticky and bounded by viewport height;
mobile navigation is capped at 220px or 28dvh. Selected entries expose
`aria-pressed`; the results region can receive keyboard focus. Asset data is unchanged.

Browser verification at 1280px and 390px widths checked internal scrolling to the
last item, selection state, a stationary search field, no horizontal overflow,
empty-search feedback and preservation of unsaved name edits while filtering.
The mobile preview starts at approximately y=368px with the full existing library,
rather than following the entire long catalogue. Web typecheck passed.

### Independent decoration creation (2026-09-24)

Added native `CreatePurpose::Decoration` (`decoration`), exposed in the effect
creation selector, overlapping discovery tags, filter and MCP tool descriptions.
The initial graph contains a group and a centered, editable square with no text
inputs. Physical dimensions stay square on nonsquare canvases. The existing
independent entrance/exit envelope remains editable; this is an authoring starting
point, not a finished illustration or an aesthetically approved template.

Verification: 33 native dynamic-asset tests, 11 MCP transport tests and Web
typecheck passed. The native graphic preview test now uses the real decoration
creation path and checks non-text content, absent text inputs and a visible
representative frame. `scripts/templates/verify-effect-decoration.mjs` verified
browser creation, save, reload, filtering and current-generation previews at
1280px and 390px. Screenshots `/tmp/effect-decoration-1280.png` and
`/tmp/effect-decoration-390.png` were visually inspected; the centered square is
visible and no horizontal overflow was detected. Saved verification fixture:
`dynamic-9b00a2b1-2a4a-465a-aa7a-9bde553da7f7`, named `装饰入口验证样例`.
The local Rust service was rebuilt and restarted after confirming no queued or
running jobs. No source video project was edited and no production batch was run.

### Replace a shape with library media (2026-09-24)

The decoration workflow now offers `用素材替换图形` for selected rectangles and
ellipses. Native `mediaEdit.convertShape: true` explicitly converts the selected
shape into an image/video layer. Layer identity, parent, bounds, timing, motion and
motion envelope remain intact; unreferenced shape styles are removed. This replaces
the shape rather than using it as a clipping mask. Implicit incompatible replacement,
conversion of text, missing layer identity and videos shorter than the authored
maximum duration remain rejected. MCP describes the same request contract.

Verification: 34 dynamic-asset native tests, 11 MCP transport tests and Web
typecheck passed. `scripts/templates/verify-effect-shape-media.mjs` used the real
local cooperation illustration, converted a rectangle through the UI, checked the
request flag and preserved fields, saved, reloaded and captured desktop/mobile
previews. Inspected `/tmp/effect-shape-media-1280.png` and
`/tmp/effect-shape-media-390.png`; the illustration is visible within the retained
bounds. Verification fixture: `dynamic-558c1447-dee5-4874-b3ff-d72e2110c837`.
No original video project or production render was changed. This is workflow
coverage, not aesthetic approval of a finished style.

### Removing a spatial reference (2026-09-24)

Deleting a reference element/group now bakes each surviving directly dependent
element's resolved layout into its own container coordinates before removing the
relation. This reuses the explicit detach path. Previously deletion dropped the
relation and restored the dependent's stale, pre-attachment location. Nested
containers, downstream surviving relations and independent child motion remain.
This preserves authored layout, not an animated preview pose or inherited parent
motion; no per-frame freeze is claimed.

35 dynamic-asset tests passed, including deletion of a reference group with an
external nested icon and a second surviving dependent badge. After rebuilding and
restarting the idle local service, `verify-effect-reference-removal.mjs` removed
the parent from an unsaved copy of `style-pilot-20260923-sparkle-follow` and compiled
before/after previews. The sparkle layout stayed at x=.63, y=.34, width=.14,
height=.14. The saved source definition was read back unchanged. No saved asset,
source project or export was modified by this verification.

### Wider sentence-caption application (2026-09-24)

Visual review of the original English/Chinese contact sheets showed unnecessarily
narrow sentence layout inherited from the square effect canvas. For example,
`选一个感兴趣的段落` broke before `的段落`. The authoring script now requests the
existing independent `captionWidth: 0.85` only for the caption study. Glyph style,
word timing, keyword highlighting and the saved caption effect revision (2) remain
unchanged. The application width changes wrapping and can avoid automatic font
shrinkage; this is not a new style counted toward the 20-template objective.

Batch `production-f7dfe561c1e06b2a3792f028691c9c20` succeeded with one application
design and two independently editable previews, using the same measured English
interview and Chinese TTS samples. Both MP4s passed pipeline decode and audio signal
validation. Evidence is in `~/Downloads/effect-caption-reflow-2026-09-24/`: manifest,
batch, `preview-0.mp4`, `preview-1.mp4`, full-duration 2fps contact sheets and six
old-left/new-right comparison crops. Both contact sheets and the 5.4s Chinese
comparison were visually inspected. Chinese sampled phrases now fit one line;
the longer middle English sentence stays on two lines. Sampled frames show no text
clipping or face overlap. No audio listening or aesthetic 90-point approval was
performed. Users can select the existing independent-caption-width control in the
trial UI; this study does not change all trial defaults.

Schema inspection also found a documentation defect: the capability response still
reported `typography.fontWeights: quantized_normal_or_bold`, despite the exact
numeric-weight compiler/renderer changes and prior export evidence. This was fixed
in the next contract verification pass: capabilities now advertise
`integer_100_to_900`, a structured min/max/step range and the installed-font-face
limitation. `Style.weight` JSON Schema now declares the same 100–900 limits as
native validation. The compiler regression checks schema bounds, rejects 99/901
and preserves six sampled numeric weights including 550. This is contract
consistency, not a guarantee that every installed font supplies every weight.

### Three independent style studies and serif revision (2026-09-24)

Saved candidates: `style-study-20260924-note` revision 1 (lime note with a dark
offset backing), `style-study-20260924-echo` revision 1 (a pink entrance trail
that disappears before steady display), and `style-study-20260924-serif`
revision 2 (sentence captions with semantic keyword color). These are editable
style definitions; sample word times belong to their applications.

Initial batch `production-6914f3fdfbbc31489d82d7613a9e79a1` rendered six previews
across the measured English interview and Chinese TTS inputs. Initial review
found the serif too fine over clothing and foliage. Revision 2 increases its
font size from 60 to 76, weight from 700 to 800 and outline from 2 to 3.5,
strengthens its shadow and changes the keyword color to #FFE28B.

Revision batch `production-bb020f5bbd6b9496c0b3c97e3659c43a` succeeded with two
previews. The review script checked both decodeVerified and audioQuality.validated
and retained MP4s and contact sheets in
`/Users/zhengwei/Downloads/effect-serif-refine-2026-09-24/`.
Both revised full-duration 2fps contact sheets were visually inspected: sampled
text stays within frame, English long text wraps to two lines and Chinese phrases
fit one line; pale yellow keywords remain distinguishable. Speech gaps can have
no caption. Chinese TTS uses a black background, so it does not establish
readability over complex Chinese video footage. Audio was not listened to.

There are eight exports across the initial and revised batches, but only three
candidate designs. None receives a 90-point aesthetic acceptance from this check.
Broader footage diversity and motion/listening review remain required.

### Preview frame freshness (2026-09-28)

Effect previews now render into a temporary canvas and commit to the visible
canvas only if the render is still current. Changing example text or background
hides the outdated frame until its replacement is ready; layout handles also wait
for the current frame. This prevents a cancelled asynchronous render from writing
obsolete pixels over the selected example. The section's busy state includes
first-frame rendering, not only the native preview request.

`scripts/templates/verify-effect-preview-recovery.mjs` passed against the local
service and browser: an invalid keyword removes the previous stage, valid longer
text recovers with a new render generation, a deliberately held response keeps
old pixels hidden, and a white-background redraw completes with matching metadata.
Web typecheck passed. Existing local service configuration was reused; state and
footage-page endpoints returned HTTP 200. No source project or saved style was
modified. This verifies preview freshness, not text-bound icon attachment or
aesthetic acceptance.

### Repeated keyword selection in sample previews (2026-09-28)

The example editor now exposes the existing native `keywordOccurrence` contract
as a one-based occurrence control. Changing the sentence or keyword resets the
selection to the first occurrence. The occurrence participates in the preview
request and suggested-time identity, so selecting a later match seeks to that
match rather than retaining the previous example's playhead. Native code retains
responsibility for matching, word boundaries and out-of-range validation.

Web typecheck and the extended preview-recovery browser check passed. With
`重点之后还有重点`, selecting occurrence 2 produces keyword elements starting after
the first second of the two-second sample. Occurrence 3 fails explicitly; changing
the sentence to a single occurrence resets the control to 1 and renders again.
This changes example previews only, not saved style definitions or measured speech
annotations in a project.

### Editorial styles, 2026-09-28

Added two original candidates with `scripts/templates/author-editorial-styles.mjs`:

- `style-study-20260928-quotation` revision 1: serif keyword with separate warm quotation-mark layers, each attached to a measured text edge. Literal decoration and keyword content remain independent.
- `style-study-20260928-signal` revision 1: dark content-sized text background with a separate cyan side bar, attached to the measured left edge.

Both use measured keyword events when applied, and native fixed entrance/exit phases. Rerunning authoring retained revision 1 for both. Batch `production-88f53d2cd612ee8c0c42699426840ae8` succeeded with four independently editable preview exports, all decoded and audio-validated. The corrected Chinese emphasis 写下一句话 is retained. Evidence: `/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/` (manifest, effects, batch, four MP4s and four 2fps contact sheets).

Inspected all four contact sheets: short and long phrases are complete in sampled frames, quote marks and side bar remain near the relevant text edge, and no sampled face overlap was observed. Signal has stronger separation from patterned clothing; quotation text is comparatively delicate and should be enlarged or given stronger separation for complex footage. These are keyword-only studies: absence of sentence captions is intentional for isolated style inspection, not a complete-video acceptance. Motion boundaries and perceptual audio were not reviewed in this batch. Only two inputs were used; existing internal review contract requires at least three distinct preview files per design. No formal score or 90+ acceptance submitted. These add candidates, not approved-template counts.

### Third measured input and quotation wrapping, 2026-09-28

Extended the editorial author script with pinned input `input-cde88118397f50e922df4e606786d79f`, transcript revision 1. Reviewed the returned word list and selected complete spans including honors program, teaching assistant, stayed in science, and huge impact on my life. Times remain measured; the sample is a different excerpt of the same interview and is not a new visual setting.

Quotation revision 2 raised size 80→96, weight 800→900 and outline 3→5. Batch `production-70c9248df277a3c9b75e7787bd4f10e1` exported six previews (quotation and signal, three inputs). All decode/audio checks passed. Inspected all six 2fps sheets and the three signal first-event sequences at 30fps. Signal's bar stays with the background during sampled entrance/exit. Quotation still shrank the longest English phrase excessively.

Quotation revision 3 allows two lines. Focused batch `production-818b829c3666acf5f49fcd5fd4830f98` exported three previews and passed decode/audio checks. Rerunning authoring retained revision 3. Inspected the 12.6s third-input frame: huge impact / on my life is complete and visibly larger; no face overlap. Quotation marks currently sit beside the upper line rather than wrapping the entire multiline block typographically, so multi-line decoration placement still needs refinement. Do not treat this as fully accepted. Other revision-3 whole-video contact sheets and entrance sheets were generated but not yet visually reviewed.

Review script `scripts/templates/review-editorial-styles.mjs` retains terminal batch evidence, copies every preview, produces whole-video and consecutive first-event sheets, and checks native decode/audio flags. It does not assign visual scores. Evidence directories: `Downloads/effect-editorial-styles-2026-09-28` and `Downloads/effect-quotation-wrap-2026-09-28`. No perceptual listening or formal 90+ review has been performed.

### Quotation optical alignment, 2026-09-28

Investigated the multiline placement: measured text bounds use a font line/block rectangle; Georgia quotation-mark ink sits high inside that rectangle. The attachment is not a per-glyph optical alignment algorithm. Revision 4 gives both quote layers a constant, editable local Y motion of 40 design pixels, retaining the existing measured text attachment and own opacity. This is authored typography compensation for this font/size, not a renderer-wide behavior change; changing the quote font may need retuning.

Batch `production-68b224db286a937ccf27ad3bf1e6c4a9` succeeded with three measured-input previews, all decoded and audio-validated. Rerun authoring retained revision 4. Inspected stable English single-line, Chinese single-line and English two-line frames: quotation marks now sit beside the center of the block, long text remains complete, and sampled footage has no face overlap. Also inspected each first-event consecutive-frame sheet: the marks follow text through entrance and remain visible with it; the shortest English event includes its exit. Artifacts in `/Users/zhengwei/Downloads/effect-quotation-optical-2026-09-28/` include three MP4s, batch evidence, contact/entrance sheets and stable-{0,1,2}.jpg. Full playback/listening, visual-setting diversity and formal aesthetic scoring remain unverified.

### Independent decoration review, 2026-09-28

Reviewed completed batch `production-adea3e1b420c425f1617005a84e26c70`: three native reusable decorations (lightbulb bounce, learning illustration float, seven-layer confetti), each applied to three measured speech inputs. All nine exports passed native decode/audio coverage checks. Inspected the nine-cell stable-frame montage, whole-duration third-input sheets for all three designs, the lightbulb first-English-event sequence and illustration first-Chinese-event sequence. Lightbulb contrast is clear; the illustration retains a pale, detailed flat artwork aesthetic. Its motion affects the entire image, not internally rigged characters. Confetti revision 1 was too small to read against real foliage.

Revised `style-study-20260928-celebrate` to revision 2: particle width .025→.045 and heights .04/.065→.06/.09 design fractions; application scale .38→.65. Seven shapes and motion channels remain independently editable. Focused authoring now supports PILOT_STYLE and PILOT_OUTPUT. Batch `production-863bc5e14f0491b587953d932837b3cd` exported all three revised samples, with decode/audio checks passing. Inspected the first English event at 30fps and the third-input whole-duration sheet: particles are visibly larger, disperse, rotate and fade; no sampled face overlap. Idempotent author rerun retained revision 2.

Added `scripts/templates/review-decoration-styles.mjs`: after the existing batch-copy reviewer, it reads each input's actual first keyword time, verifies transcript revision, extracts full-frame consecutive entrance frames and writes a playable local review page. This avoids the caption-band crop missing decorations. Evidence and review pages are in `Downloads/decoration-studies-2026-09-28` and `Downloads/decoration-confetti-v2-2026-09-28`.

Scope remains limited: repeated keyword triggers are adaptation stress tests, not semantic recommendations; Chinese input is audio-only black background, and both English clips share one interview setting. These studies omit full captions. No perceptual audio listening, formal aesthetic score or 90+ acceptance was claimed. These three candidates do not complete the 20-template target.

### Caption / keyword / icon composition, 2026-09-28

Added `scripts/templates/author-composed-style-pilot.mjs`, pinning caption revision 2, signal revision 1 and lightbulb revision 1. The script uses native application/insert endpoints, retaining separate caption text, keyword text, side bar, lamp image and lamp backing, and the caption's active-word treatment. No source asset definition or user project is changed. All timing derives from the same three measured samples.

Initial batch `production-b211b78a1f5f8db380cc1368a1af1658` exported three previews. All three whole-duration sheets were inspected: fixed lamp placement left excessive empty space beside short keywords, and the longest keyword shrank to fit one line. Revised application layout attaches both smaller lamp layers to the keyword's measured text box and allows two keyword lines. The side bar keeps its own existing attachment and motion. These are composition-specific layout overrides, not a new claimed style family or changes to the shared library definitions.

Revised batch `production-2661eb5bf4ad1683a28a3c523858c4d0` exported three previews with successful decode/audio checks. Inspected the short English first-event 30fps sequence, Chinese whole-duration sheet and long English 12.6s frame: lamp follows the keyword, short phrases no longer have the large fixed gap, and “huge impact / on my life” is substantially larger. Captions remain separate below the keyword and show active-word color. No overlap with captions or face was seen in those sampled frames. The keyword block covers upper-torso footage; universal safe placement is not established.

Review-page title/description are now configurable so composition evidence does not incorrectly claim captions were omitted. Final evidence: `/Users/zhengwei/Downloads/composed-style-follow-v2-2026-09-28/`, including manifest, pinned styles, batch, three MP4s, full-frame entrance sheets and `review.html`. Input diversity, full perceptual listening and formal scoring remain unfinished. Inspected additional catalog footage before reuse: the Chinese portrait excerpt already contains burned-in captions/flower text, while the longer English excerpt is the same interview setting; neither was misrepresented as a clean new scene.

### Style-library navigation consistency, 2026-09-28

Fixed scope switching leaving a stale `effect` URL selection behind. Standalone workbench scope now persists with `styleLibrary=archived`; switching clears the old effect, and refreshing chooses only an asset in the intended scope. Explicit valid asset deep links resolve their actual archive state, overriding stale scope parameters. Embedded template library use keeps its scope local. This is UI navigation state only; native definitions and archive records remain unchanged.

`scripts/templates/verify-style-library-navigation.mjs` passed on the real local page: active→archived→toolbar refresh→reload, archived→active→reload, active deep link with stale archived scope, archived deep link without scope. Exact before/after library response comparison confirmed no saved-data changes. Web typecheck passed. This addresses navigation predictability; it does not establish completion of the broader workbench or template-quality goal.
