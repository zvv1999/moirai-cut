# Contributing to Moirai Cut

Thanks for helping build an open, local-first, agent-native video editor.

## Before you start

1. Search existing issues and discussions.
2. Open an issue before a large feature, project-format change, protocol change or UI redesign.
3. Keep pull requests focused; do not mix a mechanical rebrand, behavior change and unrelated cleanup.
4. Never commit API keys, private media, local project files, generated caches or Codex/Claude session data.

## Local setup

```bash
git clone https://github.com/zvv1999/opencut-classic.git moirai-cut
cd moirai-cut
git switch feat/agent-drivable
bun install
bun run setup:local
```

Docker is optional for local editing. Use it only when working on database, Redis or server-hosted features.

The web app currently consumes the published `opencut-wasm` compatibility package. If you edit `rust/wasm`, build and link it locally:

```bash
bun run build:wasm
cd rust/wasm/pkg && bun link
cd ../../../apps/web && bun link opencut-wasm
```

## Quality gates

Run the checks relevant to your change, and run the full set before requesting review:

```bash
bun test
bun run test:mcp
bun run typecheck:web
bun run lint:web
bun run build:web
bun audit
```

For timeline, preview or editor interaction changes, include a regression test and a screenshot or short recording. For MCP changes, document the schema, failure mode and revision behavior.

## Compatibility

The public product name is **Moirai Cut**. Legacy `OPENCUT_*` environment variables, `opencut://` references, `.opencut` project packages, `opencut-wasm` and selected internal type names remain for data and protocol compatibility. Do not rename them without a migration and backwards-compatibility test.

Moirai Cut uses original brand assets. Do not reintroduce the upstream OpenCut logo or imply that Moirai Cut is an official OpenCut release.

## Pull requests

- Explain the user problem and the chosen behavior.
- List tests and manual verification performed.
- Call out migrations, compatibility risks and deferred work.
- Update documentation when behavior, configuration or public APIs change.

By contributing, you agree that your contribution is licensed under the repository's MIT License and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
