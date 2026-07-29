import { strict as assert } from "node:assert";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import {
  inspectMedia,
  parseSceneChangeTimes,
  planInspectionTimes,
  planSceneInspectionTimes,
} from "../video-inspect.mjs";

test("uniform video samples use midpoints instead of risky endpoints", () => {
  assert.deepEqual(
    planInspectionTimes({ type: "video", durationSeconds: 8, count: 4 }),
    [1, 3, 5, 7],
  );
});

test("ffmpeg scene-change output becomes stable unique cut times", () => {
  const output = [
    "[Parsed_showinfo_1] n: 0 pts: 120000 pts_time:2.000 pos:0",
    "[Parsed_showinfo_1] n: 1 pts: 300000 pts_time:5 pos:1",
    "[Parsed_showinfo_1] n: 2 pts: 300001 pts_time:5.0001 pos:2",
    "unrelated warning",
  ].join("\n");
  assert.deepEqual(parseSceneChangeTimes(output), [2, 5]);
});

test("scene-aware inspection samples the midpoint of each detected shot", () => {
  assert.deepEqual(
    planSceneInspectionTimes({
      durationSeconds: 8,
      sceneChanges: [2, 5],
      maxScenes: 12,
    }),
    [1, 3.5, 6.5],
  );
});

test("a long continuous shot still yields a temporal sequence, not one midpoint", () => {
  assert.deepEqual(
    planSceneInspectionTimes({
      durationSeconds: 12,
      sceneChanges: [],
      maxScenes: 6,
    }),
    [1.5, 4.5, 7.5, 10.5],
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

test("inspectMedia builds a labeled sheet through injectable process dependencies", async () => {
  const calls = [];
  const result = await inspectMedia(
    {
      projectId: "project / one",
      assetId: "asset / one",
      count: 2,
      cellWidth: 200,
      base: "http://editor.test/",
    },
    {
      loadMediaIndex: async () => ({
        "asset / one": {
          id: "asset / one",
          name: "Source.mov",
          type: "video",
          duration: 8,
          width: 1920,
          height: 1080,
        },
      }),
      runCommand: async (command, args) => {
        calls.push({ command, args });
        await writeFile(args.at(-1), args.includes("tile=2x1:padding=2") ? "sheet" : "cell");
        return { stdout: "", stderr: "" };
      },
    },
  );

  assert.equal(result.jpegBase64, Buffer.from("sheet").toString("base64"));
  assert.equal(result.labeled, true);
  assert.deepEqual(result.grid, { columns: 2, rows: 1, cellWidth: 200 });
  assert.deepEqual(result.cells, [
    { cell: "r1c1", sourceSeconds: 2 },
    { cell: "r1c2", sourceSeconds: 6 },
  ]);
  assert.equal(calls.length, 3, "two cells plus one tile command");
  const inputIndex = calls[0].args.indexOf("-i");
  assert.equal(
    calls[0].args[inputIndex + 1],
    "http://editor.test/api/media/project%20%2F%20one/asset%20%2F%20one",
  );
});

test("inspectMedia falls back to an unlabeled cell when drawtext is unavailable", async () => {
  let rejectedLabel = false;
  const result = await inspectMedia(
    {
      projectId: "p1",
      assetId: "m1",
      atSeconds: [1],
    },
    {
      loadMediaIndex: async () => ({
        m1: { id: "m1", name: "Source.mov", type: "video", duration: 2 },
      }),
      runCommand: async (_command, args) => {
        const filter = args[args.indexOf("-vf") + 1];
        if (filter.includes("drawtext") && !rejectedLabel) {
          rejectedLabel = true;
          throw new Error("drawtext unavailable");
        }
        await writeFile(args.at(-1), filter.includes("tile=") ? "sheet" : "cell");
        return { stdout: "", stderr: "" };
      },
    },
  );

  assert.equal(rejectedLabel, true);
  assert.equal(result.labeled, false);
  assert.equal(result.cells[0].sourceSeconds, 1);
});

test("inspectMedia turns a double ffmpeg failure into a useful media error", async () => {
  await assert.rejects(
    () =>
      inspectMedia(
        {
          projectId: "p1",
          assetId: "m1",
          atSeconds: [1],
        },
        {
          loadMediaIndex: async () => ({
            m1: { id: "m1", name: "Broken.mov", type: "video", duration: 2 },
          }),
          runCommand: async () => {
            const error = new Error("decoder failed");
            error.stderr = "invalid video stream";
            throw error;
          },
        },
      ),
    (error) =>
      error?.code === "media_import_failed" &&
      /could not extract a frame at 1s from Broken\.mov/.test(error.message) &&
      /invalid video stream/.test(error.message),
  );
});
