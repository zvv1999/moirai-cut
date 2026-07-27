import { describe, expect, test } from "bun:test";
import { safeExportName } from "../export-jobs";

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
