# Tool map and recovery

This reference keeps the main skill readable while preserving exact execution details.

## Context and project truth

| Goal                             | Tool                 | Required behavior                                      |
| -------------------------------- | -------------------- | ------------------------------------------------------ |
| Find the bound editor project    | `get_active_project` | Prefer the current project over guessing by name.      |
| Read the human's selection       | `read_agent_context` | Respect selected elements, media and timeline ranges.  |
| Resolve a missing active project | `list_projects`      | Ask only when more than one plausible project remains. |
| Read compact/full state          | `read_project`       | Record the latest revision before every write.         |
| Keep a recovery reference        | `list_revisions`     | Note the pre-edit revision in the final handoff.       |

## Media understanding

| Goal                          | Tool                                  | Required behavior                                          |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Refresh Agent JSON            | `build_media_catalog`                 | Preserve prior multimodal observations.                    |
| Reuse known facts             | `read_media_catalog`                  | Treat technical facts and source times as canonical.       |
| Discover source-video shots   | `inspect_media_scenes`                | Inspect only footage relevant to the requested cut.        |
| Understand an edited interval | `inspect_timeline_range`              | Read returned images as an ordered sequence.               |
| Persist observations          | `save_media_analysis`                 | Store source-time scenes, summary, tags and quality notes. |
| Find silence and sound events | `analyze_audio`                       | Convert source time to timeline time before editing.       |
| Obtain dialogue text          | `start_transcribe` + `get_transcribe` | Poll the job; never invent missing dialogue.               |

## Atomic edit contract

Use `edit_project` with:

- `projectId`: the current bound project.
- `baseRevision`: the revision returned by the immediately preceding `read_project`.
- `idempotencyKey`: a stable unique key such as `moirai-cut-create:<projectId>:<baseRevision>:<request-hash>`.
- `operations`: one ordered batch representing a coherent creative intent.

If the revision is stale, reread the project and recompute affected coordinates and IDs. If a retry follows a transport timeout, reuse the same `idempotencyKey`. If an operation is unsupported, keep the valid part out of the project until the whole intended batch can be expressed safely.

## Quality gate

| Gate                   | Tool                          | Pass evidence                                                                  |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Structural edit health | `lint_cut`                    | No unintentional overlap, gap, sliver, missing media or trim overflow.         |
| Shared state caught up | `wait_for_sync`               | Loaded editor revision equals the file revision.                               |
| Pixel-level review     | `render_frames`               | Returned revision matches the edited revision and sampled frames look correct. |
| Local review video     | `start_export` + `get_export` | Job completed, path exists, and `stable` is not false.                         |

Start with a `draft` MP4. A final high-quality encode is an additional delivery step, not a substitute for reviewing the editable timeline.

## Bounded fallback

- Editor unavailable: finish file-only analysis and edit, then report that sync/render/export needs the editor opened; give the user the exact recovery action.
- Decoder failure: retain the asset in the project, flag the exact asset ID and continue only where visual evidence is reliable.
- Transcription unavailable: preserve the original audio and omit generated captions rather than fabricating text.
- Export timeout: return the job ID and latest progress; do not claim a file was produced.
- Human changed the project during the run: stop the stale write, reread and reconcile with the new revision.
