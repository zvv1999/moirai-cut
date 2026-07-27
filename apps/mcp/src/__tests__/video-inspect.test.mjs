import { strict as assert } from "node:assert";
import test from "node:test";
import { planInspectionTimes } from "../video-inspect.mjs";

test("uniform video samples use midpoints instead of risky endpoints", () => {
  assert.deepEqual(
    planInspectionTimes({ type: "video", durationSeconds: 8, count: 4 }),
    [1, 3, 5, 7],
  );
});

test("explicit source times are preserved when they are decodable", () => {
  assert.deepEqual(
    planInspectionTimes({
      type: "video",
      durationSeconds: 8,
      atSeconds: [0, 1.25, 7.999],
    }),
    [0, 1.25, 7.999],
  );
});

test("an explicit time at or beyond the source end is rejected before ffmpeg", () => {
  assert.throws(
    () =>
      planInspectionTimes({
        type: "video",
        durationSeconds: 8,
        atSeconds: [8],
      }),
    (error) =>
      error?.code === "inspection_time_out_of_range" &&
      /before the 8s source end/.test(error.message),
  );
});

test("still images produce one useful cell regardless of requested times", () => {
  assert.deepEqual(
    planInspectionTimes({
      type: "image",
      durationSeconds: null,
      atSeconds: [0, 1, 2],
    }),
    [0],
  );
});

test("the planner enforces finite positive sampling inputs", () => {
  assert.throws(
    () => planInspectionTimes({ type: "video", durationSeconds: 8, count: Number.NaN }),
    (error) => error?.code === "invalid_inspection_request",
  );
  assert.throws(
    () =>
      planInspectionTimes({
        type: "video",
        durationSeconds: 8,
        atSeconds: [Number.NaN],
      }),
    (error) => error?.code === "invalid_inspection_request",
  );
});
