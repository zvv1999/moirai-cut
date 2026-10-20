# Text-bound decoration attachment

Status: partial implementation, not an accepted or UI-advertised capability.

## Problem

The keyword badge background already sizes to measured text. The separate icon
uses `SpatialRelation`, whose parent is a fixed authored region. Short and long
keywords therefore move their visible edge without moving the icon. Changing
font, weight, alignment or wrapping exposes the same issue.

## Current execution

Optional width/height binding for native graphics is now implemented; see
[text size binding contract](text-size-binding-design.md) for the exact formula,
editor controls, anchor/scaling behavior, automated checks and remaining real
production gate. This does not promote the whole attachment feature to accepted.

Measured detach/writeback now has an executable workbench path for nonsingular,
non-sheared poses. The preview toolbar's “解除依附并保持外观” first requests the
ephemeral native `/templates/dynamic-assets/detach-preview` (no saved definition
or project mutation), resolves that independent candidate at the exact same frame
with the current fonts/media, and submits both local poses to `detach_in_frame`.
Rust removes the relation and writes constant correction into the leaf's editable
position/rotation/axis-scale channels, preserving its own key times, easing and
opacity. It stops inheriting the parent's animation; it does not bake the parent's
whole motion into the child. Current-frame preservation is the explicit behavior.

The UI checks definition, selected layer, example text, duration and preview time
for staleness, requires a unique visible instance and unchanged enclosing group
poses, and keeps the saved revision guard at save. Native code checks matching
scene/local frame clocks, finite nonsingular poses, and rejects shear that cannot
be represented by existing authored rotation/axis-scale channels. The old sidebar
button that attempted unmeasured detach now directs users to this preview action.
Generic unmeasured detach remains blocked for text-box attachments.

Real-browser fixture `dynamic-8328a71b-68e1-41ff-9c42-3e6bfaf7da5a` reached revision
5: after chained rotation, nonuniform scale, direct drag and both scaling modes,
detaching the decoration preserved all four measured corners exactly (0px error),
kept pixel dimensions within 1px, survived save/reload, and no longer moved when
the former ancestor was moved. All earlier interaction gates in that script still
passed. Native editing suite: 19 passed; Web typecheck passed. Native regressions
cover preserving leaf motion/easing/opacity and rejecting mismatched clocks,
singular and sheared poses. Cross-group/shear-capable detach, audio-driven diverse
instances and a new MP4 after these edits remain unverified/incomplete.

Independent-axis measured scaling is now implemented through the same
`scale_in_frame` operation. Optional `axis` and `visualBasis` describe an edge
gesture; native code projects pivot compensation through the complete visual
basis, so rotation/nonuniform scale/shear do not mix the fixed edge with the
unmodified axis. Existing uniform animated keys are split into identical X/Y
tracks before multiplying only the requested track. Four edge-midpoint handles
join the proportional corner handles; authored text wrapping/layout regions are
unchanged. Missing or singular visual bases reject axis scaling atomically.

Browser evidence: isolated asset `dynamic-6c38da39-e424-4ea1-b773-8471213bb622`,
revision 4. In the chained rotated/nonuniform fixture, decoration X×1.4/Y×0.8
and text X×0.9/Y×0.85 all preserve the opposite edge and leave the other axis
unchanged. Maximum corner error across these four edits was 0.000045 canvas
pixels; actual decoration pixel bounds passed the 2px raster tolerance. The
two earlier proportional edits, movement, independent opacity, save and reload
checks also passed in the same run. Screenshot was inspected. All 18 native
editing tests and Web typecheck passed. Native regression includes sheared axes,
uniform animation splitting, zero-scale entrance preservation, and invalid basis
rejection. Cross-group interaction and MP4 after scaling remain unverified;
detach writeback and activation-relative legacy handling remain incomplete.

Measured corner handles now provide proportional visual scaling for supported
leaf layers and text-box attachments. Native `scale_in_frame` derives the factor
from the pointer delta projected onto the current corner diagonal, fixes the
opposite corner using the measured origin and movement basis, and validates a
finite factor in [0.05,20]. It multiplies the existing uniform/axis scale keys,
preserving their times, easing, zero-scale entrances and nonuniform proportions.
An ordinary leaf receives additive position-key offsets; an attached leaf receives
relation-offset correction. Existing layout dimensions, text wrapping/font size,
other motion channels and dependencies remain authored. Missing channels become
constant two-key channels, editable in the existing motion editor. This is
proportional visual scaling, not independent-axis or text-box reflow resizing.

The four actual corner handles support pointer gestures, arrow-key increments
(1%, or 10% with Shift), Escape cancellation and the same stale-definition guard
as dragging. Legacy activation-relative attachment scaling is explicitly rejected
and not enabled in these handles. Guide lines show the gesture; the canvas is
recompiled after release, rather than continuously updating while dragging.

Browser verification passed with isolated asset
`dynamic-b2e27184-d7d4-4d3c-87f3-0972bc369e4a`, revision 4. In the chained,
rotated/nonuniform fixture, scaling the decoration by 1.5 and root text by 1.25
preserved the opposite corner; maximum projected-corner errors were 0.000031 and
0.000119 canvas pixels. Actual red-pixel dimensions grew within a 2px raster
tolerance, and all visible corner coordinates survived save/reload unchanged.
Screenshot `/tmp/measured-text-selection.png` was inspected. The 17 native edit
tests passed, including preserved animated axis keys and pivot correction;
Web typecheck passed. No new MP4 export was performed for this interaction change.
Detach writeback, independent-axis measured resizing, legacy follow handling and
actual isolated-group interaction gates remain outstanding.

The drag verifier now supports `SELECTION_SCENARIO=chain`, adding a measured text
parent that is itself attached to another rotated text layer, with independent
1.3/0.7 axis scales. Real-browser verification passed in isolated asset
`dynamic-9d51c513-b1a0-4344-abd3-fcf5521fa15a`: moving its decoration (20,-12)
display pixels produced exactly (20,-12); persistence, keyboard nudge and Escape
checks also passed. A second phase made the immediate text parent transparent
while leaving the decoration opaque; dragging the decoration (-15,+8) still
produced exactly (-15,+8).

That second phase required a renderer selection correction: movement reference
poses are now indexed independently of selectable visibility. Transparent parent
text, including text inside a transparent resolved group, contributes its corrected
axes without receiving a selection polygon. Truly inactive/unresolved groups do
not contribute stale poses. References use full scoped identities via maps rather
than searching the visible selection list. Six measurement tests / 34 assertions
and Web typecheck passed, including independent opacity and cross-group basis
projection. Workbench asset containers currently flatten treatments to leaves;
this browser evidence is for chained leaf relations, not actual isolated-group
dragging. The prior cross-group MP4 tests remain rendering-only evidence.

Direct measured dragging now works for ordinary leaf layers and text-box
attachments. The renderer supplies a layout-offset-to-scene basis (enclosing
groups for ordinary layers; corrected parent axes and groups for measured
attachments). The UI captures the current frame, canvas/display scale and exact
definition snapshot at pointer-down. Rust's additive `move_in_frame` operation
validates/inverts the finite nonsingular basis, converts pixel deltas to canvas
units and updates native layout or relation offsets. The UI rejects an obsolete
definition snapshot and hides geometry immediately when the definition changes.
Escape cancels the pointer gesture; arrow keys move one canvas pixel, Shift ten.
This does not add measured resizing or detach writeback.

Browser verification caught a real limitation in the old relation move path:
clamping against the full authored text rectangle truncated an otherwise valid
measured drag. Direct relation moves now update offsets without that clamp.
For text-box relations only, derived regions validate finite positions and valid
normalized dimensions rather than requiring containment in the canvas before
measurement. Dynamic-asset authored regions retain strict validation, relation
offset limits remain, and legacy layout relations retain their existing rules.
Legacy motion-following layout relations require activation-pose metadata for
correct dragging; native `move_in_frame` rejects them explicitly and the UI
retains selection and authored-layout controls instead of supplying a wrong basis.

Real-browser verifier `verify-measured-text-selection.mjs` passed with isolated
asset `dynamic-c689cb21-da03-42af-adc6-85f482734177`: rotated attachment drag of
(20,-12) display pixels produced (19.999969,-12), changed relation offsets while
preserving the child region, Escape restored the prior placement, save/reload
preserved position, and Shift+ArrowRight moved ten canvas pixels after reload.
Rust template suite: 179 passed / 1 existing ignored; renderer suite: 14 passed /
64 assertions; Web typecheck passed. Native regressions cover inverse rotation,
nonuniform scale, shear, reflection, singular/nonfinite rejection and avoiding
the invisible authored-width clamp. Chained/cross-group dragging still needs
browser gates even though their rendering tests pass. No full capability claim.

Frame selection now includes resolved graphic/image/video/sticker leaf rectangles
alongside text boxes, preserving compositor traversal order. The workbench reads
these measurements after attachment resolution and frame rendering. Source
containment dimensions are shared with the compositor; selection projects the
same corrected affine basis and outer group transforms. Hidden groups/leaves
are excluded. These are rectangular source bounds, not alpha-, mask- or
effect-aware hit regions. `MeasuredLayerSelection` replaces the text-only
component described below. Moving/resizing still uses authored layout handles.

Five renderer measurement tests / 27 assertions pass, including media aspect
ratio, affine source corners, snapshot isolation, hidden groups and text metrics.
The expanded real-browser selection verifier passed with isolated asset
`dynamic-b5fabb86-d57e-42e9-8d34-cf888f98a415`: a decoration attached to rotated
text is selected at its corrected displayed location, its polygon center hits
the rendered red pixels, and the property panel selects that decoration.
The screenshot `/tmp/measured-text-selection.png` was inspected. Web typecheck
passed. After sharing containment geometry, animated cross-group MP4 verification
was repeated in `tpl-preview-group-motion-84aee935-4e21-460e-80ac-f229c9ec8939`:
16 preview/export frames pass, maximum gap error remains 0.688984px. Other visual
types have renderer-level coverage only; no claim of full media-selection browser
coverage or measured drag/detach acceptance is made.

Workbench text-box selection is now interactive. `MeasuredTextSelection` consumes
the current rendered text measurements and projects the exact quadrilateral,
including group/affine transforms. Pointer clicks and Enter/Space select the same
authored layer used by the property panel. Unmapped and degenerate measurements
are excluded; busy state disables activation; the existing frame-ready gate hides
stale polygons during seeks, recompilation and playback. This remains text-box
selection (including enabled background), not ink/mask-accurate hit testing.
Authored-layout handles still own move/resize; measured drag, icon selection and
detach writeback remain outstanding. No screen-space delta is falsely treated as
an attachment-local offset.

`scripts/templates/verify-measured-text-selection.mjs` passed in the real browser
using isolated asset `dynamic-f1c8d643-2479-490c-a323-062ca64983d7`: a 25-degree
rotated polygon selects its property panel, its empty bounding-box corner does
not hit, Enter/Space select, a paused seek refreshes selection, and selection does
not mutate the saved asset revision. The screenshot at
`/tmp/measured-text-selection.png` was inspected. Web typecheck passed.

Animated cross-group preview/export validation now passes for a silent, isolated
geometry fixture. `scripts/templates/verify-text-attachment-group-motion.mjs`
animates separate parent/child groups with opposing rotations, nonuniform scales
and translations, exports a 2-second 30fps MP4, and measures eight matching times
in preview PNGs and decoded MP4 frames. All 16 frames pass the 3px local-space
gap/size tolerance. Maximum gap error was 0.688984px; preview/export differences
were at most 0.307520px in gap, 1px in width and 0.560448px in height. Export
completed with stable revision. Representative export frames 0, 2 and 7 were
visually inspected. Evidence lives in
`/Users/zhengwei/OpenCutProjects/tpl-preview-group-motion-3055d3d1-5705-473e-8787-0fbabb54a6cc/review.json`
and that project's `exports/group-motion.mp4`. This adds animated cross-group
evidence to the static checks below; it does not establish aesthetic quality,
audio correctness, masks/effects, arbitrary nested clocks or interaction support.

The shared resolver now carries a renderer-only four-component linear basis for
cross-group attachment axes. It applies the complete inverse-child / parent-group
composition, including shear, and propagates a corrected parent's position and
basis through dependency chains exactly once. Shared enclosing groups cancel
before inversion, including a common zero-scale entrance. Text rasterization and
text measurement corners use that same basis. Graphic/image/video/sticker layers
rasterize affine source quads before the existing compositor receives a full-frame
quad; mask rasterization uses the same geometry. Independent leaf opacity and
authored motion remain intact. This supersedes the translation-only implementation
described below.

Real browser validation exposed a separate transparency defect: GPU group surfaces
were copied as opaque black outside their content, so the second group covered
the first. wgpu 29's WebGPU capabilities list only Opaque, while its configure
implementation supports PreMultiplied. Rust now explicitly selects PreMultiplied
for WebGPU surfaces. Instrumentation verified canvas alphaMode=`premultiplied`
and empty group pixels changing from alpha 255 to
0; temporary instrumentation was removed. WebGL fallback remains unverified.

The four browser scenarios (identity, translation, rotated nonuniform parent,
and independently rotated/nonuniform parent and child groups) now all pass the
diagnostic's 3px raster tolerance. In the last case the measured parent-local gap
is 15.1233px vs 14.4px and icon size is 28.1100×27.6554px vs 28.8×28.8px. The frame
was visually inspected at
`/Users/zhengwei/OpenCutProjects/tpl-preview-group-check-e4427600-26f8-4943-bd12-ac6e42f311c0/frame.png`.
The 18 renderer tests passed (132 assertions), covering shear, chained inheritance,
common zero scale, reference errors, actual-font measurement and ordinary
preview/export resolution. This is static browser-frame evidence, not animated
cross-group MP4 acceptance, masked/effected affine acceptance or interactive
selection/drag acceptance. Follow-off and measured detach remain outstanding.

Local Rust renderer builds are now reproducible with `bun run build:wasm` using
`scripts/build-wasm.mjs` (requires the wasm32-unknown-unknown Rust target and
wasm-bindgen-cli matching Cargo.lock, currently 0.2.116). It checks the CLI version,
builds with the lockfile, emits bundler bindings and package metadata, and was run
successfully. Next's Turbopack aliases `opencut-wasm` to `rust/wasm/pkg` when built;
the browser network trace confirmed that local binary was loaded. `build:web`
builds WASM first, so production builds cannot silently ship the published older
renderer. Generated bindings are ignored. Dev servers started without a local
build retain the npm fallback and need a renderer build/restart for this GPU fix.

Cross-group translation now includes the native-baked baseline position. A real
browser diagnostic first reproduced the defect: moving the text's group +80px
moved the green right edge from 393 to 473, while the external red icon remained
at 408. The gap became -66px instead of 14px. Size-only displacement conversion
cannot account for this because it deliberately excludes translations.

`textAttachmentGroupPositionCorrection` now projects the child's pre-group baked
position through the parent's and child's containers as points and contributes
their scene-space difference before the existing inverse child-container mapping.
Common group transforms cancel. The regression covers separate +80/+20 and
-30/+10 translated containers while preserving the 10px authored anchor gap.
The 12 attachment geometry/resolver tests passed (99 assertions), as did Web
typecheck. The browser diagnostic rerun reports red left=488 with green right=473,
restoring the 14px gap after the +80px move. The rendered frame was inspected:
`/Users/zhengwei/OpenCutProjects/tpl-preview-group-check-2bda496d-a1ef-4d3f-b5ec-d667c91b2bd3/frame.png`.

This is a position correction, not complete cross-group affine inheritance.
Differing group rotations/nonuniform scales also transform the child's axes;
those axes are not yet propagated. Their full conversion is
`inverse(childGroupMatrix) * parentGroupMatrix * bakedChildMatrix`, including
measured-anchor correction and inherited parent displacement. Such compositions
can contain shear, which the current rotate/scale-only leaf transform cannot
represent. A shared affine rendering path (and matching measured/interaction
bounds) remains necessary; passing the translation diagnostic is not acceptance
of the cross-group rotation/scale gate. The diagnostic script reports its samples
and is not a substitute for those remaining cases or exported-video verification.

Browser copy acceptance now passes in isolated project
`tpl-preview-copy-check-85d5bbfe-3dc7-4ce3-a39f-a35dbfe00fa4`.
`verify-text-attachment-copy.mjs` uses the actual select-all/duplicate keyboard
actions, checks the copied exact parent reference, undoes/redoes, hides both
original tracks, and changes the copied text through the async Agent entry.
Rendered short/long captions have green right edges 393/500 and red icon left
edges 408/515: both gaps are 14px against 14.4px authored spacing. Both returned
frames were visually inspected. A subsequent AI child-only duplication preserves
the copied text parent and renders successfully. The verifier waits for all five
elements and the new child ID in saved revision 2, reloads the browser, checks the
same five elements/references and renders again. Frames and `copy-review.json` live under the
isolated project's directory; original user/reference projects were untouched.

This browser check also closed a readback gap: Agent element summaries now include
the formal `textAttachment` descriptor. Rust remapping updates the legacy
`template.attachedTo` metadata when present, so it cannot contradict the copied
descriptor. Native copy tests and Web typecheck pass; the running service includes
the metadata fix. This checks individual top-level copies in the browser; nested
group copy identity remains covered by native tests rather than browser frames.

Persistence verification initially exposed a readiness gap: the Agent bridge could
report success while project initialization still held autosave paused. Initial
thumbnail generation later calls `acceptExternalState`, so edits submitted in that
window need not remain pending for autosave. Bridge `getState` now reports an
initialization error until loading finishes; Agent mutations and copy preparation/
commit also reject loading projects. A regression checks refusal without revision
advance, then successful application after loading. The full browser copy/save/
reload/render check passed with this gate, and all 24 relevant Agent/command tests
passed. Earlier runs that only checked returned frames or the initial saved file
are not persistence evidence.

Copied timeline attachments now have a pure Rust remap contract at
`POST /timeline/copies/remap`. It takes final source/destination identities and
detached copied elements, maps all selected subtrees before rewriting references,
and preserves external parents when only the child is copied. Nested descendants
retain their local IDs but receive references with the new enclosing group path.
Ambiguous identities, overlapping destinations and malformed groups fail without
returning a partial result. The endpoint does not persist any project.

The Web duplicate action now prepares copies through this endpoint before entering
the synchronous undo transaction. Its snapshot guard checks project, scene and
track content after the await. Undo/redo reuse the prepared result without another
network request, and cloned nested state no longer shares objects with the source.
The additive Agent bridge `applyOperationAsync` uses the same preparation and
rechecks revision/idempotency/project before committing; the MCP edit operation
now calls this entry. Legacy synchronous operations remain available, but reject
unprepared attachment copies. Multi-operation synchronous `applyPlan` does not yet
prepare such copies and is not claimed as supported for this case.

Verification: three native remap tests; three command tests covering undo/redo,
service failure, source preservation, intervening edits and project switching;
an Agent concurrency regression for stale revision and replay. The actual Web
proxy → Rust endpoint passed a child-first cross-track reference check. Full Rust
library tests passed 194 with three existing ignored environment-dependent tests.
Web typecheck passed. The service was rebuilt/restarted after checking both job
queues idle, including the preceding group-visibility fix. Browser copy/render
acceptance was subsequently completed as recorded above.

Animated MP4 verification is now recorded for batch
`production-5f3b88691a0d22ad13ed168f1591f1b8`. The English and Chinese diagnostic
exports animate the text from -20 to +20 degrees, scaleX 0.7 to 1.1 and scaleY
1.2 to 0.8. `review-text-attachment-motion.mjs` measures 24 frames along the
current text axis against the expected `14.4 * scaleX` pixel gap. The saved
measurement report has a maximum absolute error of 1.7191px, within its 4px
raster/encoding tolerance. Both full-duration 4fps contact sheets were reviewed
in the preceding verification session. Artifacts:
`/Users/zhengwei/Downloads/text-attachment-motion-export-2026-09-28/`.
No listening was performed. These diagnostic overlays do not count toward the
20 aesthetic templates or establish cross-group motion and editor interaction.

The subsequent compiler audit found that text-parent coverage used leaf clocks
without clipping to enclosing group visibility. Instance collection now intersects
every nested visible interval before selecting a covering parent. Regression cases
cover a group entering after the child and leaving before it, while retaining the
same leaf-local coverage. This is temporal coverage, not cross-group motion support.
Validation: `cargo test -p moirai-footage templates:: --lib` passed 177 tests,
with one existing ignored reference-analysis fixture. The coverage correction is
source/test verified and included in the service rebuild recorded above.

Copy-path audit: the native dynamic-asset subtree operation remaps authored
relations before recompilation. The Web timeline `DuplicateElementsCommand`,
however, shallow-copies `textAttachment` while assigning new element and track
IDs. Copying parent and child together can therefore leave the child pointing at
the original parent; copied group descendants also retain old group paths. This
editor path was subsequently wired to the Rust-owned remap described above;
browser/render verification remains outstanding.

An animated-basis mismatch was corrected after static export verification.
Measured-box displacement uses the parent's absolute transform, but legacy native
follow preserved the child's activation pose using parent scale ratios and angle
deltas. Text-box mode now bakes the absolute parent pose around its unanimated
authored origin; the baseline and measured correction therefore use the same basis.
Legacy layout mode retains the activation-relative behavior. Text-box mode can
start at zero scale because it no longer divides by the initial scale.

The native rotated/nonuniform-scale regression checks both modes, child motion,
opacity and zero-scale entry. The actual-font frame-resolution integration checks
a 90-degree, scaleX=2/scaleY=3 initial pose in preview/export construction and
retains the 10px parent-local spacing. These are analytic and frame-resolution
tests; the animated MP4 evidence above was generated after rebuilding the service
with this correction.

Real export verification: batch `production-ea5c77d101214b537135e95d1489ec34`
succeeded with one diagnostic design and two isolated preview-only projects using
the existing measured English interview and Chinese TTS inputs. Both MP4s passed
decode and audio-signal validation. `review-text-attachment-export.mjs` extracts
eight stable keyword frames; actual green-background/red-icon pixel gaps were
14,14,15px (English) and 14,14,14,14,16px (Chinese), within the declared 3px lossy
encoding tolerance of 14.4px spacing. Both full-duration 2fps contact sheets were
visually inspected. Evidence and MP4s:
`/Users/zhengwei/Downloads/text-attachment-export-2026-09-28/`.
No perceptual audio listening was performed. This intentionally bright diagnostic
overlay can overlap the subject and is not an aesthetic candidate or a new
90-point template. These static current-pose exports do not verify animated,
cross-group, follow-off or detach interactions.

Live service/browser verification now passes for the current-pose path. The
isolated saved fixture `text-attachment-validation-20260928` uses a green text
background and a red square, with native `referenceBounds: text_box`, right
placement and a 0.02 canvas-width gap on a 720px canvas. The browser verifier
reads actual rendered pixels: short text has green right=393 / red left=408;
long text has green right=500 / red left=515. Both have a 14px raster gap versus
14.4px authored spacing. Both screenshots `/tmp/text-bound-{0,1}.png` were
visually inspected. Original user projects were not edited.

This live test exposed an absent-field mutation in descriptor emission: mutable
JSON indexing created `renderGroup: {tracks: null}` on ordinary leaves, breaking
scene construction. Optional `get_mut` traversal fixes it; native regressions
now require ordinary parent and child clips to remain free of `renderGroup`.
The service was rebuilt/restarted after checking that ordinary and production
jobs were idle. This is browser pixel evidence only; no MP4 was exported for this
fixture, and follow-off / measured detach/writeback remain incomplete.

Rust now accepts explicit `referenceBounds: text_box` on spatial relations, with
legacy/default `layout` omitted on serialization. Current validation requires a
text parent and `followMotion: true`; follow-off is still rejected. After grouping
and transition preroll, compilation emits each child's `textAttachment` with the
unique covering parent's final element/track/group-path identity and the native
placement anchor. Group-local clock offsets are converted to scene ticks for
coverage checks. Default layout relations emit no descriptor. Dynamic-asset
detach/removal that needs to bake a measured dependent now fails explicitly until
measured writeback exists, rather than silently restoring a fixed-box position.

Template regression: 176 passed, 1 ignored. The compile regression verifies exact
parent identity, native layout metadata, default serialization and follow-off
rejection. A separate grouped-clock regression exercises final nested identity
and rejects insufficient temporal coverage. Service rebuild, browser/MP4 validation,
follow-off support and editing writeback remain outstanding. The historical entries
below describe earlier intermediate states; native descriptor generation now
supersedes their statements that generation is absent.

The ordinary shared frame resolver now collects `textAttachment` descriptors
carried by timeline elements through scene construction, then runs the ordered
correction pass after text measurement. The descriptor carries an exact parent
group-path/track/element identity and normalized anchor; parent reference boxes
come from native text-layout metadata. Scene construction copies descriptors so
renderer changes do not mutate source documents.

An integration test constructs timeline elements, builds both preview/export
scenes, uses actual Canvas font measurement and calls the normal resolver without
injecting a binding argument. It verifies a 10px gap across forward/backward frame
resolution without cumulative drift, explicit broken-reference failure and
unchanged input documents. This is frame-resolution evidence, not an MP4 or
native authoring acceptance. Rust does not yet emit these relation descriptors;
follow-off activation semantics and editing writeback remain outstanding.

The Rust text compiler now retains the authored reference rectangle as four
`template.textLayout*` scalar params in untransformed text-local pixels. The left
coordinate uses the actual alignment anchor, including stroke and enabled
background-padding offsets; it must not be guessed from a centered region.
The shared scene builder carries valid text-only metadata into `RenderNodeSource`,
and the internal attachment pass consumes it when no explicit reference is supplied.
Missing metadata fails explicitly for an attachment instead of guessing on legacy
text. The native alignment/motion regression covers all three alignments and a
padded left-aligned case; scene-builder tests and Web typecheck passed. Five
attachment-pass tests cover native-reference consumption and absent-reference
failure. These source changes have not yet been built into the running service;
native relation descriptors and normal render-caller wiring are still outstanding.

The renderer now has an internal optional `textAttachments` second pass after
independent node resolution. `applyTextAttachments` pairs exact group-path/track/
element identities, resolves current-pose parent dependencies, accumulates inherited
scene displacement once, converts into each child's container, and commits only
after all active bindings succeed. Missing/ambiguous instances and cycles fail
without partial position mutation. Independent child scale, rotation and opacity
are retained. Four tests / 17 assertions cover reversed dependency input,
transactional failure, inactive children and same-named scoped instances.

This path is not supplied by native compilation or the normal canvas-renderer
caller yet. It is an internal current-pose implementation, not published support
for follow-off/activation-time behavior or group-controller attachment. Native
descriptor production, temporal validation, activation sampling, interaction
writeback and real export verification remain outstanding.

- `composition::relative_region` positions children against authored rectangles.
- `relationships::follow` requires a unique covering parent instance and bakes
  position, scale and rotation into child keyframes. It preserves independent
  opacity and duration.
- `compiler.rs` positions text at an alignment-dependent anchor; its anchor is
  not always the authored region center.
- Web `measureTextElement` computes fitted/wrapped text and background bounds.
  `TextNode` and the shared resolver use this during actual rendering.
- `resolveNode` resolves siblings concurrently. Child-first traversal cannot
  assume that a referenced parent's measured state is already available.

These constraints rule out estimating width from character count or applying a
workbench-only CSS offset. Both approaches diverge from actual exports.

## Measurement Evidence

Paused preview frame identity now includes the requested playhead position. This
prevents a previous frame's guide from remaining visible while a seek renders.
The browser guide verifier holds the font-ready render await, seeks to 40ms after
the selected compiled instance's actual start, checks that both canvas and guide
are hidden until release, then verifies the exact rendered time and a changed
entrance polygon. It passed, as did Web typecheck. The instance start is read from
the compiled response rather than assuming that example content begins at zero.

Layout mode now displays the selected text's measured box as an orange dashed
polygon. The existing authored layout handles still own interaction. The guide
projects the measured corners through the text transform and nested group surfaces
from inner to outer around the common canvas center; it does not claim clipped
ink, stroke or shadow bounds. A coordinate regression covers rotation and
nonuniform scaling. The browser guide check changes a note-style keyword from
two to eight Chinese characters, waits for the new response/frame, and confirms
the polygon changes; `/tmp/text-measurement-guide.png` was visually inspected.
Typecheck passed. This is a read-only guide, not measured-bound dragging or
automatic icon attachment.

The shared `CanvasRenderer.render` / `renderToCanvas` now return frame text
measurement snapshots after successful rendering. Each snapshot includes the
authored origin, scene/local time, untransformed measured text+background box,
text transform and enclosing group transforms in outer-to-inner order. Snapshots
copy values rather than retain live node references. Inactive group descendants,
inactive text and generated text without authored identity are excluded. These
are local boxes and transform bases, not final scene-space selection rectangles.
The renderer and measurement suites passed 10 tests / 86 assertions, including
actual Canvas font measurement and independence from subsequent node mutation;
Web typecheck passed. No placement correction or editor selection consumes these
snapshots yet, so measured attachment is still unavailable.

On 2026-09-28, the shared scene builder gained `RenderNodeSource` metadata on
authored nodes: timeline element/track IDs, optional template element/instance IDs,
the enclosing group path, and the cumulative scene-clock offset in ticks. This
keeps repeated instances distinguishable without parsing renderer-specific params.
Nested offsets use the same `startTime - timeOrigin - trimStart` calculation as
group resolution. Generated root/background nodes have no authored identity.
Four scene-builder tests passed (46 assertions), covering text, graphic, sticker,
video, image and effect nodes, duplicate leaf IDs across group scopes, nested
trimmed group clocks, preview/export construction and unchanged source documents.
This metadata is preparation only: it does not yet resolve measured attachments,
change positions, expose selection bounds or establish exported-pixel agreement.

The existing layout-box follow path received a prerequisite position correction on
2026-09-24. It now rotates the authored child offset into the parent's axes at child
activation, applies the per-axis scale ratios, then rotates into the current parent
pose. Previously it scaled in world axes before applying the rotation difference;
this drifts when initial rotation and nonuniform scaling are combined.

`attachment_position_uses_rotated_parent_axes_at_child_activation` verifies a child
starting later than its parent, initial 90-degree rotation, final 180-degree rotation,
nonuniform scaling, parent translation and independent child displacement. The
analytically expected endpoint is (-90, 70); the previous formula yields (-30, 100).
Start position, child opacity and timing and the original parent are also checked.
The existing translation-follow regression still passes. Full template-module
regression: 173 passed, 1 ignored (the FFMPEG/local model reference-analysis fixture).
This changes position calculation only; it does not introduce measured bounds,
general affine/shear inheritance or complete the acceptance gates below.

The shared Web text rasterizer also had an inconsistent matrix order: canvas
`translate -> scale -> rotate` scaled rotated glyphs along world axes, while the
visual compositor and native attachment path use local-axis scaling. It now uses
`translate -> rotate -> scale`, matching image/graphic transforms. A real Canvas
pixel regression checks that, after a 90-degree rotation, doubling local X doubles
the rendered height, while doubling local Y doubles its width. It also compares
the unrotated dimensions. All 20 text tests (115 assertions) and Web typecheck
passed. Preview and export call this shared rasterizer, but no new MP4 was rendered
for this change. Existing nonuniformly scaled, rotated text will render differently;
unrotated and uniformly scaled text retain the same transform. This remains a
prerequisite correction, not the measured-bound attachment feature itself.

The existing `MeasuredTextElement.visualRect` is already the appropriate
text-box candidate: `getTextVisualRect` unions the final text block with its
enabled background. Despite its name it does not include stroke or shadow
overhang. Reuse it; do not add another independently maintained bounds field.

`apps/web/src/text/attachment-bounds.test.ts` verifies this using the actual
Canvas-backed measurement pipeline: short/long text under three alignments,
scaled background padding, displaced background union, fitted multiline text,
and independence from shadow/stroke. Four tests and 27 assertions pass. These
tests establish the measurement input only; they do not establish attachment
transforms, interaction bounds or MP4 consistency.

## Contract

On 2026-09-28, native placement was factored into
`SpatialPlacement::anchors`: normalized parent and child anchor pairs plus the
signed gap axis. Existing `relative_region` now uses these values directly.
This provides a single native definition of above/below/left/right/overlay
for a future measured-box descriptor, without changing the serialized relation
or advertising measured attachment. The regression covers all five placements,
independent X/Y offsets, preserved child size and translation of the reference.
The 24 composition tests passed, including transitive relations, parent motion
and rotated nonuniform-scale attachment. The descriptor, renderer pass and
interaction gates below remain unimplemented.

Extend the existing relation with an explicit bounds source, defaulting to the
authored layout region. An opt-in text-box source means the measured text block
including enabled background padding, but excluding shadow and stroke overhang.
Shadow is a visual effect and must not unexpectedly push an attached icon away.
The name must describe a text box, not promise exact glyph-ink bounds.

Keep placement, gap, offset and motion following independent. Existing documents
retain layout-region behavior. Rust owns validation, instance-parent resolution,
units, dependency ordering and the compiled relation descriptor. Web supplies
platform text metrics and applies the descriptor during shared render resolution.
Desktop must advertise support only after its renderer implements the contract.

## Coordinate Invariants

`text-attachment-geometry.ts` now implements the rendering-side displacement
adapter: a native-selected normalized anchor is evaluated against the measured and
reference boxes in the parent's local text coordinates. The difference passes
through the supplied parent basis and outer group transforms, then through the
inverse destination-group transforms. Translations are excluded from displacement;
child animation, scale, gap and offsets are not rewritten. The caller must supply
the current or activation-time basis according to the native contract. Singular
destination transforms and nonfinite geometry fail explicitly.

Five tests / 63 assertions passed, using actual Canvas measurements for short/long
Chinese and English, three alignments and two background paddings. Additional
analytic tests cover rotation, nonuniform scale, cross-group conversion, reflection
and cancellation of common nested transforms. This helper is not yet invoked by
the frame resolver: native descriptors, ordered dependency resolution and editing
writeback are still required before it becomes an executable attachment feature.

1. Measure in the parent's untransformed local space using its actual resolved
   font, fitting, wrapping, alignment and background padding.
2. Compute the selected edge/center for both the authored reference rectangle
   and measured text box in that same space. Do not subtract world-space AABBs
   after rotation; that makes icons drift around rotated words.
3. Apply the difference as a position correction. Preserve the child's own
   animation, size and offset. Transform the correction using the same parent
   basis used by motion following, without applying parent motion twice.
4. Define follow-off behavior explicitly: use the parent pose at child activation
   for the correction, while continuing to use the actual text measurement.
5. Resolve parent metrics before dependent corrections in a second, ordered pass
   after independent node resolution. Group-local clocks and transforms must be
   retained; cross-group references require an explicit coordinate conversion.
6. Preview, export, hit testing and selection bounds must use the same correction.
   Dragging edits the relation offset. Detaching bakes the visible placement.

## Acceptance Gates

| Case | Required evidence |
| --- | --- |
| Legacy layout relations | Existing fixture positions and animations unchanged |
| Short/long Chinese and English keywords | Measured icon-to-text-box gap stays constant |
| Left/center/right alignment | No center-anchor assumption or edge reversal |
| Wrapping, fitting, background padding | Relation uses final measured box |
| Parent rotation and nonuniform scale | Correct local basis, no double transform |
| Independent child motion and opacity | Relative animation remains authored |
| Missing parent, cycles, timing mismatch | Explicit native rejection |
| Groups and nested attachments | Correct dependency order and local time |
| Edit, reload, copy, insert, detach | Native relation survives and remains editable |
| Browser preview and MP4 export | Same representative positions at event boundaries |

Do not advertise this in execution capabilities or expose an enabled control
until the shared rendering path and interaction bounds pass these gates. The
existing follow study remains a layout-box attachment example in the meantime.


### 2026-09-28 — measured sparkle export review and AI discovery

Confirmed production `production-34170a123040d3e07b1c6899a9fe0520` is terminal: render job succeeded, one preview-only design, two decoded MP4s with validated audio streams. Copies, original batch evidence and 2 fps contact sheets are in `/Users/zhengwei/Downloads/measured-sparkle-pilot-2026-09-28/`. Inspected both contact sheets: cream keyword labels accommodate short/long English and Chinese text, star decoration follows the label edge, and independent active-word captions appear below. This sparse sampling does not establish motion-boundary quality. English gold decoration has weak contrast over patterned clothing; Chinese keyword selection includes awkward “下一句话”. Chinese input is audio-only on black, so it does not establish real-footage composition quality. No perceptual listening or aesthetic 90+ approval was performed.

Added native `detachPreview` schema discovery and MCP `preview_detached_dynamic_asset` transport. Updated AI editing descriptions for measured text bounds, frame move/scale and current-pose detach, including matching-frame/source requirements and unsupported shear. Transport test passes; `cargo check -p moirai-footage --quiet` passes. Running Rust service was not restarted for this schema addition; source is validated, live schema exposure requires next safe service rebuild/restart. Existing detach-preview endpoint already existed before this change.

Remaining product goal: simplify the workbench around reusable keyword/decorative/caption styles and their sound-driven application; refine these observed visual/semantic defects; review motion boundaries and more real footage; deliver 20 genuinely distinct styles with justified 90+ aesthetic evaluations. Engineering and transport checks are not substitutes for that acceptance.

### 2026-09-28 — style discovery and measured keyword correction

The style library now exposes keyword/decorative-text/caption/decoration filters as directly visible buttons with pressed state and keyboard focus, alongside all/unclassified. Added concise workflow guidance and renamed the existing trial action to 用声音试效果. Headless browser verified each category returns matching purpose labels (10/7/2/2 records, overlapping purposes and diagnostic assets included; these counts are not accepted-template counts). Web typecheck passed after edits.

Authoring script now verifies the pinned Chinese transcript and selects tokens 26..30 (写下一句话) rather than 27..30 (下一句话). The ASR token 下一 remains intact; no synthetic subword timing was introduced. New batch `production-2f68abbb628b8c9d3c478dab7f799e31` succeeded with two rendered previews. Inspected Chinese MP4 frame at 7.6s: full action label and decoration visible, caption still follows original token timing. Evidence: batch-refined.json, sample-chinese-refined.mp4, chinese-refined.jpg in the measured-sparkle output directory. This fixes semantic selection, not ASR token granularity. Complex-background icon contrast and broader style quality remain open.

### 2026-09-28 — preview workspace layout

Removed stretched preview grid rows (`align-content:start`) and fixed inherited column-label styling so preview duration stays inline with playback controls. Increased the responsive preview cap from 380px/45vh to 560px/56vh, retaining aspect ratio and available-width containment. Inspected the actual 1440×1000 workbench: square preview is now 560px and controls no longer spread vertically through the pane. Category switching still returns matching assets. Browser checks at 1280×800 and 390×844 confirmed no document horizontal overflow and stage containment; narrow layout remains vertically scrolling. Web typecheck passed. This is a workspace usability improvement, not an aesthetic-template acceptance.

### 2026-09-28 — footage contrast refinement

Updated `style-study-20260928-measured-sparkle` to revision 2 with a separate cream ellipse behind the gold icon. The backing remains an ordinary editable shape, uses its own motion channels and a formal measured text-box attachment, and shares the icon center by accounting for the two region widths in the relation gap. Original source study remains unchanged. Fixed author script revision handling for updates; rerunning unchanged now retains revision 2. HTTP non-JSON validation responses now retain their actual error text.

Batch `production-821a5d6b626fe3c71e54ae8ae8af86c6` succeeded with two decoded exports and validated audio streams. Inspected English footage and Chinese stable frames, plus 15 consecutive 30fps frames around each first keyword entrance. The gold symbol remains inside its cream backing and is substantially easier to distinguish over the patterned clothing; English first-keyword exit also falls within that inspected sequence. Chinese backing appears before the icon becomes distinct during the fade, but no detached or clipped geometry was observed in sampled frames. This does not establish full-video motion acceptance or perceptual audio quality.

Artifacts under `/Users/zhengwei/Downloads/measured-sparkle-pilot-2026-09-28`: batch-badge.json, sample-badge-0.mp4, sample-badge-1.mp4, badge-stable-{0,1}.jpg, badge-entrance-{0,1}.jpg. No 90+ aesthetic certification or 20-template completion claimed.

### 2026-09-28 — post-layout interaction and live AI contract verification

Reran the complete chain measured-selection browser verifier after resizing the preview. Isolated asset `dynamic-2c3c4998-a154-43b7-8c18-ba2564075db6` passed polygon hit testing, property-panel selection, seek updates, drag, cancellation, transparent-parent child movement, proportional/axis scale, save/reload, and current-frame detach. Maximum measured fixed-pivot error was below 0.000089px; detach error 0px. Detached child remained independent of former ancestor movement.

Built the current Rust binary and inspected both service and production state: no queued/running jobs. Replaced the verified idle listener and confirmed live schema now includes detachPreview. Called the registered MCP `preview_detached_dynamic_asset` against the live service with the saved sparkle revision 2 and obtained nonempty overlay tracks; readOnly annotation true. MCP transport regression passed. This closes the earlier pending live-schema deployment; it does not validate AI autonomous pose measurement or unsupported sheared detach.

### 2026-09-28 — inspector priority

Moved selected-layer visual controls before position/size controls, and motion controls before advanced application/group rules. This preserves fields and native operations while making content binding/font editing reachable earlier for keyword and decorative-text work. Web typecheck passed. Browser selected quotation revision 4, verified DOM order, edited font size 96→97 in the draft, discarded changes and confirmed 96 restored after React update. Screenshot `/tmp/style-inspector.png` inspected. No asset was saved and no additional diagnostic asset created by this check. Existing diagnostic records still clutter the all-styles listing; library lifecycle/organization remains open.

### 2026-09-28 — recoverable style library archive

Added Rust-owned `dynamic_asset_library` state separate from reusable definitions and immutable versions. `POST /templates/dynamic-assets/archive` checks both current asset revision and independent library baseRevision, returns archived state with incremented library revision, and rejects stale writes. Archive/restore does not change definitions or existing applications. Listing retains all assets and includes separate library entries; UI defaults to active records and exposes an archived view. Direct links can reopen archived styles. MCP exposes schema and archive_dynamic_asset; list description explicitly includes archived definitions.

Native test covers archive/restore, no-op, stale library/asset revisions and byte-equivalent current/historical definitions. MCP transport test and Web typecheck passed. Rebuilt/restarted service only after both queues were confirmed idle. Browser verified archive, filter disappearance, archived-view restore, reload persistence, and disabled archive with dirty draft; original fixture definition unchanged.

Archived 14 known generated measurement fixtures, identified by exact UUID-style test name and both selection-secondary/selection-badge layer IDs. Recovery manifest `/Users/zhengwei/Downloads/measured-fixture-archive-2026-09-28.json`. Formal styles were not included. Successful measured-selection verification now archives its own fixture; failed fixtures remain inspectable. Other diagnostic families remain for separately verified cleanup.

Post-change chain interaction verifier passed again for `dynamic-928c3c74-5c49-411a-a358-2c9204d4151c`; readback confirms archived=true/library revision 1 after success. Current-pose detach error remained zero. Existing category/browser checks also passed after archive support at 1280px and 390px without horizontal overflow.
