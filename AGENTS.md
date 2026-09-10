# Agents.md

## Architecture

An ongoing migration is moving all business logic into `rust/`. Each app under `apps/` is a UI shell — it owns rendering, interaction, and platform-specific concerns, but never owns logic. The UI framework for any given app is a replaceable detail.

### `rust/`

The single source of truth for all non-UI code. Everything platform-agnostic belongs here: no components, no hooks, no framework imports.

### `apps/`

Each app is a frontend that calls into Rust. Logic is never duplicated between apps — only UI is, because each platform may use an entirely different framework and language to build it.

- `web/` — Next.js
- `desktop/` — GPUI

## Web

### React

- Read components before using them. They may already apply classes, which affects what you need to pass and how to override them.

## Local Startup and Optional Services

When asked to install or start this project, first inspect existing local configuration.
On first setup, ask whether the user wants to configure (1) an optional mounted team
NAS directory and (2) an LLM Base URL and model for footage analysis. Respect an
existing answer; do not repeatedly ask or overwrite existing credentials. NAS is
optional and the workbench must remain usable locally. Explain that automatic
analysis requires a compatible video model; skipping LLM configuration still allows
local import and manual review. Never ask the user to paste API keys into chat:
use the hidden terminal prompt in `bun run setup:footage`.

Use `bun run setup:local` for first startup; it prompts for optional integrations,
checks media tools, builds and starts the Rust footage service and starts the web
editor. Use `bun run setup:footage` to reconfigure later. For explicitly requested
unattended local setup use `bun run setup:local --local`. See
`rust/crates/footage/README.md` for prerequisites and endpoint compatibility.
Keep paths machine-local, credentials outside the repository, and NAS sync disabled
until the user enables it. Verify `/api/footage/state` and `/footage` after startup;
report missing dependencies or untested model connectivity instead of claiming the
entire AI workflow works. Do not upload user videos just to test an endpoint.

## Smart Edit Protocol

Before controlling a Moirai Cut project, read
[`docs/agent-smart-edit.md`](docs/agent-smart-edit.md). It defines the two Codex
entry points, `opencut://` context schema, scene/time-sequence inspection,
multimodal media catalog, revision/idempotency protocol, and the exact tool
order for iterative human/Agent editing.
