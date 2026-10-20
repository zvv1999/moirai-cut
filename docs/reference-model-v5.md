# Reference model V5 implementation and verification

Implemented on top of the V4 native writeback (project revision 24):

- `text_highlight.stroke: {color, width}` compiles to editable keyword stroke
  parameters. Width is the outward outline radius in design pixels. The renderer
  uses the existing UTF-16 keyword range and preserves base text fill/stroke.
  The editor exposes the toggle, color and width; the template workbench exposes
  the same operation. This is one keyword range, not arbitrary rich text runs.
- `canvas_clip.region` is a normalized, fixed canvas rectangle. Compilation
  converts it to design-pixel `clip.*` params. Text clips before its transform;
  video/image/graphic/sticker use a canvas-space compositor mask. Shared visual
  groups apply the treatment to members; isolated composite groups are rejected.
  Clip coordinates are static, while the element can animate independently.
- `composition.lifecycles` bind a unique element instance to a start event's
  start and an end event's end. Ambiguous or missing references are errors.
- `composition.stateRelations` trigger a target's opacity envelope when the
  source appears. Only a unique overlapping source is accepted. Authored opacity
  motion conflicts are rejected, as are cycles and duplicate target owners.
- `composition.accumulatingLists` contain ordered item/start-event pairs and a
  shared end event. Compilation produces independent editable element intervals.
  It rejects unordered events and conflicting lifecycle ownership.
- Rectangle styles support `grid: {spacing, width, color}`. Native rectangle
  graphics expose grid controls. Values use the graphic's source coordinates
  and follow its existing transform. A grid style cannot be applied to text.
- Template workbench forms expose lifecycle, dimming relations, accumulating
  lists, clip regions, keyword strokes and grid styles. Compilation remains Rust
  owned. Native timing/opacity/keyframe tools edit the compiled result.

## Verification

- Rust template suite: 130 passed, 1 ignored at this stage.
- Web focused suite: 26 passed, including independent stroke pixels,
  fixed clipping under text translation, and editable grid rasterization.
- Native writeback: 21 element updates at r24; 9 keyword stroke styles plus
  constant clip windows where supported by the observed data.
- Native rendered samples: 1.8, 1.866667, 2.433333, 5.9, 8.93, 15.43 seconds.
  The original failed render caused by missing visual-node clip plumbing was
  corrected; subsequent render returned actual image evidence with no frame errors.

## Boundaries

Source full-screen/inset layout compilation already exists and retains source
clock/audio; it is covered by the Rust source-layout regression tests. This turn
does not independently recover a clean portrait/background from the burned-in
reference. Original caption-covered pixels are unavailable. The reference
project remains a text reconstruction inspection scene, not a claimed clean
1:1 finished movie.

V4 observations with changing clip windows are not silently imported as static
windows. General animated clipping, arbitrary rich text styles, exact original
font metrics and independently recovered clean footage remain outside this
implementation. The published capabilities describe the supported subset.
