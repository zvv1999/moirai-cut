# Changelog

All notable Moirai Cut changes are documented here. The repository is in developer
preview and follows semantic versioning for public release artifacts; project
schema and Agent surfaces may still change with migration notes.

## 0.4.0 — 2026-08-14

Open-timeline handoff update for the public preview.

### Added

- A Rust-owned FCPXML 1.10 adapter that preserves supported timeline structure
  and emits a structured compatibility, omission and media-relink report.
- A revision-bound Web export panel and HTTP API, plus an MCP
  `export_fcpxml` tool that reuses the same Rust conversion path.
- A packaged `moirai-interchange` CLI in the production container and an Ubuntu
  HTTP smoke test that generates and downloads both handoff artifacts.

### Changed

- FCPXML publication now uses content-fingerprinted immutable names and, when a
  scene is explicitly selected, a scene identity suffix; identical retries are
  idempotent and changed output never overwrites an older XML/report pair.
- Project saves, deletes and interchange exports share the same per-project
  single-process lock, with revision revalidation immediately before publishing.
- Release metadata, the MCP handshake, public docs and tag verification are now
  locked to and automatically checked against `0.4.0`.

### Fixed

- Preserved Moirai's overlay z-order when mapping visible layers to FCPXML lanes.
- Removed false loss warnings for built-in default parameters and added explicit
  reporting for muted audio and omitted group/link relationships.
- Stopped inventing audio channel and sample-rate metadata that the media index
  does not know.
- Rejected compound clips and transitions instead of producing a successful but
  content-changing handoff; split compounds and remove transitions before export.
- Rejected invalid XML 1.0 characters, malformed native-runtime envelopes, stale
  saves and damaged project JSON with stable error codes.
- Wrapped projects in the standard FCPXML `library` hierarchy required by the
  locally verified Jianying 11.1.0 importer, and excluded hidden content from
  timing, media relinking, audio/solo semantics and sequence-length calculation.
- Made the timeline snapping switch consistent for playhead scrubbing, clip moves
  and trims; clip edits now snap to bookmarks, constrained edits clear stale snap
  guides, and drag previews reflect the timing that will actually be committed.

### Compatibility and migration

- Existing Moirai Cut project documents require no schema migration.
- This is a one-way FCPXML handoff, not a Jianying/CapCut private draft and not a
  lossless round trip. Text, effects, masks, animation, retime and other unsupported
  semantics remain listed in the sidecar report.
- A macOS Jianying 11.1.0 short-project import verified the main cuts and gap,
  overlay order, independent audio and media relinking; other versions remain a
  version-specific compatibility target rather than a blanket support promise.
- The export service requires a local or single-machine server with project-file
  access and the native interchange runtime; pure browser and serverless targets
  cannot run it.

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
