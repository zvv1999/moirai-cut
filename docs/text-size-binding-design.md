# Measured text size binding

Implementation, automated validation and real production export checks: 2026-10-08.
Interactive editor acceptance of the new controls is still pending. This is a geometry contract,
not a claim that all generated frames meet an aesthetic score.

`SpatialRelation.sizeBinding` independently binds width and/or height of a native
rectangle, ellipse or line to the exact text element selected by `relativeTo`.
It requires `referenceBounds: "text_box"` and `followMotion: true`. An omitted
binding retains the old serialized and rendered behavior.

```json
{
  "elementId": "frame",
  "relativeTo": "secondary-text",
  "referenceBounds": "text_box",
  "followMotion": true,
  "placement": "overlay",
  "gap": 0,
  "offsetX": 0,
  "offsetY": 0,
  "sizeBinding": {
    "width": { "factor": 1, "padding": 0.016666666666666666 },
    "height": { "factor": 1, "padding": 0.016666666666666666 }
  }
}
```

Each enabled axis targets `measured text_box dimension × factor + 2 × padding ×
canvas axis`. `factor` is greater than zero and at most 20; per-side `padding` is
0–1 of the authored canvas width/height. At least one axis must be enabled. A
720px canvas with padding 1/60 adds 12px on each side. Enabled parent text
background padding is already in `text_box`; stroke and shadow overhang are
excluded. No font-specific or dialogue-specific estimation occurs in Rust.

Rust owns validation, schema, projection, exact instance/clock pairing and native
editable motion. Contained application projection scales normalized padding with
the corresponding axis; factors stay unchanged. Compilation emits measured size
rules in pixels, source size, authored base size and child anchor after groups,
rigid application rotation and transition preroll establish final identities.
The Web renderer measures actual fit, wrapping, font and background layout before
applying the rule to the graphic's base geometry. Child animation multiplies this
geometry; full affine group correction retains shear. The resized and animated
child anchor preserves the relation's authored gap. Canvas selection reads that
same corrected basis. Preview/export rebuild the pose per frame without drift.

Measured scaling uses the child's attachment anchor when compensating a fixed
corner/edge; otherwise the renderer's anchor correction would double the movement.
Current-frame detach compares measured attached/independent poses and bakes the
static size/position correction into editable child motion. Existing restrictions
on singular/sheared detach still apply.

Editor controls are exposed in composition, dynamic assets and effect trials.
Native capability discovery lists supported axes, units, representations and
execution limitations; MCP transports the native contract. Unsupported media/text
children and motion-following descendants of a size-bound graphic are explicitly
rejected. The latter requires a future graphic-to-graphic measured relation, not
copying the upstream text descriptor and silently resizing unrelated children.
An ellipse does not automatically enclose all text-box corners: its factors are
part of the authored design. There is no automatic aspect-ratio style selector.

Static placement advice reports `measuredGeometryCheck.status =
requires_render_measurement` for size-bound graphics and
`placementCertified = false`. Its candidate eligibility still uses authored
rectangles, so final actual graphic corners must be checked against canvas and
protected regions throughout the animation. Rust does not duplicate font geometry.

Validation completed before real production:

- Footage library: 301 passed, 3 existing ignored (environment/media services).
- Renderer attachment/measurement/selection/scene suites: 32 passed, 276 assertions.
- Web typecheck passed.
- Native cases cover ranges/schema, exact secondary source, group clocks,
  legacy absence, application containment, copy/remap, frame scaling and detach.
- Renderer cases cover fit/wrap, padded dimensions, each axis, independent
  scale/rotation, edge gaps, selection polygons, cross-group shear, shared zero
  scales, atomic invalid input and repeated preview/export resolution.

The new placement-advice regression is run separately after the library suite.
Production preparation: `/Users/zhengwei/Downloads/text-size-binding-20261008/`.
It uses one generic native definition with original library speech/ASR short and
multi-line keywords in 720×720 and 1280×720; no user reference project is changed.


## Real production verification

[Review with both MP4s and all event stages](/Users/zhengwei/Downloads/text-size-binding-20261008/review.html).
Both normal production jobs published after the new service schema was verified:

| Canvas | Batch | Editable project |
| --- | --- | --- |
| 720×720 | `production-6c0a0bcbbc9a8d5d62b2afa452317013` | `tpl-preview-9495dc46d6b1d44393344e580a30c8d1-0-0` |
| 1280×720 | `production-e43124aa7dbefa66666ab6f4fa3e3883` | `tpl-preview-8d6de354cd1cd0300c649dfb628174b2-0-0` |

The same generic definition uses original library narration and transcript revision
4 of `input-941335914fe590272ed1f8cef9af917a`. Each export contains five actual
keyword events, 3–10 Chinese characters including a two-line case. No new speech
or artificial word timing was generated. Application containment/scale produces
10.2px additional padding per side in both canvases, with width padding correctly
normalized differently in landscape. Native child scale starts at .9 and rotation
at −4°, settling over .16s independently of the text's own upward entrance.

All ten stable frames independently locate the exported amber outline: maximum
source-pixel dimension/boundary error is 0.70px against a declared 4px compression
and antialiasing tolerance. The production text_box already includes its blue
text-background padding. At 390px display width, 442 decoded frames with opacity
at least .65 were additionally compared with the expected animated affine AABB,
including 20 frames during the child's rotation/scale entrance. Maximum error is
0.943 display pixels (3.5px declared tolerance). This color/position-specific
verification is not general object detection. All ten eight-stage sheets were
visually inspected; 522 event frames were extracted. Adjacent event frames may
show the next keyword. No frame clipping or late orphan outline was observed.

Both complete files decode, source word arrays match exactly, production
measurement version/producer/output SHA match the actual MP4, and editable saved
project scenes exactly match the frozen fixture. Audio technical checks pass;
decoded stereo PCM SHA matches the prior original-source render exactly:
`657f9f44d6c79679b5bf8a085ab4a98306efa817bcee03ef30151859d450d954`.

MP4 SHA256: square `13b4d89b00db337266f90457e0f22fcea90b20de1131acac25f08bfc7342a7a0`;
landscape `1964a74d1ba06aca97af8a3ff0729175b142ec1764a59e6432cdfa95ff679978`.

Scope: same Chinese source, black background, one rectangle-outline design.
This proves native size-binding execution in these real exports, not independent
new-input visual generalization, dynamic actor protection, ellipse aesthetics or
90-point quality. At 390px display the preserved physical font is 35.91px square
and 20.20px landscape; an application designer can enlarge it when appropriate.
No continuous listening: `listened=false`, final aesthetic verification remains
false. Actual editor interaction on the new size controls remains a separate gate.
