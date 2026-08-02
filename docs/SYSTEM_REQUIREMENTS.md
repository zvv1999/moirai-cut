# System requirements and media support

Moirai Cut is a developer preview. This document distinguishes release-qualified
paths from formats that depend on the browser, operating system or local FFmpeg
build. “Supported” means covered by the repository's automated checks; it does
not mean every codec profile is available on every device.

## Release-qualified environment

| Area | Minimum | Recommended |
| --- | --- | --- |
| Operating system | Current macOS, Windows 11, or a current 64-bit Linux distribution | Latest stable OS updates |
| Browser | Current Chromium-family browser with WebCodecs and WebGL enabled | Latest Chrome or Chromium |
| Runtime | Bun 1.3.14; Node.js 20.9 for compatible tooling | Repository-pinned Bun version |
| Native media tools | FFmpeg and FFprobe available on `PATH` | Current stable FFmpeg build with common codecs |
| Memory | 8 GB for short 1080p projects | 16 GB or more for 4K, proxies, or Agent vision |
| Storage | Project media plus export size | At least 2x source-media size for proxies and exports |

Safari and Firefox may edit parts of a project, but they are not release-
qualified preview/export targets yet. The GPUI desktop shell is experimental;
the browser editor is the supported product surface.

## Import, preview and proxy behavior

Moirai Cut can catalog common containers including MP4, MOV, WebM and MKV; audio
including M4A, MP3, WAV, OGG and AAC; and PNG, JPEG, GIF, WebP and SVG images.
Container recognition is not the same as decode support: the actual video and
audio codecs inside a container still have to be decoded.

| Input condition | Preview path | Quality behavior |
| --- | --- | --- |
| Browser-decodable SDR media | Direct browser decode | Uses original media for preview |
| Unsupported browser codec with local FFmpeg | FFmpeg proxy | Preview uses a compatible proxy; final delivery reads the original |
| 10-bit, HDR, 1440p+, >30 fps, or high-bitrate source | Proxy recommended | Prioritizes responsive editing without replacing the source |
| Unsupported codec without FFmpeg | Blocked with remediation | Install FFmpeg or transcode before import |

The working canvas is currently SDR/sRGB. HDR sources are tone-mapped for the
preview proxy. A 10-bit HEVC delivery can bypass that proxy and read the source,
but Moirai Cut does not yet provide an end-to-end HDR grading monitor or a fully
color-managed HDR timeline. See [the color-pipeline design](architecture/color-pipeline.md).

## Export support

| Export path | Containers and codecs | Notes |
| --- | --- | --- |
| Browser/WebCodecs | MP4 with AVC/H.264 + AAC; WebM with VP9 or AV1 + Opus when the browser exposes them | Hardware acceleration is requested when available, never assumed |
| Local FFmpeg delivery | H.264 or HEVC MP4/MOV, HEVC 10-bit MOV, VP9 or AV1 WebM, WAV PCM24, AAC/M4A, MP3, FLAC and OGG/Opus | Current delivery presets use software encoders for deterministic output |

Codec availability, licensing and hardware acceleration differ by OS, browser,
GPU driver and FFmpeg build. Moirai Cut probes capabilities at runtime and should
show a remediation rather than silently reducing quality.

## Agent and MCP requirements

- Browser smart editing can reuse a locally authenticated Codex or Claude CLI,
  or use an operator-configured API provider.
- Agent App control requires the Moirai Cut MCP process and access to the selected
  project directory.
- Multimodal editing may send sampled frames to the selected external provider
  only after the user accepts the first-run disclosure.
- Shared Codex tasks use the loopback WebSocket host at
  `ws://127.0.0.1:48721` by default. Do not expose it to an untrusted network.

## Optional hosted services

The editor, clean production build and local MCP workflow do not require a
database, authentication secret, Redis, Marble or Freesound credential.
Account features validate `DATABASE_URL`, `BETTER_AUTH_SECRET` and the complete
Upstash Redis pair when first used. Freesound search returns a configuration
message until `FREESOUND_API_KEY` is set. Marble performs no request unless an
operator explicitly supplies `MARBLE_WORKSPACE_KEY`.

When Redis is absent, public API routes use a process-local 100 requests/minute
limiter. That fallback is intended for local, single-process use only. Public or
multi-instance deployments must configure Redis so rate limits are shared.

## Known limits

- Performance depends on timeline length, source decode complexity, browser
  memory limits and GPU drivers; no frame-accurate real-time guarantee is made
  for every 4K or 8K project.
- Hardware encoding is capability-driven and may fall back to software.
- Cross-platform release qualification is performed in CI; contributors should
  report the OS, browser, codec profile and FFmpeg version with media bugs.
