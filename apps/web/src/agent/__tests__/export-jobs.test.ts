import { describe, expect, test } from "bun:test";
import {
  buildAgentExportFileName,
  resolveAgentExportOptions,
  safeExportName,
} from "../export-jobs";

// The exports route's own rules, restated: names must satisfy this or the
// upload 400s after minutes of encoding.
const ROUTE_SAFE = /^[\p{L}\p{N}_.-]{1,160}$/u;
const routeAccepts = (base: string) =>
  ROUTE_SAFE.test(`${base}-a1b2c3d4.webm`) && !/^\.+$/.test(`${base}-a1b2c3d4.webm`);

describe("safeExportName", () => {
  test("unicode letters survive; path-hostile characters become dashes", () => {
    expect(safeExportName("reed 酒吧夜")).toBe("reed-酒吧夜");
    expect(safeExportName("a/b\\c:d")).toBe("a-b-c-d");
  });

  test("a name longer than the route allows is capped and still accepted", () => {
    const long = "很".repeat(500);
    const name = safeExportName(long);
    expect(name.length).toBeLessThanOrEqual(140);
    expect(routeAccepts(name)).toBe(true);
  });

  test("the cap cuts between code points, never through a surrogate pair", () => {
    // 𝒜 (U+1D49C) is two UTF-16 units; a unit-based slice at an odd offset
    // would strand half of one and fail the route's \p{L} check.
    const name = safeExportName("𝒜".repeat(200));
    expect([...name].length).toBeLessThanOrEqual(140);
    expect(routeAccepts(name)).toBe(true);
  });

  test("degenerate names fall back instead of vanishing or hiding", () => {
    expect(safeExportName("")).toBe("export");
    expect(safeExportName("///")).toBe("export");
    // Leading dots would make the export invisible in the listing.
    expect(safeExportName(".hidden")).toBe("hidden");
    expect(safeExportName("..")).toBe("export");
  });
});

describe("agent draft exports", () => {
  test("draft quality resolves to a 12fps low-bitrate review preset", () => {
    const requested = {
      format: "mp4" as const,
      quality: "draft" as const,
      fps: { numerator: 30, denominator: 1 },
      includeAudio: true,
    };
    const resolved = resolveAgentExportOptions(requested);

    expect(resolved).toEqual({
      format: "mp4",
      quality: "draft",
      fps: { numerator: 12, denominator: 1 },
      includeAudio: true,
    });
    expect(requested.fps).toEqual({ numerator: 30, denominator: 1 });
  });

  test("deliverable qualities retain the caller's frame rate", () => {
    const requested = {
      format: "webm" as const,
      quality: "high" as const,
      fps: { numerator: 30000, denominator: 1001 },
      includeAudio: false,
    };
    expect(resolveAgentExportOptions(requested)).toBe(requested);
  });

  test("draft filenames are branded once and remain predictable", () => {
    expect(
      buildAgentExportFileName({
        requestedName: "first review.mp4",
        projectName: "Project",
        format: "mp4",
        draft: true,
        jobId: "a1b2c3d4-rest",
      }),
    ).toBe("first-review-draft.mp4");
    expect(
      buildAgentExportFileName({
        requestedName: "first-review-draft.mp4",
        projectName: "Project",
        format: "mp4",
        draft: true,
        jobId: "a1b2c3d4-rest",
      }),
    ).toBe("first-review-draft.mp4");
    expect(
      buildAgentExportFileName({
        projectName: "Project",
        format: "webm",
        draft: true,
        jobId: "a1b2c3d4-rest",
      }),
    ).toBe("Project-draft-a1b2c3d4.webm");
  });
});
