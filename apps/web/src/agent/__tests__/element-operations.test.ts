import { describe, expect, test } from "bun:test";
import { InvalidOperationError, buildCommand } from "../operations";
import type { Operation } from "../operations";
import { InvalidTimeError, toMediaTime, toSeconds, TICKS_PER_SECOND } from "../time";

/**
 * The element vocabulary's job is to refuse malformed input BEFORE it reaches a
 * command, because the editor's element commands mostly fail silently — a bad id
 * is a no-op, a missing startTime becomes `undefined` in the stored document.
 * Each test below pins a specific way the editor would otherwise be corrupted.
 */

const REF = { trackId: "track-1", elementId: "el-1" };

describe("time conversion", () => {
  test("seconds convert to integer ticks at the editor's resolution", () => {
    expect(TICKS_PER_SECOND).toBe(120_000);
    expect(Number(toMediaTime("t", 1))).toBe(120_000);
    expect(Number(toMediaTime("t", 0))).toBe(0);
    // 29.97fps frame boundaries must stay exact integers.
    expect(Number.isInteger(toMediaTime("t", 1001 / 30_000))).toBe(true);
  });

  test("round-trips through seconds", () => {
    expect(toSeconds(toMediaTime("t", 2.5))).toBeCloseTo(2.5, 9);
  });

  test("rejects values that would silently corrupt the timeline", () => {
    // A raw number is assignable to MediaTime at runtime (the brand is erased),
    // so nothing downstream would catch these.
    expect(() => toMediaTime("t", Number.NaN)).toThrow(InvalidTimeError);
    expect(() => toMediaTime("t", Number.POSITIVE_INFINITY)).toThrow(InvalidTimeError);
    expect(() => toMediaTime("t", -1)).toThrow(InvalidTimeError);
    expect(() => toMediaTime("t", "5" as unknown as number)).toThrow(InvalidTimeError);
  });
});

describe("element.insert validation", () => {
  const draft = (over: Record<string, unknown> = {}) =>
    ({
      type: "element.insert",
      element: { type: "video", name: "clip", startTimeSeconds: 0, mediaId: "m1", ...over },
    }) as Operation;

  test("builds a command for a well-formed draft", () => {
    expect(buildCommand({ operation: draft() })).toBeDefined();
  });

  test("requires startTimeSeconds", () => {
    // InsertElementCommand does NOT default startTime: the placement resolver
    // hands back the requested value unchanged, so omitting it stores an element
    // with `startTime: undefined` — positioned nowhere, and breaking the overlap
    // checks that every later insert depends on.
    expect(() =>
      buildCommand({ operation: draft({ startTimeSeconds: undefined }) }),
    ).toThrow(InvalidTimeError);
  });

  test("requires the per-type source id", () => {
    expect(() => buildCommand({ operation: draft({ mediaId: undefined }) })).toThrow(
      InvalidOperationError,
    );
    expect(() =>
      buildCommand({
        operation: {
          type: "element.insert",
          element: { type: "sticker", name: "s", startTimeSeconds: 0 },
        } as Operation,
      }),
    ).toThrow(InvalidOperationError);
  });

  test("requires params.content for text, which the editor reads unguarded", () => {
    const text = (params?: Record<string, string>) =>
      ({
        type: "element.insert",
        element: { type: "text", name: "title", startTimeSeconds: 0, ...(params ? { params } : {}) },
      }) as Operation;
    expect(() => buildCommand({ operation: text() })).toThrow(InvalidOperationError);
    expect(buildCommand({ operation: text({ content: "Hello" }) })).toBeDefined();
  });

  test("rejects a zero-length clip", () => {
    // The editor's overlap predicate is `start < end`, so a zero-duration clip
    // reports every track as free and stacks silently on top of existing clips.
    expect(() => buildCommand({ operation: draft({ durationSeconds: 0 }) })).toThrow(
      InvalidOperationError,
    );
  });
});

describe("element operations reject unusable references", () => {
  const cases: Array<[string, Operation]> = [
    ["delete with no elements", { type: "element.delete", elements: [] }],
    ["duplicate with no elements", { type: "element.duplicate", elements: [] }],
    ["move with no moves", { type: "element.move", moves: [] }],
    [
      "split with a blank track id",
      { type: "element.split", elements: [{ trackId: "", elementId: "e" }], splitTimeSeconds: 1 },
    ],
    [
      "delete with a missing element id",
      { type: "element.delete", elements: [{ trackId: "t" } as never] },
    ],
  ];
  for (const [name, operation] of cases) {
    test(name, () => {
      expect(() => buildCommand({ operation })).toThrow(InvalidOperationError);
    });
  }
});

describe("element.trim patches only what the caller named", () => {
  test("an empty patch is refused rather than applied as a no-op", () => {
    expect(() =>
      buildCommand({ operation: { type: "element.trim", elements: [REF] } as Operation }),
    ).toThrow(InvalidOperationError);
  });

  test("unnamed fields are absent from the patch, not set to undefined", () => {
    // UpdateElementsCommand spreads the patch over the element, so an explicit
    // `startTime: undefined` would erase a real position.
    const command = buildCommand({
      operation: { type: "element.trim", elements: [{ ...REF, durationSeconds: 4 }] } as Operation,
    }) as unknown as { updates: Array<{ patch: Record<string, unknown> }> };
    const { patch } = command.updates[0];
    expect(Object.keys(patch)).toEqual(["duration"]);
    expect(Number(patch.duration)).toBe(4 * TICKS_PER_SECOND);
  });
});

describe("element.move", () => {
  test("defaults the target track to the source track", () => {
    // Moving within a track is the common case (a nudge or a re-time); requiring
    // targetTrackId would make every such call carry a redundant argument.
    const command = buildCommand({
      operation: { type: "element.move", moves: [{ ...REF, startTimeSeconds: 3 }] } as Operation,
    }) as unknown as { moves: Array<{ sourceTrackId: string; targetTrackId: string; newStartTime: number }> };
    expect(command.moves[0].sourceTrackId).toBe("track-1");
    expect(command.moves[0].targetTrackId).toBe("track-1");
    expect(Number(command.moves[0].newStartTime)).toBe(3 * TICKS_PER_SECOND);
  });

  test("carries an explicit cross-track target through", () => {
    const command = buildCommand({
      operation: {
        type: "element.move",
        moves: [{ ...REF, targetTrackId: "track-2", startTimeSeconds: 0 }],
      } as Operation,
    }) as unknown as { moves: Array<{ targetTrackId: string }> };
    expect(command.moves[0].targetTrackId).toBe("track-2");
  });
});

describe("guards added after adversarial review", () => {
  test("naming the same element twice is refused", () => {
    // MoveElementCommand dedupes when resolving but re-iterates the raw list
    // when rebuilding tracks, so a repeated id inserts the element twice while
    // removing it once — two clips sharing one id, after which every id-keyed
    // lookup can only ever reach the first.
    expect(() =>
      buildCommand({
        operation: {
          type: "element.move",
          moves: [
            { ...REF, startTimeSeconds: 1 },
            { ...REF, startTimeSeconds: 2 },
          ],
        } as Operation,
      }),
    ).toThrow(InvalidOperationError);
    expect(() =>
      buildCommand({ operation: { type: "element.delete", elements: [REF, REF] } as Operation }),
    ).toThrow(InvalidOperationError);
  });

  test("element.trim rejects a zero duration, like element.insert does", () => {
    expect(() =>
      buildCommand({
        operation: { type: "element.trim", elements: [{ ...REF, durationSeconds: 0 }] } as Operation,
      }),
    ).toThrow(InvalidOperationError);
  });

  test("element.rename requires a real name", () => {
    // The patch is spread over the element, so a missing name would set
    // `name: undefined` and erase the existing one.
    for (const name of ["", undefined]) {
      expect(() =>
        buildCommand({
          operation: { type: "element.rename", elements: [{ ...REF, name }] } as unknown as Operation,
        }),
      ).toThrow(InvalidOperationError);
    }
  });

  test("hidden is dropped for audio, which has no such field", () => {
    const command = buildCommand({
      operation: {
        type: "element.insert",
        element: { type: "audio", name: "vo", startTimeSeconds: 0, mediaId: "m1", hidden: true },
      } as Operation,
    }) as unknown as { element: Record<string, unknown> };
    // Keeping it would make getState echo a state nothing in the editor honours.
    expect("hidden" in command.element).toBe(false);
  });

  test("hidden is kept for visual elements", () => {
    const command = buildCommand({
      operation: {
        type: "element.insert",
        element: { type: "video", name: "v", startTimeSeconds: 0, mediaId: "m1", hidden: true },
      } as Operation,
    }) as unknown as { element: Record<string, unknown> };
    expect(command.element.hidden).toBe(true);
  });

  test("sourceDuration is carried through when supplied", () => {
    const command = buildCommand({
      operation: {
        type: "element.insert",
        element: {
          type: "video",
          name: "v",
          startTimeSeconds: 0,
          mediaId: "m1",
          sourceDurationSeconds: 12,
        },
      } as Operation,
    }) as unknown as { element: Record<string, unknown> };
    // Without it, computeResize skips the source clamp and the HUMAN can drag
    // the clip's edge past the end of the footage.
    expect(Number(command.element.sourceDuration)).toBe(12 * TICKS_PER_SECOND);
  });

  test("a time beyond the editor's tick range is refused, not silently rounded", () => {
    // The bun test stub for mediaTimeFromSeconds is plain JS and would happily
    // return a lossy float where the real Rust converter throws.
    expect(() => toMediaTime("t", 1e18)).toThrow(InvalidTimeError);
  });
});
