import { mock } from "bun:test";

/**
 * `opencut-wasm` ships wasm-bindgen output that expects a browser/bundler host:
 * importing it under Bun's test runner dies on `wasm.__wbindgen_start is not a
 * function`, which takes down every test file that transitively imports
 * `@/wasm` — i.e. most of the meaningful suite.
 *
 * This preload substitutes a JS module so those files can be imported at all.
 * Two rules keep the stub honest:
 *
 *   1. Only functions whose semantics are directly verifiable against
 *      `rust/crates/time/src/media_time.rs` are implemented — pure integer-tick
 *      arithmetic, transcribed one-to-one.
 *   2. Everything else THROWS on call. A stub that quietly returned a
 *      plausible-but-wrong number would make tests assert against fiction, which
 *      is strictly worse than an unavailable import. Frame-rate maths (NTSC
 *      rounding), snapping, group geometry, GPU and compositor entry points all
 *      fall in this bucket.
 *
 * The real wasm is still what ships; this is test-host scaffolding only.
 */

/** media_time.rs:10 — `pub const TICKS_PER_SECOND: i64 = 120_000;` */
const TICKS = 120_000;

const notStubbed =
  (name: string) =>
  (): never => {
    throw new Error(
      `opencut-wasm.${name}() is not stubbed for the Bun test host. Transcribe it from rust/crates/ into apps/web/test-preload.ts, or exercise it in a browser test.`,
    );
  };

const stub = (...names: string[]) =>
  Object.fromEntries(names.map((name) => [name, notStubbed(name)]));

mock.module("opencut-wasm", () => ({
  // ── verifiable integer-tick arithmetic (media_time.rs) ──────────────────
  TICKS_PER_SECOND: () => TICKS,
  // :154 — (seconds * TICKS_PER_SECOND_F64).round()
  mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
    Number.isFinite(seconds) ? Math.round(seconds * TICKS) : undefined,
  // :169
  mediaTimeToSeconds: ({ time }: { time: number }) => time / TICKS,
  // :300 / :314 / :328 / :342 / :357
  mediaTimeAdd: ({ lhs, rhs }: { lhs: number; rhs: number }) => lhs + rhs,
  mediaTimeSub: ({ lhs, rhs }: { lhs: number; rhs: number }) => lhs - rhs,
  mediaTimeMin: ({ lhs, rhs }: { lhs: number; rhs: number }) => Math.min(lhs, rhs),
  mediaTimeMax: ({ lhs, rhs }: { lhs: number; rhs: number }) => Math.max(lhs, rhs),
  mediaTimeClamp: ({ time, min, max }: { time: number; min: number; max: number }) =>
    Math.min(Math.max(time, min), max),

  // ── refuse rather than approximate ──────────────────────────────────────
  ...stub(
    // frame-rate dependent: needs FrameRate::ticks_per_frame + NTSC handling
    "roundToFrame",
    "floorToFrame",
    "isFrameAligned",
    "mediaTimeFromFrame",
    "mediaTimeToFrame",
    "lastFrameTime",
    "snappedSeekTime",
    "formatTimecode",
    "parseTimecode",
    "guessTimecodeFormat",
    // GPU / compositor / rendering
    "initCompositor",
    "initializeGpu",
    "getCompositorCanvas",
    "resizeCompositor",
    "renderFrame",
    "getLastFrameProfile",
    "uploadTexture",
    "releaseTexture",
    "applyEffectPasses",
    "applyMaskFeather",
  ),
}));
