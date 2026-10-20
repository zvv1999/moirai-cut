# Reference reconstruction model contract

Implementation update: see [V5 implementation and verification](reference-model-v5.md).
The remaining-design section below is the original proposal; V5 now implements
keyword strokes, static canvas clipping, lifecycle/state relations, accumulating
lists and editable rectangle grid patterns with the limits documented there.

This document separates implemented template fields from proposed capabilities.
The V4 reconstruction HTML/JSON is an analysis artifact, not a native template.
It must not be imported by dropping fields that the compiler cannot execute.

## Implemented in this change

- `Style.letterSpacing`: design-canvas pixels, default 0, finite range -100 to 500.
- `Style.textAlign`: left, center, right; default center.
- `Motion.property`: `scale_x` and `scale_y` independently control the existing
  timeline transform channels. They work for element motion and motion treatments.
- A single motion set cannot combine uniform `scale` with axis-specific scale;
  that would otherwise overwrite a channel. Separate treatments compose using
  multiplication, as existing scale treatments do.
- Old templates deserialize with the previous spacing/alignment behavior.
- The capabilities response exposes these fields and retains explicit limitations.

## Remaining contract design (not executable yet)

### Rich text

Add `textRuns[]` containing `range: {start, end}`, `styleId`, and a content revision.
Ranges use UTF-16 half-open offsets to match the current highlighter. Validate
boundaries, disallow overlapping runs initially, and invalidate ranges after a
content change. Referenced styles should supply fill, stroke, shadow, font and
spacing; they must use the same text shaping/measurement path as the renderer.
Do not simulate a styled sentence using independently centered word elements.

### Clip and mask

Introduce an independent treatment with `shape`, `space`, `region`, `feather`,
`inverted`, and optional property animation channels. `space` must explicitly
distinguish local element space from canvas space. A fixed canvas-space clipping
window must not move with a sliding child. Composition order is part of the
contract: shape text, transform the element, apply the canvas clip, composite.
The current renderer's masks do not by themselves establish this template contract.
Keep `Reveal` unsupported until compilation and rendered tests implement it.

### Lifecycle and relations

Represent visibility and emphasis as separate concerns. Proposed lifecycle rules
use `startEventId`, `endEventId`, offsets, and a scope/instance identifier. Proposed
state relations use a source instance, trigger boundary, target instance, and
treatment ID. Example: the incoming keyword starts a dimming treatment on the
previous caption without ending its visibility.

Accumulating lists use item event IDs, an explicit order, and a group end event.
Compile these relations into existing absolute instance times and keyframes.
Validate missing references, ambiguous repeated instances and cycles before
writing the timeline. Do not execute relation logic in the frontend.

### Analysis evidence and import

Keep measured observations separate from authored parameters. Each inferred
property should retain its source frame/range, method, confidence and review
status. The importer must convert analysis frame times to project ticks and
report every unsupported field. Return an error when a required visual feature
would be lost; optional approximations need an explicit policy and report.

## Acceptance

Current tests verify typography compilation, independent axis channels, conflict
rejection and legacy defaults. They do not establish visual equivalence to the
reference. Remaining renderer acceptance fixtures must cover mixed styled words,
fixed-window sliding text, previous-caption dimming, cumulative lists, and full
frame/inset background transitions. Compare native preview and export using the
same timestamps, in addition to schema and compiler tests.
