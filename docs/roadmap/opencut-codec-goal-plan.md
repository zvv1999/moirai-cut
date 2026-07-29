# OpenCut Codec Goal Plan

Status: ACTIVE
Owner: Codex goal `019fa427-c03a-7dd2-850c-0e25523c914f`
Branch: `feat/agent-drivable`
Started: 2026-07-29
Target report: `docs/reports/opencut-codec-goal/index.html`

## Objective

Bring OpenCut's everyday codec, proxy, preview, and delivery workflow to the
reliability expected from Jianying/CapCut Desktop while preserving OpenCut's
local-first and agent-drivable architecture.

The goal is complete only when every row is `DONE`, `SUPERSEDED`, or an
explicitly user-approved `WONTDO`. A UI control or TypeScript type without a
working media pipeline does not count as implementation.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `TODO` | Not started |
| `RED` | Executable failing test or benchmark committed |
| `BUILDING` | Implementation in progress |
| `GREEN` | Targeted automated tests pass |
| `VERIFYING` | Real-media, browser, quality, or performance checks are running |
| `DONE` | All applicable gates and evidence passed |
| `BLOCKED` | Requires an external-state change or user decision |

## Definition of done

Every capability must satisfy the applicable gates:

1. The user journey and failure modes are represented by executable tests.
2. A valid RED test or reproducer is committed before production code.
3. New logic has at least 80% line and branch coverage.
4. Targeted tests, TypeScript, targeted lint, and the production build pass.
5. Generated files are checked with FFprobe; video outputs are decoded again.
6. Quality-sensitive transforms are measured with SSIM/PSNR and visual samples.
7. Performance-sensitive paths record cold and warm timing evidence.
8. Human UI and Agent APIs expose the same job state and validation semantics.
9. A real project is exercised in the in-app browser with no new console error.
10. The HTML report links commits, commands, metrics, and screenshots.

## Qualification media

### Real project set

Project `16ce7945-b32f-4b36-93c1-21cbeed5296e` supplies six HEVC clips:

| Class | Count | Resolution | Profile |
| --- | ---: | --- | --- |
| HEVC Main 10 | 2 | 1920×1080 | 10-bit 4:2:0 |
| HEVC Main | 3 | 720×1280 or 544×960 | 8-bit 4:2:0 |
| HEVC Main | 1 | 720×960 | 8-bit 4:2:0 |

These files remain external test inputs and are never copied into Git.

### Generated deterministic set

Small synthetic fixtures must cover:

- H.264 8-bit CFR with AAC;
- HEVC Main 8-bit and Main 10 with AAC;
- VP9/Opus and AV1/Opus;
- MOV H.264 and MOV HEVC;
- variable-frame-rate H.264 with an audio sync marker;
- PCM WAV, AAC/M4A, MP3, FLAC, Opus/Ogg;
- rotation metadata, silent video, audio-only, video-only, and a corrupt input.

Fixture generation must be scripted from FFmpeg filters so tests do not rely on
undocumented binary blobs.

## Quality and performance budgets

Budgets are measured on the current Apple Silicon development machine. Results
must record the machine, FFmpeg version, browser build, input, and sample count.

| Metric | Required threshold |
| --- | --- |
| Media probe, warm P95 | ≤ 300 ms for a local 1080p clip |
| Proxy throughput | ≥ 0.75× realtime for 1080p HEVC → 960-long-edge H.264 |
| Proxy random seek, warm P95 | ≤ 500 ms |
| Proxy first visible frame, warm | ≤ 500 ms |
| 1080p proxy playback | < 1% dropped/superseded preview frames over 30 s |
| A/V sync | ≤ 1 project frame after a 60 s VFR round trip |
| H.264 proxy quality | SSIM ≥ 0.95 and PSNR ≥ 35 dB against the scaled reference |
| H.264/HEVC master export | SSIM ≥ 0.98 and PSNR ≥ 40 dB for the codec fixture |
| Export metadata | Expected container, codec, dimensions, FPS, audio, and colour tags |
| Cancellation | Worker exits and temporary file is removed within 2 s |
| Cache hit | Re-probing unchanged media performs no FFprobe child process |

If a threshold is inappropriate for a specific pathological fixture, the report
must preserve the raw measurement and explain the exception rather than silently
lowering the global budget.

## Delivery milestones

| Milestone | Exit condition | Status |
| --- | --- | --- |
| M0 Baseline | Plan, fixtures, benchmark harness, and current measurements exist | `BUILDING` |
| M1 Probe and compatibility | C01-C04 are done | `TODO` |
| M2 Native jobs and proxies | P01-P07 are done | `TODO` |
| M3 Preview and timing | V01-V06 are done | `TODO` |
| M4 Export | E01-E07 are done | `TODO` |
| M5 Colour pipeline | H01-H05 are done | `TODO` |
| M6 Agent parity | G01-G06 are done | `TODO` |
| M7 Qualification | Q01-Q06 are done | `TODO` |

## Codec inspection and compatibility

| ID | Capability | Acceptance conditions | Status |
| --- | --- | --- | --- |
| C01 | FFprobe metadata | Container, streams, codec/profile, pixel format, bit depth, dimensions, SAR/DAR, rotation, rate mode, duration, audio layout, and colour tags are normalized | `TODO` |
| C02 | Capability decision | Each asset reports `direct`, `proxy-recommended`, `proxy-required`, `audio-only`, or `unsupported` with stable reason codes | `TODO` |
| C03 | Cache and invalidation | Probe results key on source size/mtime/hash and invalidate after relink or replacement | `TODO` |
| C04 | Human diagnostics | Media details show source facts, browser decode result, active playback source, and actionable errors in Chinese | `TODO` |

## Native jobs and proxy workflow

| ID | Capability | Acceptance conditions | Status |
| --- | --- | --- | --- |
| P01 | Safe FFmpeg runner | Uses argument arrays, scoped project paths, bounded logs, timeout, cancellation, atomic rename, and temporary cleanup | `TODO` |
| P02 | Persistent job model | Probe/transcode/proxy jobs expose queued/running/succeeded/failed/cancelled, progress, retry, history, and restart recovery | `TODO` |
| P03 | Automatic proxy | Unsupported or expensive sources generate H.264/AAC MP4 proxies without browser decoding the original | `TODO` |
| P04 | Proxy profiles | Draft, standard, and high profiles are explicit; default is 960-long-edge, source FPS capped at 30, fast-start MP4 | `TODO` |
| P05 | Proxy lifecycle | Enable, disable, refresh, cancel, retry, remove, and batch rebuild preserve the original and timeline references | `TODO` |
| P06 | Proxy cache | Identical source/profile pairs reuse a verified proxy and never duplicate work | `TODO` |
| P07 | Background experience | Editing remains usable; progress survives panel navigation and failures explain the next action | `TODO` |

## Preview, seeking, and timing

| ID | Capability | Acceptance conditions | Status |
| --- | --- | --- | --- |
| V01 | Decoder prewarm | The next video source is initialized before the playhead crosses the cut | `TODO` |
| V02 | Continuous playback | Every qualification clip advances frames through cuts without stale-frame or black-frame residue | `TODO` |
| V03 | Random seeking | Paused seeks update the intended frame; stale async decodes cannot overwrite newer seeks | `TODO` |
| V04 | VFR normalization | Source timestamps, trims, retime, audio, and exported CFR/VFR policy remain explicit and frame-accurate | `TODO` |
| V05 | A/V synchronization | Source audio and picture remain within one project frame through preview and export | `TODO` |
| V06 | Resource control | Decoder pools, frame caches, and object URLs have bounded memory and deterministic disposal | `TODO` |

## Export and delivery

| ID | Capability | Acceptance conditions | Status |
| --- | --- | --- | --- |
| E01 | H.264 MP4 | H.264/AAC MP4 exports through native FFmpeg and browser fallback with verified metadata | `TODO` |
| E02 | HEVC MP4/MOV | 8-bit and 10-bit HEVC delivery is available when the selected encoder supports it | `TODO` |
| E03 | MOV delivery | H.264/HEVC with AAC or PCM uses correct QuickTime tags and fast-start policy where applicable | `TODO` |
| E04 | WebM delivery | VP9/AV1 with Opus remains available and is decoded after export | `TODO` |
| E05 | Audio-only delivery | WAV/PCM, M4A/AAC, MP3, FLAC, and Ogg/Opus outputs are selectable and verified | `TODO` |
| E06 | Hardware strategy | The UI reports chosen encoder, hardware/software fallback, incompatibility, and actual completion path | `TODO` |
| E07 | Export validation | Every output is FFprobed, duration-checked, decoded, and retained in export history with reproducible settings | `TODO` |

## Colour and bit depth

| ID | Capability | Acceptance conditions | Status |
| --- | --- | --- | --- |
| H01 | Colour inspection | Primaries, transfer, matrix, range, chroma location, bit depth, and HDR metadata are visible | `TODO` |
| H02 | Working-space policy | SDR rendering explicitly uses a documented linear/sRGB or Rec.709 path rather than accidental browser defaults | `TODO` |
| H03 | HDR-to-SDR preview | HLG/PQ input receives deterministic tone mapping for the SDR canvas | `TODO` |
| H04 | 10-bit delivery | HEVC Main 10 export retains a 10-bit pixel format and correct colour metadata | `TODO` |
| H05 | Visual qualification | SDR, P3, HLG, and PQ fixtures have reference frames and measured/visual comparisons | `TODO` |

## Agent-native codec operations

| ID | Capability | Acceptance conditions | Status |
| --- | --- | --- | --- |
| G01 | `media.probe` | Returns normalized metadata and compatibility without changing project state | `TODO` |
| G02 | `media.ensureProxy` | Idempotently starts or reuses a proxy job for one asset/profile | `TODO` |
| G03 | `media.rebuildProxies` | Plans and starts bounded batch work with per-asset results | `TODO` |
| G04 | `media.setProxyEnabled` | Uses the same media update command/storage path as the human UI | `TODO` |
| G05 | `media.transcode` | Accepts a validated preset, returns a job, and cannot escape the project | `TODO` |
| G06 | Job/export inspection | Agent can list, inspect, cancel, retry, validate, and report jobs and outputs | `TODO` |

## Final qualification

| ID | Capability | Acceptance conditions | Status |
| --- | --- | --- | --- |
| Q01 | Automated regression | Unit/integration/E2E goal tests pass with no skipped codec tests | `TODO` |
| Q02 | Real-media browser pass | Current HEVC project passes playback, seek, proxy toggle, and export journeys | `TODO` |
| Q03 | Quality report | SSIM/PSNR, metadata, reference frames, and exceptions are recorded | `TODO` |
| Q04 | Performance report | Cold/warm probe, proxy, seek, playback, export, cache, and cancellation metrics are recorded | `TODO` |
| Q05 | Security and resilience | Path traversal, argument injection, corrupt input, timeout, disk error, cancellation, and restart tests pass | `TODO` |
| Q06 | HTML delivery | Report contains status, commits, commands, tables, screenshots, output links, and reproducible verification instructions | `TODO` |

## Progress protocol

After every GREEN checkpoint:

1. update this plan's row and milestone status;
2. record RED and GREEN commits plus exact test commands;
3. capture browser or media evidence when meaningful;
4. update the HTML report data;
5. update the Codex goal plan;
6. continue to the next unfinished row without declaring the goal complete.
