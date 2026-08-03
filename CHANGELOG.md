# Changelog

All notable Moirai Cut changes are documented here. The repository is in developer
preview and follows semantic versioning for public release artifacts; project
schema and Agent surfaces may still change with migration notes.

## 0.1.2 — 2026-08-03

Agent interoperability and motion-design update for the developer preview.

### Added

- Configurable Codex and Claude providers with local-account reuse, custom
  compatible endpoints and dynamically discovered model choices.
- A readable, continuously updating Agent process feed that preserves native
  Provider reasoning, tool activity, retries and completion states.
- The built-in `moirai-cut-motion-design` Skill for editable cinematic captions,
  chapter cards and MG keyframe animation with representative-frame quality checks.

### Changed

- Provider conversations now remain continuous after initialization instead of
  starting a new runtime session for every message.
- Agent setup, model switching and endpoint configuration use one shared local
  settings flow across Codex and Claude.
- System and privacy documentation now explains custom endpoints, local credential
  storage and the project context sent to an Agent.

### Fixed

- Prevented unfinished IME composition from being submitted when Enter is pressed.
- Improved cancellation, retry visibility and cleanup for Claude browser streams.
- Refreshed custom Codex hosts after configuration changes and reduced repeated MCP
  startup work on the interactive path.

### Compatibility and migration

- Existing local Codex and Claude logins continue to work without re-authentication.
- Existing projects require no schema migration for this release.

## 0.1.1 — 2026-08-03

Public-source hygiene patch for the developer preview.

### Changed

- Removed private acceptance ledgers, one-time launch checklists, project-specific
  audit notes and unfinished experience reports from the public source tree.
- Moved public planning to GitHub Issues and kept reproducible verification in
  GitHub Actions and release artifacts instead of committing generated reports.
- Aligned repository, Web, MCP and experimental desktop version metadata for the
  patch release.

### Fixed

- Removed a README link to an acceptance report that is intentionally excluded
  from public source snapshots.
- Replaced the internal name-search record with the stable public trademark and
  non-affiliation policy.

## 0.1.0 — 2026-08-02

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

- Moirai Cut is the public project name but has not completed professional
  trademark clearance for commercial distribution; see
  [`TRADEMARKS.md`](TRADEMARKS.md).
- Browser release qualification currently targets Chromium-family browsers.
- HDR preview is tone-mapped to SDR; the editor is not yet an end-to-end HDR
  grading environment.
- The GPUI desktop shell remains experimental.
