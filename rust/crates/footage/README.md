# Product Footage Workbench

Local Rust service for Moirai Cut's `/footage` workbench. The web route is a streaming transport adapter; media decisions, persistence, review transitions, model calls and NAS publication run in this crate.

## Run

Requires Rust 1.93.1, Bun, FFmpeg and ffprobe (native binaries for the host CPU). Install web dependencies with `bun install --frozen-lockfile`.

Run `bun run setup:local` from the repository root. First setup asks whether to configure
NAS and an LLM endpoint, checks FFmpeg/ffprobe, builds the Rust service, and starts both
services. Existing configuration is reused. Use `bun run setup:footage` to reconfigure
and restart the native service afterward. For unattended local setup explicitly pass
`--local`; this preserves existing settings. Credentials are entered with terminal echo
disabled and stored in `~/.moirai-cut/footage-endpoint.json` with mode 0600. This endpoint
takes priority over the existing Agent endpoint fallback and does not modify Agent settings.
Skipping LLM configuration allows local import and manual review, but automatic analysis
requires a compatible endpoint. Choose the model in the workbench after startup.

For manual setup, create `~/.moirai-cut/footage-runtime.json`, or set `MOIRAI_FOOTAGE_CONFIG` to another configuration file (both services must receive it):

```json
{
  "dataDir": "/absolute/local/path/footage",
  "nasRoot": "/absolute/mounted/nas/home/moirai-library",
  "requireSmb": true,
  "ffmpeg": "/absolute/path/ffmpeg",
  "ffprobe": "/absolute/path/ffprobe",
  "port": 4318
}
```

NAS is optional: omit `nasRoot` and `requireSmb` for a standalone local library. The default `settings/storage.syncToNas` is false. Upload, analysis, review, local publication and editor imports work without a mount. For team sync, configure `nasRoot` with `requireSmb: true`, then enable the workbench's NAS sync checkbox. Do not place `dataDir` or SQLite on SMB.

```sh
bun run dev:footage
bun run dev:web
```

Open `http://127.0.0.1:3000/footage` (or the port reported by Next). Both services intentionally support local access only. The native service generates a private token consumed by the Next adapter. This is not a multi-user authenticated deployment.

The model adapter reads the current Moirai Cut custom endpoint and credential reference, falling back to the configured custom provider in `~/.codex/config.toml`. It supports an OpenAI-compatible `/models` and `/chat/completions` endpoint, with `video_url` or `image_url` inputs. Default model: `glm-5.3-flash`. It does not copy credentials into the project, browser or analysis records. Jobs snapshot model/input settings and the endpoint fingerprint; endpoint changes require an explicit retry.

## Workflow

1. Drop videos anywhere in the workbench or select multiple files. Optional product/SKU applies to the batch.
2. Local upload is streamed, probed and hashed. Local preview preparation queues analysis immediately. Optional source sync runs independently and cannot block model analysis.
3. Video analysis uses overlapping 30-second, fixed 720p proxies: portrait 720x1280, landscape/square 1280x720. Aspect ratio is preserved with centered black padding; smaller sources are resized to this fixed analysis canvas. ffprobe verifies dimensions and square pixels before any video is sent. The input manifest records the profile and dimensions. Suggested ranges are mapped to original frame timestamps, and invalid model proposals fail validation. The model may return no usable shots; manual shots are available after analysis.
4. Review ranges, description, role labels and recipe, then submit rendering. Re-encoding always uses the source, with rotation metadata applied once, optional static 9:16 crop and conservative exposure or manual adjustments.
5. Review the actual rendered video and labels. Publication requires current-version approval and decode/duration checks, then commits an immutable local master/poster/metadata snapshot under `dataDir/releases`. It immediately becomes available to the local editor. If NAS sync is enabled, the same transaction queues a durable `sync_release` job. That job copies/verifies the original, master and poster, then commits the identical versioned metadata last. A sync failure does not unpublish or invalidate the local release.

SQLite WAL holds sources, shots, settings, durable jobs and audit records. A process lock prevents competing service instances. Four bounded lanes run rendering, local preparation/publication, model analysis and optional NAS sync independently. Interrupted jobs resume after service restart; failed sync jobs can be retried from the task list. Disabling sync pauses new NAS jobs; an already running job finishes. Re-enabling sync enqueues missing source/release tasks, including releases created while using local mode. Sync always uses the immutable publication manifest, never the latest edited shot. Files remain local after syncing; there is no automatic local deletion. Mutations use revision checks; unchanged rendered results are reused, while recipe/range edits invalidate them.

The source `inbox` scan accepts completed MP4/MOV/M4V/MKV/AVI/WebM files directly under that directory. Finish copying files before scanning. File content is checked again after the local copy.

## Current Limits

- Local service with bounded worker lanes, no multi-user permissions or distributed workers. Approximately 100 files/day is a workflow target, not a measured throughput guarantee; durations and model latency determine capacity. Rendering uses x264 veryfast at CRF 18; this trades somewhat larger output for lower CPU latency while retaining decode/duration checks.
- Search uses product, name, description, tags, status and role. Published releases can be imported from the editor's product library and inserted with its normal source monitor. Embedding-based script matching is not yet implemented.
- Automatic color adjustment only makes small, measured corrections for extreme average exposure. White-balance matching, product reference calibration and Log/HDR transforms need a later color pipeline. HDR rendering is blocked instead of applying an unknown conversion.
- Video analysis proxies omit audio and use 4 fps. Native video ingestion by the model does not guarantee frame-level temporal understanding; action completeness is manually reviewed. No ASR, automated claim verification or dynamic subject tracking is enabled.
- Original/processed files and publication metadata are stored locally, with optional NAS synchronization; automatic database backup, retention, garbage collection and resumable chunk uploads are not yet implemented. Interrupted uploads can be resubmitted; persisted processing jobs are recoverable.
- Local model output logs and proxies remain under `dataDir/analysis` for diagnosis. No production samples are bundled.

## Editor Lineage

Enable `NEXT_PUBLIC_OPENCUT_PROJECT_FILES=1` in the web deployment. Both processes must use the same `OPENCUT_PROJECTS_DIR` (default `~/OpenCutProjects`). Browser-private IndexedDB projects are not visible to the native reverse lookup; existing browser projects require migration/export before switching deployments.

The editor's media toolbar has a product library button. It lists current published releases only. Import reads a release manifest, verifies the media SHA-256, and saves a project-local media copy with `footage: moirai.lineage.v1` in `media/index.json`. The snapshot includes release ID, shot ID/revision, original ID/hash and source range in 120000 ticks/second, analysis run/model, recipe, output hash, tags, roles and restrictions. It survives saves/reloads and is forwarded to Agent context and `build_media_catalog`. Later library edits never update project media implicitly.

`GET /releases`, `/releases/{publicationId}`, `/media/release/{publicationId}/master` expose the versioned handoff. `/lineage/{shotId}` returns revision snapshots, review references, release history and current project/media/scene/track/element uses, read from the configured project files. Timeline trims and retime settings remain in their native representation; the original offset is carried separately, so processed clip time is not mistaken for original time. Deleting a timeline element or project removes it from the next reverse lookup. The lookup reports unreadable projects rather than silently treating them as unused.

Shot revision snapshots are retained from this change onward, with the previous current version backfilled when an older record is next edited. Earlier unsaved revisions cannot be reconstructed. NAS release manifests remain immutable; withdrawn releases remain available to existing references, but new imports require the current published version.

Run `PLAYWRIGHT_MODULE=<playwright module> bun scripts/footage/verify-lineage.mjs` after at least one local clip is rendered. It uses a temporary publication fixture, creates and deletes only its own test project, and checks editor import, reload, Agent metadata, timeline links and version pinning. It does not publish live review candidates. The web server must be using file storage, with port 4319 free for the isolated service.

## Checks

```sh
cargo test -p moirai-footage
bun run typecheck:web
```

`scripts/footage/verify.mjs` exercises browser drag-and-drop, an actual configured video model, NAS checksums, review, rendering, pixel checks, desktop/mobile screenshots, revision conflicts and publication against a separately launched QA service. Set `FOOTAGE_QA_CONFIG`, `FOOTAGE_QA_VIDEO`, `PLAYWRIGHT_MODULE` and optionally `CHROME_PATH`; its NAS path must contain `verification` to prevent publishing test clips into the live library. Test snapshots are written to ignored `artifacts/footage/`.
