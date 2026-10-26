import { strict as assert } from "node:assert";
import test from "node:test";
import { omitArchivedOriginalStub } from "../media-index.mjs";
import { importMedia } from "../media-import.mjs";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a custom display name preserves source bytes, extension and MIME on import", async () => {
  const folder = await mkdtemp(join(tmpdir(), "moirai-import-label-"));
  const wav = Buffer.alloc(44 + 16000);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(16000, 40);
  const filePath = join(folder, "original.WAV");
  await writeFile(filePath, wav);
  let index = {};
  const uploads = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (req.method === "PUT" && req.url.includes("?ext=")) {
      uploads.push({ url: req.url, mime: req.headers["content-type"], body });
    } else if (req.method === "PUT") {
      const payload = JSON.parse(body.toString());
      index = payload.assets ?? payload;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.method === "GET" ? { assets: index } : { ok: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const name of ["独立配乐", "misleading.mp4"]) {
      const imported = await importMedia({ projectId: "label-test", filePath, name, base });
      assert.equal(imported.mimeType, "audio/wav");
      assert.equal(index[imported.assetId].name, name);
      assert.equal(index[imported.assetId].ext, "wav");
      assert.equal(index[imported.assetId].type, "audio");
    }
    assert.equal(uploads.length, 2);
    for (const upload of uploads) {
      assert.match(upload.url, /\?ext=wav$/);
      assert.equal(upload.mime, "audio/wav");
      assert.deepEqual(upload.body, wav);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(folder, { recursive: true, force: true });
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
