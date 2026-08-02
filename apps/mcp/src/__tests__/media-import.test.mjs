import { strict as assert } from "node:assert";
import test from "node:test";
import { omitArchivedOriginalStub } from "../media-index.mjs";

test("archived proxy originals stay on disk but are omitted from the editor media index", () => {
  const index = {
    "asset-1": {
      id: "asset-1",
      name: "portrait.jpg",
      type: "image",
      ext: "jpg",
    },
    "asset-1-original": {
      ext: "jpg",
      mimeType: "image/jpeg",
    },
    "other-original": {
      id: "other-original",
      name: "other-original.jpg",
      type: "image",
      ext: "jpg",
    },
  };

  const cleaned = omitArchivedOriginalStub({ index, assetId: "asset-1" });

  assert.deepEqual(Object.keys(cleaned).sort(), ["asset-1", "other-original"]);
  assert.ok(index["asset-1-original"], "the caller-owned index is not mutated");
});
