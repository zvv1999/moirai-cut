# Caption and MG style system

Use this reference after reading the target text elements, representative frames, and relevant audio events. Values are starting ranges, not presets to apply blindly.

## Hierarchy before motion

| Role | Reading and layout | Motion budget |
| --- | --- | --- |
| Master title | 2–8 Chinese characters; strongest contrast; one focal position | one entrance plus optional exit |
| Chapter card | 2–10 characters; consistent recurring anchor | one repeated motion family |
| Dialogue subtitle | 4–7 个汉字/秒; one or two lines; semantic units | opacity plus very small drift only |
| Editorial caption | usually 4–12 characters; one line | one emphasis gesture if motivated |
| End card | enough stable time to read brand and location | release or fade, no busy exit |

- Keep important text inside `title-safe`: start with 8% horizontal and 6% vertical margins, then move farther from faces, hands, glass rims, products, and UI overlays.
- On a 1080×1920 canvas, OpenCut text size is an app unit scaled by `canvasHeight / 90`. Start around `fontSize: 5–8` for a major title and `3–5` for captions; never copy CSS pixel sizes such as 72 or 96.
- Use at most two font families, three size levels, and one accent color in a sequence.
- Prefer a restrained translucent background, subtle stroke, or shadow when footage contrast changes. Do not stack all three unless the render proves it is necessary.

## Motion timing grammar

Build every motion from four phases:

1. **Anticipation**: optional 80–120ms offset, scale compression, or directional pre-position.
2. **Settle**: 160–260ms to reach the designed position and opacity with a bezier curve.
3. **Hold**: long enough to read; dialogue timing follows semantic breath and shot boundaries.
4. **Exit**: 120–220ms, usually simpler and slightly faster than the entrance.

Convert milliseconds to element-local seconds before calling `element.upsertKeyframe`. Use `element.setKeyframeCurve` for the segment leading to the next key. Each channel needs at least two keys.

每个节拍只保留一个主运动：position、scale、letterSpacing 或 background geometry 中选择一个；opacity 可作为辅助。不要同时弹跳、旋转、缩放、描边闪烁和模糊。

## Style families

### Restrained cinematic

Use for documentary, food, travel, portrait, quiet brand films, dialogue, and atmospheric footage.

- Warm white or footage-derived neutral text; one muted accent.
- Slow 2–4% scale or 12–32 app-unit positional drift.
- Opacity entry 180–300ms; minimal overshoot or none.
- Wide but controlled title letter spacing; captions remain compact.
- Let sound bridges and cuts carry energy instead of decorative transitions.

### Editorial grid

Use for chapter structure, information-led edits, architecture, fashion, and product detail.

- Strong alignment to a recurring left, center, or edge anchor.
- Separate labels, numbers, and titles by size/weight rather than many colors.
- Reveal along the grid direction with 16–48 app-unit movement.
- Repeat one chapter-card grammar so the viewer learns the system.
- Use small rectangles or line-like graphic elements only when they reinforce alignment.

### Rhythmic kinetic

Use only when music, speech cadence, or a high-energy brand supports it.

- Split phrases by semantic beat; never animate every character merely because it is possible.
- Use 4–8% scale compression or a short directional offset for anticipation.
- Land the main word on a verified beat or spoken stress, then hold it cleanly.
- Alternate movement direction only when the edit changes screen direction.
- After two high-energy beats, include a calmer hold to avoid constant visual shouting.

## OpenCut operation map

- Static design: `element.setParams`.
- Entrance, settle, emphasis, exit: `element.upsertKeyframe` on `opacity`, `transform.positionX`, `transform.positionY`, `transform.scaleX`, `transform.scaleY`, `letterSpacing`, `fontSize`, or background geometry.
- Curve polish: `element.setKeyframeCurve` with `bezier` and `auto`/`aligned`; use hold only for intentional stops.
- One coherent design write: `edit_project` with current `baseRevision` and stable `idempotencyKey`.

Avoid animation properties unsupported by the current operation schema. Do not claim a color tween, per-character animation, blur transition, or path morph was created unless the active editor tools actually expose and verify it.

## Render quality gate

For each recurring motion family render:

- 1 frame before movement;
- 1 frame during the fastest change;
- 1 stable reading frame;
- 1 frame after exit or at the cut boundary.

Reject and revise when any of these occur:

- text enters from an unrelated screen direction;
- title-safe or focal objects are violated;
- a phrase disappears before its reading time;
- two unrelated motion families compete in one beat;
- scale or position jumps because the first/last key is missing;
- background, stroke, or shadow makes the typography look like an unrelated template;
- the representative frame is stale, black, clipped, or from the wrong revision.
