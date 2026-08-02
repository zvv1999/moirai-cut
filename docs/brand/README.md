# Moirai Cut brand

Moirai Cut is an open-source, local-first video editor where humans and agents
create inside the same visible, editable loop. The identity represents a shared
loom: human intent and Agent proposals cross through one real project state,
with the editable timeline as the thread that keeps every change visible.

## Brand lines

- Launch claim: **FROM BLACK BOX / TO SHARED TIMELINE**
- Chinese launch claim: **告别生成黑盒，进入共享时间线。**
- Product loop: **Prompt. Edit. Preview. Refine. Render locally.**
- Chinese product loop: **对话生成，直接修改，实时预览，本地成片。**
- Brand promise: **Agents propose. You direct.**
- Chinese brand promise: **Agent 参与剪辑，最终控制始终在你。**
- Product descriptor: **The open-source, local-first human-agent video editor**

## Meaning

Moirai is not framed as a goddess or an autonomous system deciding the final
cut. It is a loom shared by a creator and an Agent. The Agent can inspect,
propose and modify; the creator can drag, trim, tune and direct. Both act on the
same visible timeline, preview the same result and continue from the latest
project state. Every Agent action must remain inspectable, editable and
undoable.

Use **Moirai Cut** with a capital M and C in prose. Use `moirai-cut` only for
package names, repository slugs, commands and file paths.

## Logo system

The symbol is a restrained weave. Two paths exchange position across one cyan
timeline, showing human and Agent participating in a shared state rather than
passing work from one side to the other. The mark must not imply fate,
determinism or black-box generation.

- Use `symbol.svg` when the Moirai Cut name is already visible.
- Use `logo.svg` on light surfaces and `logo-light.svg` on dark surfaces.
- Use `icon.svg` for app icons and small color-independent placements.
- Keep clear space equal to one quarter of the symbol width.
- Never distort, rotate, recolor or add glow, gradients or AI sparkles.

## Color

| Role         | Value     | Use                                           |
| ------------ | --------- | --------------------------------------------- |
| Loom Black   | `#090B10` | Primary dark field and app icon background    |
| Living White | `#F5F7FA` | Type, geometry and high-contrast controls     |
| Thread Cyan  | `#22D3EE` | Shared timeline, selection and primary action |
| Signal Slate | `#94A3B8` | Supporting text and inactive information      |

Campaign art may use a restrained warm-white or violet edge to separate layers,
but the logo itself always stays black, white and cyan.

## Typography

Use a modern grotesk or system sans. Recommended stack: `Inter`, `SF Pro
Display`, `Segoe UI`, `Helvetica Neue`, sans-serif. Headlines are compact and
confident; product UI remains neutral and readable. Do not set paragraphs in a
display face or decorate the wordmark with extra cuts.

## Public assets

Source logos live in `apps/web/public/logos/moirai-cut/`. Campaign PNGs live in
`docs/brand/assets/` and use a real Moirai Cut product screenshot. The visual
philosophy is documented in
[`moirai-cut-visual-philosophy.md`](moirai-cut-visual-philosophy.md).

- `moirai-cut-logo-preview.png`: wordmark preview for listings and reviews.
- `moirai-cut-editor-product.png`: product evidence image normalized from the real
  editor capture `G02-agent-plan-preview.png`; campaign rendering never synthesizes
  or retouches controls inside the UI.
- `moirai-cut-launch-landscape.png`: 16:9 launch image for README, social and press.
- `moirai-cut-launch-portrait.png`: portrait launch image for mobile channels.

Do not commit temporary crops, prompt experiments, contact sheets, generated
mock product UI or personal media to this directory.

## Open-source attribution

Moirai Cut is an independent fork of OpenCut Classic and uses its own name and
original marks. The OpenCut name and logo are not Moirai Cut brand assets. Keep
the MIT license, upstream copyright notice and fork attribution when
redistributing the project. See [`TRADEMARKS.md`](../../TRADEMARKS.md) for
allowed brand use.
