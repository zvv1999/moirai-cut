import test from "node:test";
import assert from "node:assert/strict";
import { initializeStyleSeed } from "./initialize-style-seed.mjs";

test("initialization preserves an existing edited asset without writing", async () => {
  const edited = { id: "style-study-20260929-checklist-headline", revision: 12, name: "User-edited style" };
  const calls = [];
  const result = await initializeStyleSeed("checklist-headline.json", { request: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ assets: [edited] });
  } });
  assert.deepEqual(result, edited);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
});

test("a missing asset is inspected by Rust and created once with a stable CAS request", async () => {
  const saves = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await initializeStyleSeed("checklist-headline.json", { request: async (url, options) => {
      if (options.method === "GET") return Response.json({ assets: [] });
      const body = JSON.parse(options.body);
      if (url.endsWith("/inspect")) return Response.json({ definition: { ...body, provenance: "Normalized by native service" } });
      saves.push(body);
      return Response.json({ definition: { ...body.definition, revision: 1 } });
    } });
    assert.equal(result.provenance, "Normalized by native service");
    assert.equal(result.revision, 1);
    assert.ok(result.usageGuide);
  }
  assert.deepEqual(saves[0], saves[1]);
  assert.equal(saves[0].baseRevision, 0);
  assert.equal(saves[0].definition.revision, 0);
});

test("native rejection stops before saving and remains visible", async () => {
  const calls = [];
  await assert.rejects(initializeStyleSeed("clock.json", { request: async (url, options) => {
    calls.push(url);
    if (options.method === "GET") return Response.json({ assets: [] });
    return Response.json({ error: "unsupported treatment" }, { status: 400 });
  } }), /unsupported treatment/);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith("/inspect"));
});

test("a concurrent creation conflict is not retried as an overwrite", async () => {
  const calls = [];
  await assert.rejects(initializeStyleSeed("clock.json", { request: async (url, options) => {
    calls.push(url);
    if (options.method === "GET") return Response.json({ assets: [] });
    if (url.endsWith("/inspect")) return Response.json({ definition: JSON.parse(options.body) });
    return Response.json({ error: "revision conflict" }, { status: 409 });
  } }), /revision conflict/);
  assert.equal(calls.length, 3);
});
