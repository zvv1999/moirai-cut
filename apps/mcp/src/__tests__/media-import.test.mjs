import { strict as assert } from "node:assert";
import test from "node:test";
import { omitArchivedOriginalStub } from "../media-index.mjs";
import { importMedia } from "../media-import.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("import merges one asset via PATCH without replacing concurrent index entries", async (t) => {
  if (spawnSync("ffprobe", ["-version"]).status !== 0) { t.skip("ffprobe unavailable"); return; }
  const dir = await mkdtemp(join(tmpdir(), "moirai-import-test-"));
  const filePath = join(dir, "voice.wav");
  const bytes = Buffer.alloc(44 + 16000 * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  await writeFile(filePath, bytes);
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body });
      if (!init.method) return new Response(JSON.stringify({ assets: { concurrent: { name: "keep.mp4", ext: "mp4" } } }));
      if (init.method === "PUT") assert.match(url, /\/project\/[^/]+\?ext=wav$/);
      if (init.method === "PATCH") {
        const payload = JSON.parse(init.body);
        assert.equal(payload.action, "merge");
        assert.equal(payload.value.name, "voice.wav");
        assert.equal(payload.value.type, "audio");
        assert.equal(payload.value.duration, 1);
        assert.equal(payload.value.concurrent, undefined);
      }
      return new Response(JSON.stringify({ ok: true }));
    };
    const result = await importMedia({ projectId: "project", filePath, base: "http://test" });
    assert.equal(calls.filter(c => c.method === "PATCH").length, 1);
    assert.ok(calls.find(c => c.url.endsWith("/" + result.assetId) && c.method === "PATCH"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

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
