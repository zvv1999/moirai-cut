# Changelog

All notable Moirai Cut changes are documented here. The repository is in developer
preview and follows semantic versioning for public release artifacts; project
schema and Agent surfaces may still change with migration notes.

## 0.1.0 — Unreleased

First Moirai Cut developer-preview release, derived from OpenCut Classic.

### Added

- Human-Agent editing workbench with timeline, media-library and range context.
- Shared Codex App Server task and event channel for browser/App continuation.
- Codex and Claude environment discovery, guided MCP installation and local
  account reuse.
- Moirai Cut MCP project read/write tools, scene-aware temporal frame inspection,
  media catalog JSON, revision guards and editor presence.
- Jianying-inspired Chinese editing UI, inspector, keyframes, speed,
  adjustments, audio, subtitles and export workflows.
- Runtime codec probing, proxy jobs, browser delivery and FFmpeg delivery
  presets with original-media final export.
- First-run consent before selected project context or sampled frames are sent
  to an external Agent provider.
- Reproducible public-source snapshot, checksum, CycloneDX SBOM, dependency
  audit and release-readiness workflow.

### Changed

- Public product identity is Moirai Cut with an original visual system and
  synthetic, privacy-safe campaign media.
- Local development is account-free and analytics is disabled unless a
  deployment operator explicitly configures it.
- Rust, Bun and major release tooling versions are pinned for repeatable CI.

### Compatibility and migration

- `OPENCUT_*` environment variables, `opencut://`, `.opencut`, the `opencut`
  MCP registration and `opencut-wasm` remain stable compatibility identifiers.
- New installs may use `MOIRAI_PROJECTS_DIR`; the transitional
  `HOLOCUT_PROJECTS_DIR` and `ONECUT_PROJECTS_DIR` aliases plus old project
  directories continue to be discovered.
- No automatic project rewrite is required for this preview. Back up projects
  before testing pre-release builds.

### Known limits

- The Moirai Cut working brand is not cleared for public launch; see
  [`docs/NAME_CLEARANCE.md`](docs/NAME_CLEARANCE.md).
- Browser release qualification currently targets Chromium-family browsers.
- HDR preview is tone-mapped to SDR; the editor is not yet an end-to-end HDR
  grading environment.
- The GPUI desktop shell remains experimental.
