import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildMediaCatalog,
  planTimelineRangeInspection,
} from "../media-analysis.mjs";
import { TICKS_PER_SECOND } from "../document.mjs";

const ticks = (seconds) => seconds * TICKS_PER_SECOND;

function projectDocument() {
  return {
    revision: 7,
    currentSceneId: "scene-1",
    metadata: { id: "project-1", name: "Scene cut" },
    scenes: [
      {
        id: "scene-1",
        name: "Main",
        isMain: true,
        tracks: {
          main: {
            id: "main",
            type: "video",
            elements: [
              {
                id: "clip-a",
                type: "video",
                name: "A",
                mediaId: "media-a",
                startTime: ticks(0),
                duration: ticks(4),
                trimStart: ticks(1),
                trimEnd: 0,
              },
              {
                id: "clip-b",
                type: "video",
                name: "B fast",
                mediaId: "media-b",
                startTime: ticks(4),
                duration: ticks(2),
                trimStart: ticks(2),
                trimEnd: 0,
                retime: { rate: 2, maintainPitch: true },
              },
            ],
          },
          overlay: [
            {
              id: "titles",
              type: "text",
              elements: [
                {
                  id: "title",
                  type: "text",
                  name: "Title",
                  startTime: ticks(1),
                  duration: ticks(1),
                  trimStart: 0,
                  trimEnd: 0,
                },
              ],
            },
          ],
          audio: [],
        },
      },
    ],
  };
}

test("timeline range inspection maps representative timeline frames to source media seconds", () => {
  const plan = planTimelineRangeInspection({
    document: projectDocument(),
    sceneId: "scene-1",
    startSeconds: 1,
    endSeconds: 6,
    maxFrames: 5,
  });

  assert.equal(plan.schemaVersion, "opencut.timeline-inspection.v1");
  assert.equal(plan.projectId, "project-1");
  assert.equal(plan.sceneId, "scene-1");
  assert.deepEqual(
    plan.samples.map(({ elementId, timelineSeconds, sourceSeconds }) => ({
      elementId,
      timelineSeconds,
      sourceSeconds,
    })),
    [
      { elementId: "clip-a", timelineSeconds: 1.5, sourceSeconds: 2.5 },
      { elementId: "clip-a", timelineSeconds: 2.5, sourceSeconds: 3.5 },
      { elementId: "clip-a", timelineSeconds: 3.5, sourceSeconds: 4.5 },
      { elementId: "clip-b", timelineSeconds: 4.5, sourceSeconds: 3 },
      { elementId: "clip-b", timelineSeconds: 5.5, sourceSeconds: 5 },
    ],
  );
  assert.deepEqual(Object.keys(plan.byAsset), ["media-a", "media-b"]);
  assert.deepEqual(plan.byAsset["media-b"].sourceSeconds, [3, 5]);
});

test("media catalog is compact, agent-readable, and records every timeline use", () => {
  const catalog = buildMediaCatalog({
    document: projectDocument(),
    mediaIndex: {
      "media-a": {
        id: "media-a",
        name: "A.mov",
        type: "video",
        duration: 10,
        width: 1920,
        height: 1080,
        fps: 29.97,
        hasAudio: true,
        size: 1234,
        thumbnailUrl: `data:image/jpeg;base64,${"x".repeat(1000)}`,
        proxy: {
          enabled: true,
          storageId: "secret-local-id",
          name: "A.proxy.mp4",
          mimeType: "video/mp4",
          width: 1280,
          height: 720,
          size: 456,
        },
      },
      "media-b": {
        id: "media-b",
        name: "B.mov",
        type: "video",
        duration: 8,
      },
    },
    existingCatalog: {
      schemaVersion: "opencut.media-catalog.v1",
      projectId: "project-1",
      assets: {
        "media-a": {
          id: "media-a",
          analysis: {
            status: "ready",
            provider: "codex-multimodal",
            summary: "A person enters a room.",
            scenes: [],
            tags: ["person", "interior"],
          },
        },
      },
    },
    generatedAt: "2026-07-30T00:00:00.000Z",
  });

  assert.equal(catalog.schemaVersion, "opencut.media-catalog.v1");
  assert.equal(catalog.revision, 7);
  assert.equal(catalog.assets["media-a"].technical.width, 1920);
  assert.equal(catalog.assets["media-a"].proxy.enabled, true);
  assert.equal(catalog.assets["media-a"].proxy.storageId, undefined);
  assert.equal(catalog.assets["media-a"].thumbnailUrl, undefined);
  assert.equal(
    catalog.assets["media-a"].analysis.summary,
    "A person enters a room.",
  );
  assert.deepEqual(catalog.assets["media-a"].timelineUses, [
    {
      sceneId: "scene-1",
      trackId: "main",
      elementId: "clip-a",
      timelineStartSeconds: 0,
      timelineEndSeconds: 4,
      sourceStartSeconds: 1,
      sourceEndSeconds: 5,
    },
  ]);
  assert.ok(JSON.stringify(catalog).length < 5000);
  assert.equal(JSON.stringify(catalog).includes("base64"), false);
});

test("invalid timeline ranges are rejected before any frame work", () => {
  assert.throws(
    () =>
      planTimelineRangeInspection({
        document: projectDocument(),
        startSeconds: 3,
        endSeconds: 3,
      }),
    (error) =>
      error?.code === "invalid_timeline_range" &&
      /endSeconds must be greater/.test(error.message),
  );
});
