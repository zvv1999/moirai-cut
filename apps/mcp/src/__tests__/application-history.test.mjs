import { strict as assert } from "node:assert";
import test from "node:test";
import { registerTemplateTools } from "../template-workbench.mjs";

test("application history tools preserve snapshots, filter encoding and native rejection", async () => {
  const registered = new Map();
  registerTemplateTools({ registerTool: (name, definition, call) => registered.set(name, { definition, call }) });
  const previous = globalThis.fetch;
  const snapshot = { contextId: "trial-one", application: { assetId: "lamp", assetRevision: 3 }, samples: [{ inputId: "input-one", transcriptRevision: 2 }], placementPolicy: { safeInset: 0.04, requireFullCoverage: true }, placementPadding: 0.03, protectedRegions: [{id:"diagram",region:{x:0.1,y:0.2,width:0.3,height:0.4}}], reason: "Keep the diagram visible", idempotencyKey: "adjust-one" };
  snapshot.protectionContext = {sample: snapshot.samples[0], application: snapshot.application, extras: []};
  try {
    for (const [name, args, route, expected, readOnly] of [
      ["list_dynamic_asset_applications", {}, "", undefined, true],
      ["list_dynamic_asset_applications", { assetId: "lamp", contextId: "trial & one" }, "?assetId=lamp&contextId=trial+%26+one", undefined, true],
      ["read_dynamic_asset_application", { id: "application-one" }, "/application-one", undefined, true],
      ["save_dynamic_asset_application", { request: snapshot }, "", snapshot, false],
      ["restore_dynamic_asset_application", { id: "application-one", request: { current: snapshot } }, "/application-one/restore", { current: snapshot }, false],
    ]) {
      globalThis.fetch = async (url, init) => {
        assert.ok(url.endsWith(`/templates/dynamic-assets/application-history${route}`));
        assert.equal(init.method, expected === undefined ? "GET" : "POST");
        assert.deepEqual(init.body ? JSON.parse(init.body) : undefined, expected);
        return Response.json({ error: "application history is stale", reason: "transcript_revision" }, { status: 400 });
      };
      const tool = registered.get(name);
      assert.equal(tool.definition.annotations.readOnlyHint, readOnly);
      const result = await tool.call(args);
      assert.equal(result.isError, true);
      assert.deepEqual(JSON.parse(result.content[0].text), { error: "application history is stale", reason: "transcript_revision" });
    }
    globalThis.fetch = async () => Response.json({ record: { id: "application-one", current: true }, template: { id: "trial" } });
    const result = await registered.get("restore_dynamic_asset_application").call({ id: "application-one", request: { current: snapshot } });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).record.id, "application-one");
  } finally { globalThis.fetch = previous; }
});
