# Production text measurement evidence v1

The normal SceneExporter collects text layout facts after each rendered frame resolves. This does not alter text fitting, rendering, export quality, or aesthetic scoring. Export jobs expose `textMeasurements`; the production worker forwards it through the existing render-update lifecycle. The final output byte SHA-256 is calculated by the export job and independently checked by native publication against the actual preview file.

## Contract

`version: 1`, `status: sampled`, `producer: production-scene-exporter`, `timebase: 120000`, `framesObserved`, `droppedRecords`, `records`, and (at the export-job boundary) `outputSha256`.

Each record retains `source` (track, element, group path, scene-time offset and optional template identity), first `sceneTime`/`localTime`, `textBox`/`transform`/`groups`, and `layout`. Layout contains actual fitted local `fontSizePx`, declared `fontString`, actual `lines`/`lineCount`, text-block width/height, declared positive width/height/line limits, and the corresponding overflow booleans. Optional `secondary` preserves bilingual secondary layout facts. The primary block dimensions may include the combined bilingual block. `fontIdentityVerified` is always false: Canvas font strings cannot prove which fallback glyph font was used.

New exports explicitly declare `geometryCoverage: "constant_record_pose_v1"` while retaining the source-identity contract `version: 1`. Only identical layout, text box, leaf transform and complete ancestor group descriptors of the same source on consecutive observed frames are compressed into one record with `lastSceneTime`, `lastLocalTime`, and `sampleCount`. A disappearance, layout change or pose change starts another record. All exported observations covered by one marked record therefore have exactly the same measured pose; dropped records break the consecutive run and cannot extend a prior record.

Historical version-1 evidence without this marker merged by layout only: its transforms and text boxes describe the first observation, not the full interval. Transport must preserve the missing marker rather than upgrade historical evidence. Such evidence cannot substantiate stable-interval scale, boundary geometry or a reading-replica exemption; re-export is required for the stronger geometry contract. Time values are scene/local ticks, not output seconds. Font sizes and dimensions are in local untransformed canvas pixels; ancestor and element scales must be considered for display-size review.

Records are bounded at 2048 and 524288 retained JSON characters (before the three aggregation fields); oversized layouts/source identifiers or deeply nested groups are omitted. `droppedRecords > 0` explicitly indicates incomplete evidence. Even with zero omissions, evidence covers exported frames and range, not arbitrary unsampled instants. Overflow is text-block versus text-region constraints (0.01 px numerical tolerance); it does not certify canvas safe margins, stroke/shadow clipping, occlusion, or perceptual readability. Opacity/entrance/exit reading budgets remain separate checks.

## Identity and provenance

The worker writes the native production fixture's saved compilation document on first application, preserving source IDs. The compiler is still called to validate resumed instance receipts. Recompiling and writing newly allocated random IDs would detach observations from the stored fixture graph and is not used.

Native validation binds the attachment to the production item/fixture fingerprint, compiled source identity, and final preview hash. `producer` is a reported origin, not authentication or independent proof that a browser executed the measurement. A caller who controls the local render-update API can report data; structural consistency and file hashing do not turn that into independent attestation. Evidence is renderer-reported and validated, never an automatic aesthetic acceptance or substitute for human listening.

Legacy exports with no attachment remain unmeasured. Existing files are not retroactively assigned synthetic font sizes/line counts. New measurements require a normal export. No alternate browser probe, CDP measurement bypass, or hidden preview page is introduced.

## Native persistence and validation

Completed `RenderUpdate` requests may include `textMeasurements`. Running/failed updates cannot attach measurements. Rust validates the stored fixture fingerprint, the complete text source identity (including nested group path, track, element and optional template identities), ancestor child-clock offsets, first/last active frame and local time, consecutive sample counts, finite bounded metrics, exact declared region limits, line-count consistency and overflow calculations. The full-export frame count and frame grid use the saved compilation's FPS. A later update still uses the existing production-item revision check; a rejected attachment leaves the row unchanged.

The attachment is initially saved in `renders[fixture].textMeasurements`. Publication reads the actual MP4 SHA-256 and rejects an attachment reporting a different `outputSha256`; the validated attachment is copied to `previews[].textMeasurements` beside the actual file hash. The producer string and font declaration remain unverified assertions. These checks neither remeasure text nor derive a quality score, and an empty record list alone is not a proof that all expected text was measured.

Absent attachments are represented as `{status: "not_measured"}`. For legacy records, the read endpoints add this state only to returned preview/render projections; they do not mutate stored rows, old publication hashes or revisions. Re-exporting is required to obtain new facts. `status: "sampled"` with empty records is distinct from `not_measured`; `droppedRecords` must be considered whenever using the record set.

New native fixtures carry `textMeasurementContractVersion: 1`. The worker forwards measurement attachments only for this version. Legacy resumed projects may contain compiler-generated identities different from the stored fixture, so they retain `not_measured` even when a newer renderer produces observations. Their documents are not replaced to manufacture matching evidence.

Newly compiled production fixtures record native `textMeasurementContractVersion: 1`. Only those fixtures pin the saved compilation IDs for measurement attachments. The worker resumes older unmarked fixtures using their existing project and normal export path, logs `legacy/not_measured`, and omits the attachment. Rust also rejects any measurement attachment on unmarked or unsupported-version fixtures, so this compatibility rule does not rely solely on the worker. Reads never add the marker to historical fixture data. The marker itself does not imply measurement: marked fixtures exported by an older client without an attachment still remain `not_measured`.

## Live integration evidence (2026-10-08)

Four fresh preview-only exports reused the exact prior caption/bulb manifests except new `measurement-v1` idempotency keys. All four published and passed independent file-hash, source identity, group clock, original-word timing, zero-drop and full-decode checks: Deborah 210 frames / 4 text elements; Alex 420 / 5; Chinese 370 / 4; nested bulb Liz square 540 / 1. Fourteen text elements were covered with no text-region overflow. Evidence: `/Users/zhengwei/Downloads/caption-generalization-20261007/measurement-v1/checks.json`. These are technical measurement checks; listening, stable-reading budgets and aesthetic acceptance remain separate and were not marked passed.

## Live discovery deployment (2026-10-08)

The running service exposes `productionRenderUpdate`, `productionTextMeasurements`, and `capabilities.production.textMeasurements` on `/templates/schema`. The schema HTTP test and seven measurement tests pass. Live readback of the existing compact learning batch remains `not_measured`, confirming that schema discovery does not retrofit legacy evidence. Snapshot: `/Users/zhengwei/Downloads/caption-generalization-20261007/measurement-v1/schema-live-20261008.json`.

## Workbench evidence display (2026-10-08)

Production previews and expanded application-review media now expose the same read-only text measurements. The panel distinguishes `not_measured` from `sampled` with zero records, reports incomplete records, and lists the measured lines, local font size, scene-time sample range and configured overflow limits in pages of 20. A zero region limit is displayed as not configured, rather than a passed boundary check. The panel does not calculate quality scores, stable-reading duration, font fallback identity or display-size recommendations.

Review details fetch evidence only while expanded. Batch/item/fixture/SHA form the request identity; the returned preview must match the fixture and SHA, and its measurement attachment must match that output SHA. Changed identities suppress stale responses, unmount aborts requests, and failures expose a retry control. Production batch switching hides a prior batch immediately; new preview hashes remount the associated player. Nested measurement disclosure events cannot collapse the outer review player.

Web type checking passed before the identity review; focused display/review tests passed 7 cases and 29 assertions after the fixes. These are code/rendering-contract checks, not browser-click or perceptual playback verification. Browser interaction remains unverified in this run because the existing browser URL-policy restriction was not bypassed.

## Constant-pose native diagnostic guard (2026-10-08)

New production fixtures also pin `textMeasurementGeometryCoverage: "constant_record_pose_v1"`. Native validation rejects missing/unsupported geometry markers on attachments to those fixtures. Older fixtures remain readable without adding this field retroactively. Missing attachments remain `not_measured`; a new fixture marker by itself is not evidence.

The reading diagnostic accepts historical identity-v1 attachments on historical fixtures, but unmarked record poses are first observations only. Such records cannot certify interval minimum font size or grant replica dwell exemption; geometry/timing remain partial unless a definite observed layout failure establishes failed. Their sampled boundary status is unverified unless an observed first pose establishes warning.

For marked evidence, every stable frame must be covered; replica geometry requires every active exported frame to be covered. Any nonzero `droppedRecords` keeps geometry/timing partial and disallows replica exemption, even if aggregate frame counts appear complete. Producer declarations and source/time/SHA validation are not independent pixel verification. Native `geometryEvidence.partialReasons` and per-instance `partialReasons` make these limitations available to the editor and AI callers.
