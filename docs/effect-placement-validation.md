# Effect Placement Validation

Date: 2026-09-23

## Contract

`POST /templates/dynamic-assets/insert` accepts optional `placement: {x,y,width,height}` in normalized destination-canvas coordinates. The source effect artboard is centered and proportionally contained in that rectangle. Omitting placement retains strict dimensions and frame-rate matching. Saved definitions are unchanged.

Rust transforms projected element regions, canvas clips, pixel font sizes, letter spacing, outlines, shadows, grids, and authored/treatment X/Y motion offsets. Opacity, rotation, scale, normalized animation time, fixed entrance/exit seconds, and repeated-motion periods retain their semantics. Blur intensity retains its existing renderer-relative semantics; this does not guarantee identical blur pixels across aspect ratios. The host template's layout and existing elements are untouched.

The composition workbench exposes full-canvas proportional adaptation and strict original-canvas insertion. AI callers can specify a smaller destination rectangle through the same native API. Artboard padding is preserved: this is not content-bounds fitting or automatic face avoidance.

Browser verification found and fixed an existing instance-ID overflow: the UI previously generated 42-character IDs against a 40-character native limit. Successful insertion now selects an actual inserted element from `layerMap`; retry clears the earlier error.

## Evidence

- Rust template suite: 150 passed, 1 ignored. The ignored reference test requires additional media/model prerequisites.
- Extended dynamic-asset suite: 10 passed, including landscape/portrait, 24/60 fps, nested regions, style scaling, treatment clipping, repeated motion, preserved timing, invalid placement, and unchanged definitions.
- MCP suites: 11 passed; the dynamic-asset transport test also covers placement forwarding.
- Web typecheck passed.
- `scripts/templates/verify-effect-placement.mjs`: actual local-service insertion of saved square effect `dynamic-d2f5ec27-7377-4559-ae5f-1335aae91992` into landscape template `template-042f6faf-758f-4c7e-bc40-e11fcf8fc78f`. Strict mode rejects the mismatch; contain mode adds one editable element. Both saved records remain unchanged. Desktop 1280x900 and mobile 390x844 have no horizontal overflow.

This insertion check verifies application geometry and the insertion UI, not rendered-video quality.

## Standalone Effect Trial

The saved effect editor now links to `/templates/effects/{id}/try?revision={revision}`. The trial page exposes output aspect ratio and full/upper/lower effect placement, followed by the existing input/content picker and draft-production workflow. `format` and `placement` query parameters survive reload. Changing placement keeps the chosen input and content in memory, while preview receipts remain matched to the exact generated template snapshot.

Native `POST /templates/dynamic-assets/application` and MCP `prepare_dynamic_asset_application` prepare an unsaved template from an immutable saved effect revision, destination canvas, placement and optional inputs. The native schema is exposed as `application` in the dynamic-asset schema response. The template ID is deterministic from these application settings, its revision is zero, the source-video layout stays full-frame, and no default subtitle layer is added. This API does not create projects or publish templates.

`scripts/templates/verify-effect-trial.mjs` exercises the saved-effect entry, pinned revision, application API, real input selection, changes of placement retaining that selection, desktop/mobile overflow checks, unchanged effect storage, and reload restoration. Set `RENDER_TRIAL=1` to submit a real preview-only production; default mode does not submit. The real run used the NIOSH 7.04-second input `input-e0d2273b4b7b27c945a73d00eb03b2c6`, transcript revision 1, with the fixed-phase active-word caption effect listed above.

Result: batch `production-f997582f2238f6fe9d6a6a6e93f5b618`, independent project `tpl-preview-f79355f263857c1d9a86d86d01f9f947-0-0`. Native render job succeeded, one preview was technically published with `previewOnly:true`, decoded duration 7.04 seconds, and validated source-audio coverage. The generated trial template is absent from the template library. Export:

`/Users/zhengwei/OpenCutProjects/tpl-preview-f79355f263857c1d9a86d86d01f9f947-0-0/exports/production-f997582f2238f6fe9d6a6a6e93f5b618-0-0.mp4`

Inspected a 2-fps contact sheet and a full-size representative frame. The source remains visible, active words change highlight, and captions do not cover the face. Lower-half artboard fitting produces rather small text; this is functional rendered evidence, not aesthetic approval or a claim of reference-quality reproduction. Audio was decoded and measured, not perceptually auditioned. Remaining work includes independent effect size/position controls, more suitable caption sizing and segmentation across languages, entry/exit pixel comparisons on rendered footage, and broader composable media authoring.

Final checks for this extension: Rust template suite 151 passed / 1 ignored, MCP suites 11 passed, web typecheck passed, real-browser trial workflow passed. The ignored reference test still requires additional media/model prerequisites.

## Independent Position And Size

Application requests now optionally accept `transform: {scale,centerX,centerY}` after proportional containment. Scale is relative to that contained result; center is the union center of the projected element regions in destination normalized coordinates. Moving changes geometry and clip positions but not typography or timing. Scaling changes pixel style dimensions and authored spatial motion, preserving dimensionless motion and clocks. Regions outside the canvas are rejected instead of silently clamped. Bounds describe authored element regions, not measured text ink, shadows, or swept animation bounds.

The trial UI exposes an independent-position checkbox and size/horizontal-center/vertical-center sliders. This mode uses full-canvas containment before applying the explicit transform, avoiding the prior size coupling to the lower-half rectangle. The application URL retains all three transform values across reload. Human and AI callers use the same native application API.

Browser verification with `INDEPENDENT_TRIAL=1` checked that moving keeps style records and widths identical, resizing keeps the selected center, the input remains selected, desktop/mobile layouts do not overflow, and the transform survives reload. Existing regional application mode remains covered. Rust tests cover unchanged dimensions during movement, unchanged center during scaling and off-canvas rejection. Full template regression remains 151 passed / 1 ignored; MCP 11 passed; web typecheck passed.

Rendered comparison: `production-e7d6f9de066ba8b0b2ad62196da82a16`, project `tpl-preview-a4383f4a0f5493b680f186d98765a6e9-0-0`, same input and transcript revision as the prior trial, with scale 0.85 and center (0.5,0.82). Render succeeded with a decoded 7.04-second preview and validated audio coverage. Inspected the full-size 1.1-second frame and 2-fps sequence: larger, lower captions remain readable without covering the face. Comparing both editable projects shows identical content, start/duration, and all keyframe timestamps for all 9 text clips, including fixed entrance/exit and word-highlight clocks. This is a functional style sample, not a 90-point aesthetic certification.

Export: `/Users/zhengwei/OpenCutProjects/tpl-preview-a4383f4a0f5493b680f186d98765a6e9-0-0/exports/production-e7d6f9de066ba8b0b2ad62196da82a16-0-0.mp4`.

Still outstanding: live placement feedback before rendering, reference-quality effects and richer reusable decorative/media layers, and broader language/content/viewport rendered coverage. The independent application controls address the earlier size/position limitation; they do not establish these remaining requirements as complete.

## Live Application Example Preview

The trial page now renders the prepared application template through the existing `EffectPreview` and shared CanvasRenderer. Native `/templates/dynamic-assets/application-preview` accepts `ApplicationPreview {template,durationSeconds,example?}` and delegates to the same sample compilation used by effect authoring. Its schema is exposed as `applicationPreview`, with MCP tool `preview_dynamic_asset_application`. Example word timing is explicitly synthetic; this preview does not display the selected video's frames or play its original audio. The existing real-video production preview remains separate.

The preview displays updates from placement/scale settings, preserves its previous canvas dimensions while recompiling, dims stale output during an update, and removes output on compilation failure. Existing authoring preview behavior is reused rather than adding another renderer or JavaScript layout compiler.

`scripts/templates/verify-effect-trial-preview.mjs` passed against the actual service and browser: at 1280x720, moving the center from 65% to 82% changed the rendered pixel center from y=467 to y=590 while preserving the exact 560x67 text bounds and 19,184 bright pixels. Scaling to 75% produced 420x50 bounds centered at y=589.5. Both desktop and 390px-mobile screenshots were inspected; no horizontal overflow, and the saved effect stayed unchanged. The native dynamic-asset suite (11 tests), MCP suites (11 tests), and web typecheck passed.

This closes sample-based live placement feedback. Still outstanding are live compositing over selected footage, reference-quality effects and richer media/decorative layers, and broader rendered content coverage.

## Live Measured Media Preview

The trial now switches from synthetic sample text to the selected library input. The content picker emits the same pinned transcript revision, reviewed semantic units and caption spans used for production. When several inputs are selected, the eye button chooses which one is previewed. Changing that choice does not remove the other production inputs.

Native `/templates/dynamic-assets/sample-preview` accepts `{template,sample}` using the production sample contract. It reuses production planning, source metadata integrity checks and fixture-document construction, then compiles an ephemeral document without creating a project or job. Schema `samplePreview` and MCP `preview_dynamic_asset_sample` expose this capability. Stale transcript revisions and mismatched sources fail before compilation.

Web fetches the original local video into the existing decoder, caches the current source by ID/hash, and supplies it to the shared renderer. Playback uses the source-audio preview clock; pause, seek, mute and deselection are wired to the audio element. The standalone renderer now initializes default masks and effects, fixing the missing-rectangle-mask error discovered by the real-video test. Media/compilation errors are kept separate from renderer errors so successful drawing cannot erase a source-audio failure.

`scripts/templates/verify-effect-live-media.mjs` passed with the 7.04-second interview and, through `TEST_SECOND_INPUT_ID`, the Chinese reading audio input. Checks cover native measured timing and pinned revision, nonblank source-video pixels, advancing audio with canvas time within 0.35 seconds at the sampled check, pause, seek to 1.1/5.6 seconds, mobile overflow, video/audio input switching, deselection removing audio, and unchanged effect/input records. Inspected desktop and mobile screenshots. The live 1.1-second frame compared with the earlier exported MP4 frame resized to 608x342 gives SSIM 0.986651; this is single-frame consistency evidence, not general fidelity or aesthetic certification. Synthetic sample-preview pixel checks also passed after this extension.

Rust template suite: 152 passed / 1 ignored. MCP suites: 11 passed. Web typecheck passed. No new production was submitted during this live-preview verification.

The browser script also passed with `CHECK_AUDIO_FAILURE=1`: aborting the source-audio request displays an error that remains visible after a successful video seek/render, rather than being overwritten by drawing success.

Limitations: live playback currently supports source audio, with additional audio elements explicitly rejected in favor of rendered preview. External decorative resource slots are not yet materialized by this ephemeral preview path. The original-video blob is loaded into browser memory; no proxy or streaming optimization has been added here. Multi-language style quality, richer decorative assets and full perceptual audio/video quality remain to be assessed.

## External Decoration Preview

All three live preview routes now resolve shared visual bindings through the existing native asset catalog. Rust validates the local blob hash, supplies compiler metadata, and returns `mediaSources` descriptors. The browser loads those PNG/video files into the shared renderer and keeps a bounded cache of the currently referenced source IDs/hashes. Default bindings and sample overrides use the same native resolution used elsewhere, rather than inventing UI asset identities.

The content picker forwards resource overrides to measured previews. Changing the application draft ID through positioning/aspect controls retains compatible slot selections, and stable picker keys preserve the expanded picker state. These are unsaved form settings; neither the saved effect nor the shared catalog is rewritten.

`scripts/templates/verify-effect-decoration-preview.mjs` creates or reuses functional fixture `decoration-preview-1790141799884`. It uses existing catalog entries for a transparent PNG emphasis icon and a 2.4-second H.264 celebration icon, with a 2-second authored lifetime. Browser checks passed for visible PNG pixels, changed video-decoration pixels between 0.6 and 1.2 seconds, both resources in measured preview, replacing the PNG with an arrow, retaining that override after changing application region, mobile overflow, and unchanged saved effects. Final screenshot capture waits for the expected template ID and resource IDs to be rendered and for real-video pixels to be present. Inspected both standalone and measured screenshots; an earlier prematurely captured blank frame was discarded and the verifier strengthened.

The video decoration has a baked white background; it is not alpha-video support. This is a functional fixture, not an aesthetically approved template. No production/export was submitted for this extension.

Native tests cover resource materialization and corrupt-blob rejection. Full Rust template regression: 153 passed / 1 ignored; MCP suites: 11 passed; web typecheck passed. The existing live-video/audio browser regression also passed after the cache and binding changes.

Remaining work includes a direct library insertion/replacement workflow inside the standalone effect-layer editor, richer reference-quality decorations, and broader visual review. Source-audio-only playback and in-memory original-video loading remain as noted above.

## Media Layer Authoring

The standalone effect editor now includes the shared searchable visual library for adding PNG/video layers and replacing the selected compatible media layer. Unsaved name, style and geometry edits are included in the native request. Adds inherit the selected group or sibling parent. Replacement keeps authored geometry, motion and timing and creates an independent resource binding; a slot still used by another layer is retained. New video layers cap their initial duration to the clip, while shorter replacement videos are rejected instead of silently changing authored timing.

Rust owns the operation at `/templates/dynamic-assets/media`. `dynamic_asset_schema.mediaEdit` and MCP `edit_dynamic_asset_media` expose the same draft-only contract to agents. File identity and hash are verified before applying it. Saving remains a separate revision-checked operation.

Native regression: 155 passed, 1 ignored. Added tests verify replacement with authored entrance/exit motion, shared binding isolation and unused-slot cleanup, video duration limits, incompatible media and invalid parents. MCP regression: 11 passed. Web typecheck passed.

`scripts/templates/verify-effect-media-editor.mjs` uses isolated fixture `media-editor-1790143012433` and verifies actual browser add/replace controls, preservation of an unsaved name, compatible-media enforcement, video duration cap, save/reload persistence, referenced media in completed canvas draws, changing preview pixels, mobile overflow and unchanged original definition. The frame comparison covers the composite preview, not an isolated video-motion fidelity score. `TEST_MEDIA_EDITOR_ID` allows rerunning against the owned fixture without adding more catalog entries.

Visual inspection confirms rendered decorations. Default insertion positions can overlap text or other decorations and still need user adjustment; this is functional workflow evidence, not a high-quality style approval. Richer reference-quality assets, improved composition ergonomics and broader aesthetic review remain outstanding.

## Layer Stacking Controls

Effect-layer tools now expose bring-to-front and send-to-back for individual elements. Rust `editLayers` operation `{kind:"stack",layerId,position:"front"|"back"}` updates only the selected element's global `z`, preserves the other elements, and makes repeated operations at the same boundary no-ops. Group containers do not have their own stacking field and cannot use these commands. The MCP tool documents the same contract.

Seven native layer-edit tests and eleven MCP tests passed; web typecheck passed. The media-editor browser verifier now sends the newly added video decoration behind the caption, checks changed preview pixels at the same 0.6-second instant, verifies preservation of other fields and persists the resulting order through save/reload. Geometry round-trip comparisons allow only 1e-12 numeric error; all other returned definition fields compare exactly with the submitted draft except the selected z. Mobile overflow regression passed.

Inspected `/tmp/effect-media-editor-reordered.png`: the caption now renders visibly over the video decoration. This does not resolve overlap between decorations or certify visual quality. Alignment and relative placement ergonomics remain to be improved.

## Parent-Relative Alignment

The region editor exposes six icon commands for left/center/right and top/middle/bottom alignment. Native `editLayers` operation `{kind:"align",layerId,alignment}` aligns the authored region within its parent, or within the artboard for root layers. It supports both elements and containers, preserving size, the other axis, motion, timing and descendant local coordinates. It is a one-time geometry edit, not a persistent dependency on another layer or on measured text bounds. MCP exposes the same schema and semantics.

Eight native layer-edit tests, eleven MCP tests and web typecheck passed. Browser verification aligns the video decoration to the bottom-right, checks changed preview pixels and unchanged size/timing/motion, saves and reloads its region, and checks mobile overflow. Desktop screenshot inspection confirms the separated decoration position. The alignment toolbar spans the full inspector grid width, above paired coordinate inputs.

Sibling-relative placement, automatic overlap avoidance, direct canvas manipulation and aesthetic template review remain separate outstanding work.

## Sibling-Relative Placement

The region inspector now has an optional relative-placement section: sibling reference, left/right/above/below direction, parent-normalized percentage gap, and apply. Rust `editLayers` operation `{kind:"place_beside",layerId,referenceId,side,gap}` changes the selected region's position, centers the perpendicular axis, preserves dimensions and rejects insufficient space. References must be different layers sharing the same parent; groups are supported without changing descendant local coordinates. This edits authored region geometry once, not persistent following or measured glyph bounds. MCP documents the same contract.

Nine native layer-edit tests, eleven MCP tests and web typecheck passed. Native tests cover all four directions, exact unchanged fields other than position, invalid references, negative gaps and insufficient space. Browser verification explicitly resized the decoration to 20% by 23%, attempted an invalid right-side placement and verified the visible error plus retained width, then placed it below the caption with a 2% gap. It verified centered x, exact authored gap, unchanged timing, saved region readback and reload. Desktop screenshot inspection confirms separate caption and decoration regions; the existing mobile overflow regression passed.

Automatic overlap avoidance, persistent dependencies that follow changing text, direct canvas manipulation and reference-quality aesthetic review remain outstanding. The baked white video background remains a source-asset limitation.

## Inspector Disclosure

The effect workbench keeps entrance/exit controls visible and defaults the detailed keyframe tracks to a collapsed advanced section with a track count. Existing composition-editor callers retain expanded tracks by default. Busy state disables the detailed track controls. Image/video layers no longer display an empty default-text heading, and layer representation labels are shown in Chinese.

Web typecheck passed. The media-editor browser verifier expands advanced tracks, changes opacity to 0.9, collapses them, then adds/replaces/positions media and verifies that the keyframe value survives save/reload. The existing effect-workbench verifier passed add/copy/remove, independent styles, keyframe creation/timing/easing, discard, playback and mobile checks after updating the deliberate UI labels and disclosure interaction. The separate desktop/mobile preview verifier passed nonblank/animated frames, aspect ratio, overflow and sticky preview checks, with the original effect unchanged.

Inspected the updated desktop screenshot: the same fixture's full page is now 1880 pixels high instead of approximately 3110 with expanded tracks. This is a layout measurement, not a completed usability or visual-quality evaluation. Direct canvas editing and style-library quality remain outstanding.

## Canvas Region Selection And Movement

The standalone effect preview now offers a layout-region toggle. Native preview returns `editingRegions` from the projected template: element ID, description, normalized authored region and z order. These boxes describe authored layout, not per-frame animated glyph outlines. In layout mode, selecting a box selects its inspector layer; pointer movement provides a transient box offset and commits on release. Playback hides the overlay. Escape/pointer cancellation discards the gesture. Arrow keys move by one canvas pixel, or ten with Shift.

Rust `editLayers` operation `{kind:"move",layerId,deltaX,deltaY}` takes canvas-normalized deltas, converts them through the projected parent scale, clamps position inside the parent, and preserves size, timing and animation. Only elements are draggable; groups remain editable through inspector geometry. MCP exposes the same draft operation. No write occurs until the separate save action.

Native dynamic-asset tests: 21 passed; MCP tests: 11 passed; web typecheck passed. `verify-effect-canvas-edit.mjs` uses isolated fixture `canvas-editor-1790144652610` with an inset 80%-scale parent. It verifies desktop dragging and inspector selection/coordinates, unchanged timing/motions, Escape without a move request, exact one-pixel keyboard movement, Chrome touch dragging at 390px, no overflow, draft isolation, save and reload, and unchanged source fixture. Native tests additionally cover nested coordinate conversion, boundary clamping and nonfinite-input rejection.

Preview diagnostics pair a per-response generation with the completed canvas draw. The verifier waits for matching generations and expected projected box coordinates before screenshots. CSS percentage serialization uses a 1e-6 normalized tolerance (subpixel at these canvas sizes); stored coordinates use 1e-12. Inspected `/tmp/effect-canvas-edit-desktop.png` and `/tmp/effect-canvas-edit-mobile.png` after the completed draw. Earlier loading-state screenshots were replaced. The existing animated preview regression also passed after wrapping the canvas for the overlay.

Remaining canvas work includes resize handles and group manipulation. Layout boxes are not animated hit-test geometry; positioning still requires visual review. Reference-quality style assets and automatic overlap handling remain outstanding.

## Corner Resize Handles

Selected element regions now show four corner handles. Dragging changes the authored region while fixing the opposite corner; Escape cancels the gesture. Focused handles also accept arrow-key corner movement. This is region resizing, not proportional scaling of font size, stroke or motion translations. Shared media rendering continues to use its existing fitting behavior.

Native `editLayers` operation `{kind:"resize",layerId,corner,deltaX,deltaY}` uses canvas-normalized deltas and nested parent conversion. It clamps to parent bounds and a one-canvas-pixel minimum where that much space is available. `corner` is `top_left`, `top_right`, `bottom_left` or `bottom_right`. Styles, timing and animation stay unchanged. MCP uses this same contract.

Native dynamic-asset tests: 22 passed; MCP tests: 11 passed; web typecheck passed. Tests cover all corners, unchanged non-region fields, nested scale, minimum size and nonfinite rejection. The extended canvas browser verifier passed real bottom-right dragging, cancellation without a request, top-left keyboard resizing with the opposite edge fixed, style/timing/motion preservation, completed-frame matching, saved-size readback and reload. Existing mobile touch movement still passes with the handles present. Desktop and mobile completed-frame screenshots were inspected; touch resizing itself was not separately exercised.

Group manipulation, proportional style scaling, automatic overlap handling and reference-quality style assets remain outstanding. Resize handles operate on design regions, not animated glyph outlines.

## Container Manipulation

The same move/resize operations now accept container IDs. Native projection and editing share one ancestor-coordinate resolver, retaining cycle, depth and parent-kind validation. Preview region metadata includes a `kind` discriminator and authored container bounds. Unselected containers are omitted from the interactive overlay. Selecting a container from the layer list exposes its box above the children, with the existing movement and resize handles.

Container manipulation only changes that container's region. Descendant local geometry, text, resource bindings, typography, timing and animation remain unchanged; projection moves/resizes descendant regions accordingly. Font size and motion translations are still independent, so container resizing is not proportional visual scaling of all styles.

Full native template regression: 161 passed, 1 ignored. MCP regression: 11 passed. Web typecheck passed. The added native test covers moving/resizing a nested container, unchanged child data/styles and projected metadata. Existing invalid-graph tests still pass after sharing coordinate resolution.

The browser verifier now also selects the root container, moves it and shrinks its region, checks unchanged child local coordinates/motion/timing and styles, verifies completed descendant frame positions, and persists/reloads the container geometry. It checks that an unselected container has no overlay button to intercept child selection. Inspected `/tmp/effect-canvas-group-mobile.png`; it shows the selected container and its child layout regions. This remains functional fixture evidence, not style quality approval.

Proportional style scaling, automatic overlap handling and reference-quality style assets remain outstanding.

## Purpose-Aware Creation And Search

The standalone workbench now offers decorative text, keyword emphasis and dynamic-caption entry points beside a single create command. Native `dynamic_asset::Create` accepts optional `purpose: decorative_text|keyword|caption`. Explicit purposes reuse the existing content-binding and envelope operations: literal text, keyword events, or sentence cues with active-word highlighting, each with editable fixed entrance/exit phases. Purpose is an initialization choice, not a new exclusive asset taxonomy; users can compose or change bindings afterward. Calls omitting purpose retain legacy draft defaults. The create schema and MCP contract expose the same optional field.

The library supports name filtering and a no-results state. Filtering only changes the visible list, retaining the selected draft and unsaved edits. New creation clears the filter so the created record remains discoverable. Header controls wrap on mobile.

Native dynamic-asset tests: 24 passed; MCP tests: 11 passed; web typecheck passed. Native coverage verifies purpose-specific bindings/event anchors, caption highlighting, compilation at 0.5/3 seconds and legacy defaults. `verify-effect-create-purposes.mjs` passed all three actual create entry points, persisted editable definitions, search/no-results, retaining an unsaved name through filtering, saving after filtering, nonblank completed previews, mobile overflow and unchanged existing assets. The verifier reuses its named fixtures on subsequent runs.

Inspected mobile workbench and keyword preview screenshots. These are functional starter styles, not aesthetic approvals or additions to the high-quality-template target. Reference-quality content, proportional style scaling and automatic overlap handling remain outstanding.

## Protected-Region Placement Advice (2026-09-29)

Rust now provides read-only `POST /templates/dynamic-assets/placement-advice`; the web proxy adds `/api/footage`. MCP exposes `advise_dynamic_asset_placement`, and the dynamic-asset schema exposes `placementAdvice`. The request contains an exact-revision `application`, normalized `protectedRegions` (`id`, `region`), optional ordered `candidates` (`id`, `centerX`, `centerY`) and `padding`. Empty candidates use current position, upper-left, upper-right, lower-left, lower-right, top, then bottom. Native application projection supplies the visual-region union. The first in-canvas candidate clear of supplied protection is selected; size, styles and motion are preserved. All blocked returns null selectedId/application/template, with candidate reasons. Advice does not save assets or projects.

The independent-position trial UI can capture the actual preview canvas, draw protection rectangles, edit percentage coordinates, compare candidates and apply the selected transform. Abort/request identity prevents stale replies from applying. Changing source/crop/format/extras clears protection. Protection rectangles are ephemeral; applied transforms use the existing persistence path. No frontend placement algorithm duplicates Rust.

The basis is authored visual regions, not measured glyph/shadow/animated overshoot bounds. Callers must supply important regions and other overlays; this is not face detection, motion tracking or semantic suitability assessment. Advice applies to the primary effect and still requires visual review.

Validation: native templates suite 229 passed, 1 existing ignored; MCP forwarding test passed. `verify-placement-advisor.mjs` passed real-media preview, unchanged scale, all-blocked behavior, source reset, pointer drawing, stale-response suppression, 390px layout and library preservation. `produce-placement-advice.mjs` and `check-placement-advice.py` produced and verified three real exports using one growth r3 application and the same native defaults: current / upper_right / upper_right. All 11 events retain timings, size, styles and animation; decoded audio PCM is unchanged. Entry/hold/exit representative sheets and shortest-event sequences were inspected. This is not continuous real-time viewing or listening evidence.

Review: `/Users/zhengwei/Downloads/placement-advice-20260929/review.html`; six video sources, thirteen images, same-time switching and mobile overflow checks passed. Full web typecheck remains failed: 198 diagnostic lines involving missing Bun types and test fetch typing; no diagnostics named the changed advisor/trial components. No aesthetic score is assigned.

## Independent Active Intervals For Composite Effects (2026-09-29)

`composition.groups[].separateInstances` and dynamic-asset group-layer `separateInstances` are optional booleans, default false and omitted when false. False preserves the historical controller spanning the first through last child occurrence. True partitions the final child intervals into temporal connected components: strictly overlapping members share a controller; gaps and touching boundaries begin another controller. Each controller resolves group treatments against its own duration. This represents visible intervals, not semantic/event identity: a persistent or overlapping child can intentionally connect several occurrences.

The Rust planner owns partitioning and stable group-instance IDs. Child content, timing and local animation remain unchanged. Projection, capture and schema retain the setting. Native draft operation `group_instances` accepts `layerId` and `separateInstances`; the standalone effect inspector and composition editor expose it, and MCP forwards the same operation. Turning off compositing retains the preference for later use but creates no controllers.

This fixes the repeated-appearance case discovered during offset r6 real exports: a single-event preview passed, but the whole-track controller faded only the final occurrence. The final offset r7 enables independent intervals and uses the existing editor-managed 60ms group-exit envelope. Its existing scale/tilt entrance remains fully opaque; the experimental r6 custom opacity entrance was removed. Other saved styles are not silently migrated and require explicit review before enabling the preference.

Native validation covers touching/gapped intervals, overlapping members, staggered starts, unchanged compiled child times, independent 60ms fades, default whole-span behavior, editable projection and rejecting non-container operations. The template suite passed 230 tests with one existing ignored test; the additional scope-edit test passed separately. Browser verification toggles the saved offset preference off/on through the native draft operation, checks saved-version reload and mobile layout, and leaves the library unchanged. Full web typecheck still has 198 Bun/test-typing diagnostic lines, without errors in the modified UI components.
