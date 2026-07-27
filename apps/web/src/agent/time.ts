import { mediaTimeFromSeconds, mediaTimeToSeconds, TICKS_PER_SECOND } from "@/wasm";
import type { MediaTime } from "@/wasm";

/**
 * Seconds on the wire, ticks inside.
 *
 * The editor measures time in integer ticks at 120_000/second, chosen so every
 * supported frame rate divides evenly. That is the right internal unit and the
 * wrong external one: an agent that reads "startTime: 600000" and writes back
 * "startTime: 5" is off by a factor of 120_000, and nothing in the type system
 * catches it — `MediaTime`'s brand is erased at runtime, so a raw number is
 * accepted everywhere a tick count is expected.
 *
 * So the agent vocabulary speaks seconds exclusively, and conversion happens
 * here. `getState` reports both, with the tick value clearly named.
 */

export class InvalidTimeError extends Error {
  constructor(field: string, value: unknown) {
    super(
      `${field} must be a finite, non-negative number of seconds within the editor's range; got ${JSON.stringify(value)}`,
    );
    this.name = "InvalidTimeError";
  }
}

/**
 * Largest value that still converts to an exact integer tick count.
 *
 * Rust's `from_seconds_f64` returns None once the tick count leaves i64, and the
 * wasm wrapper turns that into a throw — but the Bun test stub is plain JS and
 * happily returns a lossy float. Checking here rather than relying on the
 * converter keeps the test and browser behaviour identical instead of letting
 * tests pass on input the real editor rejects.
 */
const MAX_SECONDS = Number.MAX_SAFE_INTEGER / TICKS_PER_SECOND;

/** Convert wire seconds to the editor's tick-based MediaTime. */
export function toMediaTime(field: string, seconds: number): MediaTime {
  if (
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > MAX_SECONDS
  ) {
    throw new InvalidTimeError(field, seconds);
  }
  return mediaTimeFromSeconds({ seconds });
}

/** Same, but passes through undefined so callers can express "not specified". */
export function toOptionalMediaTime(
  field: string,
  seconds: number | undefined,
): MediaTime | undefined {
  return seconds === undefined ? undefined : toMediaTime(field, seconds);
}

export function toSeconds(time: MediaTime | number | undefined): number | null {
  if (typeof time !== "number" || !Number.isFinite(time)) return null;
  return mediaTimeToSeconds({ time: time as MediaTime });
}

export { TICKS_PER_SECOND };
