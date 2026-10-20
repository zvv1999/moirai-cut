# Independent asset group opacity: observed compositing gap

Observed 2026-09-29 in saved clock v1 and completion v2. A synthetic keyword
window spans 0.4–0.8 s; at 0.76 s overlapping round caps/joints and clock hands
become visibly brighter than adjacent strokes. Stable opaque frames hide the
seams. Growth v1 also uses layer-wise fading but has less conspicuous overlap.

Evidence: `/Users/zhengwei/Downloads/icon-readability-20260929/motion/` contains
native preview receipts and ten actual renderer samples per asset, including
before, entry, hold, exit and after. `review.html` in the parent folder exposes
the sequences. All three saved definitions remained unchanged.

The cause has two parts: the authored fade lives on individual elements, and
`Definition::project` in `rust/crates/footage/src/templates/dynamic_asset.rs`
expands even `Target::Group` treatments to leaf targets. Merely moving these
opacity tracks into a group-target treatment currently reproduces the same
compositing semantics.

The execution path already supports an isolated surface:

- `composition::ElementGroup { composite: true }` describes execution grouping.
- `relationships::pack` packs member instances into a `renderGroup` controller.
- `GroupNode` / `compositor/frame-descriptor.ts` composite children into a
  transparent surface, then apply group effects/opacity.

The missing bridge is in the independent asset contract/projection. An explicit,
optional isolated-compositing choice should preserve existing container behavior,
project to native composite groups, and retain group-target effects on the
controller. Existing nested-group/target validation and insert/capture roundtrip
must be checked before adopting this representation. Do not silently change all
existing group targets: per-child movement and opacity have different semantics.

A complete fix must include the native editing operation/schema, a human-facing
group control, AI tool documentation, and roundtrip/application coverage. For
clock/completion, preserve child reveal timing, remove only the shared exit fade
from children and put that exit on the isolated controller. Verify overlapping
pixels during fade, source event times, saved/reloaded editing, actual preview
and exported frames. Hiding fades or baking icons into raster files would not
close this modeling gap.

This note records a reproduced defect and a verified available execution path;
it does not claim that the bridge has been implemented or the assets accepted.

## Implemented bridge, production migration pending

The optional `content.composite` flag, native `group_compositing` edit, workbench
Appearance checkbox, AI operation description, capture/insert preservation and
visible-child preview selection are implemented. See
`/Users/zhengwei/Downloads/group-compositing-20260929/` for exact-toggle/save/reload
receipts and before/after renderer frames. The original completion and clock
assets remain unchanged; their fixed-second exit envelopes have not yet been
migrated. Nested overlapping composite groups remain explicitly unsupported.

## Fixed-second migration completed (2026-09-29)

The preceding section describes the earlier bridge-only checkpoint. Clock v2
and completion v3 now use explicit root compositing and a managed
`group-fade-root` motion treatment with `motionTiming`. The exit is 0.06 s;
entrance budgets remain 0.16 / 0.18 s, preserving proportional short-event
compression. Only the last child opacity value changed from zero to one;
entrance reveals, key times, other motion channels and geometry are preserved.

`migrate-icon-group-fade.py` retains immutable source snapshots, checks six
native previews at 0.1 / 0.4 / 4 s event lengths, and saves with CAS only after
the original and parent-times-child opacity envelopes agree. The workbench
offers entrance budget, fade seconds, apply and remove; the native operation
does not implicitly modify child tracks. General motion treatments can also
use fixed phases, mutually exclusive with repeating motion.

`verify-fixed-group-fade.mjs` checks actual before/after canvases, edits 0.06 to
0.12 s on isolated QA copies, verifies exact definition changes and save/reload,
then archives successful fixtures. The saved production assets remain unchanged
by that UI test. Twenty actual canvas frames show preserved entrance/hold and
uniform group fade without bright check caps or translucent clock overlaps.
Evidence: `/Users/zhengwei/Downloads/icon-group-fade-20260929/`.

Three measured Chinese audio samples were exported in batch
`production-c4811e38e9385dcaedb08e612a2d0f7f`. Six semantic events retain source
word windows and all 11 / 7 editable leaves; decoded PCM matches the prior
outputs. This is audio-only visual evidence, not live-footage adaptation,
continuous viewing, listening or an aesthetic acceptance score.
