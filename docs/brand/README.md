# OneCut brand

OneCut is an agent-native, local-first video editor. Its identity turns one precise editing decision into a simple visual system: one frame and one diagonal cut.

## Brand line

- Chinese: **一句话，剪出成片**
- English: **Edit by intent. Finish with control.**
- Product descriptor: **The agent-native video editor**

## Logo system

- Use `symbol.svg` when the OneCut name is already visible.
- Use `logo.svg` on light surfaces and `logo-light.svg` on dark surfaces.
- Use `icon.svg` for app icons and small, color-independent placements.
- Keep clear space equal to one quarter of the symbol width.
- Do not add a playhead, node, second slash, scissors, film reel, play-button symbol or decorative cut to the wordmark.

## Color

| Role          | Value     | Use                                      |
| ------------- | --------- | ---------------------------------------- |
| Cut Black     | `#0A0D10` | Primary dark field and icon background   |
| Frame White   | `#F4F7F8` | Type and inactive frame geometry         |
| Decision Cyan | `#22D3EE` | Active cut, selection and primary action |
| Slate         | `#94A3B8` | Supporting text                          |

## Typography

Use a modern grotesk or system sans. Recommended stack: `Inter`, `SF Pro Display`, `Segoe UI`, `Helvetica Neue`, sans-serif. Headlines should be compact and confident; body copy should stay neutral and readable.

## Public assets

Source logos live in `apps/web/public/logos/onecut/`. Campaign PNGs live in `docs/brand/assets/` and must use a real OneCut product screenshot. The visual philosophy is documented in [`onecut-visual-philosophy.md`](onecut-visual-philosophy.md).

- `onecut-logo-preview.png`: wordmark preview for listings and reviews.
- `onecut-editor-product.png`: product evidence image used by campaign layouts.
- `onecut-launch-landscape.png`: 16:9 launch image for README, social and press.
- `onecut-launch-portrait.png`: portrait launch image for mobile channels.

Do not commit temporary crops, prompt experiments, contact sheets or generated mock product UI to this directory.

## Open-source attribution

OneCut is an independent fork of OpenCut Classic. OneCut uses its own name and original marks. The OpenCut name and logo are not part of OneCut's brand assets. Keep the MIT license, upstream copyright notice and fork attribution when redistributing the project.
