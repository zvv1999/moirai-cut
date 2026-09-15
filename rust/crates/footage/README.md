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

**存储设置 / 打开素材库** opens an independent library in either a mounted NAS
directory or a local folder. Empty directories create empty libraries. Existing
libraries load their own sources, shots, products, labels and tasks. Plain video
directories create a library and recursively import their videos as original footage,
with SHA-256 deduplication; hidden directories and symbolic links are skipped.
Original files remain untouched. Later additions still use upload or the manual
`inbox` import; no folder watcher or deletion propagation is introduced.

Each directory has a `.moirai-library/identity.json` identifier. Selected libraries
store SQLite and working files in `.moirai-library/data`, on a local filesystem
owned exclusively by one Rust service. NAS deployments run that service inside Docker
on a NAS-local volume; SMB/NFS database access is rejected. Clients connect to the
service, not the database. See `deploy/footage/README.md` for deployment and access.
Legacy data migrates through a staged whitelist snapshot with rebased paths; credentials
and other libraries are excluded. Offline directories fail closed instead of accepting
writes into a stale local copy. Machine-local `library-registry.json` and
`active-library.json` remember locations and the active library. Before switching,
running work finishes, remaining jobs pause, and a catalog/media checkpoint is saved
to the **old** directory's `.moirai-library` folder. New directories never receive
the old library's data. Reopening resumes that library's queue. If a cache is missing,
the directory checkpoint restores it; the latest live state remains in the selected data directory
until the next checkpoint. Keep the hidden folder when moving a library.

The legacy library is bound to its previously selected directory on first switch.
The target directory must be online and writable; an unavailable old directory does
not delete its local cache. NAS retains its per-library optional sync toggle, queue,
SMB checks and retries. Local-folder mode mirrors that library's `sources`, `shots`
and `metadata` directly after import/publication. Startup and **重试同步** repair
missed writes only for the active library. Endpoint credentials stay machine-local.
Switching uses version checks, refreshes the browser, and rejects writes carrying
another library's identifier. Neither server needs a restart when switching.

```sh
bun run dev:footage
bun run dev:web
```

Open `http://127.0.0.1:3000/footage` (or the port reported by Next). Both services intentionally support local access only. The native service generates a private token consumed by the Next adapter. This is not a multi-user authenticated deployment.

The model adapter reads the current Moirai Cut custom endpoint and credential reference, falling back to the configured custom provider in `~/.codex/config.toml`. It supports an OpenAI-compatible `/models` and `/chat/completions` endpoint, with `video_url` or `image_url` inputs. Default model: `glm-5.3-flash`. It does not copy credentials into the project, browser or analysis records. Jobs snapshot model/input settings and the endpoint fingerprint; endpoint changes require an explicit retry.

## Workflow

All video imports deduplicate within the active library by original-file SHA-256, including uploads
and NAS/local-folder inbox scans. Filename, product, batch and original/finished-shot
mode do not affect identity. Duplicate responses return `duplicate: true`, the existing
source/shot IDs and original name; the UI reports them as skipped, not newly imported.
The service checks before probing/copying and again in the insertion transaction to
handle concurrent imports. Temporary copies are removed and duplicates never enqueue
analysis or storage sync. Existing historical duplicates remain untouched. Re-encoded
or trimmed files have different bytes and are not treated as duplicates.

### Reference Products

The top **商品识别** section keeps a local catalog of up to 50 products. Each unique
alias has 1-6 JPG, PNG or WebP reference images (5 MB per uploaded image). The service
decodes and normalizes images to JPEG up to 1024 pixels before storing them in the
local database. Multiple views belong to the same identity; products can be edited
or deleted without changing existing shot labels.

New import jobs snapshot the reference catalog. After raw-shot selection or direct
upload labeling, a separate multimodal comparison inspects only the selected range
(the entire file for direct uploads). It compares up to four products per request,
accepts only known product IDs with evidence and confidence at least 0.85, and maps
those IDs to the saved aliases. Multiple confirmed products add multiple tags;
uncertain matches add none. Reference images are explicitly separated from footage
in the prompt. The model must support images together with video, or use frame mode.

**重新分析打标** beside the shot title snapshots the latest saved model, product
references and tag settings. It reruns the complete analysis, selecting one new
continuous range for raw footage or tagging the entire direct upload. Success
replaces all prior analysis and manual tags on the same shot ID and requires fresh
confirmation. Failure preserves prior content for retry.
Published release snapshots remain immutable. Failed jobs can be retried; editing,
publishing and duplicate recognition are blocked while recognition runs. Changing
shot boundaries or its processing recipe clears automatic product labels so they
cannot silently describe an earlier range. Historical shots are never reprocessed
just because a reference product changed.

### Upload Finished Shots

Use **上传分镜** for already edited clips. Multiple files are supported; each upload
immediately creates one full-duration shot in the shots tab. The independent `tag`
job generates only its name, description, tags, roles, evidence and usage restrictions.
Long clips use observation windows, merged into one set of labels without changing
the clip boundaries. Failed tagging is visible in the shots and jobs tabs and can be
retried; manual metadata review is also available after failure.

Shots move from `tagging` to `tag_review`, then human confirmation publishes the
original file without rendering, trimming, rotation, color adjustment or audio changes.
Publication verifies the original hash and decoding; previews and analysis proxies
are separate. MP4, MOV, M4V, WebM, MKV and AVI retain their extension and MIME type.
Playback in the editor still depends on the browser's support for the original codec.
The workbench uses one confirmation to save labels and publish; later label edits
use the same endpoint to save a new release. Time and recipe edits are rejected for direct uploads.
Original imports continue to use the cutting workflow below. Both paths use the
existing local release versions, editor lineage and optional NAS synchronization.

1. Drop videos anywhere in the workbench or select multiple files. Optional product/SKU applies to the batch.
2. Local upload is streamed, probed and hashed. Local preview preparation queues analysis immediately. Optional source sync runs independently and cannot block model analysis.
3. Each raw import produces exactly one continuous shot on successful analysis. The prompt selects one complete action or product-detail interval, removing preparation, defocus and idle footage without splitting action phases or joining separate intervals. Video analysis uses overlapping 30-second, fixed 720p proxies: portrait 720x1280, landscape/square 1280x720. Each window returns at most one internal candidate; when multiple windows propose candidates, a final model selection chooses one before any shot is saved. A response containing multiple shots is rejected. If no usable interval exists, analysis fails for manual selection rather than fabricating a shot. Manual creation is allowed only when the source has no shot. Existing historical multi-shot sources are retained. Aspect ratio is preserved with centered black padding; ffprobe verifies proxy dimensions. Suggested ranges are mapped to original frame timestamps, and invalid ranges fail validation.
4. Review ranges, description, role labels and recipe in live preview, then confirm labels once. `POST /shots/{id}/confirm` atomically saves the `ShotEdit` payload, records approval and queues rendering or publication. A render job carries durable automatic-publication intent and queues publication transactionally on success, without a second human confirmation. Re-encoding always uses the source, with rotation metadata applied once, optional static 9:16 crop and conservative exposure or manual adjustments.
5. Publication performs hash, decode and duration checks, then commits an immutable local master/poster/metadata snapshot under `dataDir/releases`. Later edits use the same confirmation endpoint to save new label results; metadata-only edits reuse valid output, while range/recipe edits render again automatically. Existing release snapshots remain immutable. The new release becomes available to the local editor. If NAS sync is enabled, the same transaction queues a durable `sync_release` job. That job copies/verifies the original, master and poster, then commits the identical versioned metadata last. A sync failure does not unpublish or invalidate the local release.

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
# Local AI Color Grading

Run `node scripts/footage/setup-lut.mjs` from the repository root to install the
isolated Python/PyTorch runtime and checksum-verified Image-Adaptive-3DLUT sRGB
weights under `~/.moirai-cut/`. Python 3.11+ and a supported PyTorch platform are
required. No user media leaves the machine. The pinned upstream commit is
`b491f6df64a588864739a157db271e5c848e1805` (HuiZeng/Image-Adaptive-3DLUT,
Apache-2.0; see `IMAGE-ADAPTIVE-3DLUT-LICENSE`). The classifier architecture is
adapted for inference without the upstream CUDA interpolation extension.

Rust samples three frames at 20%, 50%, and 80% of a shot and averages the model's
basis weights. The resulting fixed 33-cube LUT is cached by source content and
trim range. Preview and FFmpeg use the same values with trilinear interpolation.
Changing the range recalculates the LUT; crop/rotation do not. HDR input is
rejected pending an explicit SDR conversion. Missing dependencies or inference
failures are reported, never silently replaced by legacy exposure correction.

`adaptive` is the new default recipe mode. Unpublished legacy `auto` drafts are
migrated after active jobs finish. Published legacy videos remain unchanged;
metadata-only edits reuse them, while visual edits upgrade to `adaptive`.
