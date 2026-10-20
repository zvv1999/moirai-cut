import { strict as assert } from "node:assert";
import test from "node:test";
import { registerTemplateTools } from "../template-workbench.mjs";

test("reference tools keep sampling, upload and comparison separate", async () => {
  const tools = new Map();
  registerTemplateTools({ registerTool: (name, definition, call) => tools.set(name, { definition, call }) });
  const original = globalThis.fetch;
  try {
    for (const [name, args, request] of [
      ["sample_reference_video", { inputId: "video", times: [0, 0.5], idempotencyKey: "sample" }, { operation: "sample", input_id: "video", times: [0, 0.5] }],
      ["analyze_reference_style", { sampleId: "sample", brief: "style", idempotencyKey: "analysis" }, { operation: "analyze", sample_id: "sample", brief: "style" }],
      ["compare_reference_frames", { referenceId: "a", candidateId: "b", idempotencyKey: "compare" }, { operation: "compare", reference_id: "a", candidate_id: "b" }],
    ]) {
      globalThis.fetch = async (url, init) => {
        assert.ok(url.endsWith("/templates/references"));
        assert.deepEqual(JSON.parse(init.body), { request, idempotencyKey: args.idempotencyKey });
        return Response.json({ status: "queued" });
      };
      assert.equal(JSON.parse((await tools.get(name).call(args)).content[0].text).status, "queued");
    }
    assert.match(tools.get("analyze_reference_style").definition.description, /uploads/);
    globalThis.fetch = async (url) => { assert.ok(url.endsWith("/references/sample")); return Response.json({ job: { status: "failed" }, result: null }); };
    assert.equal(JSON.parse((await tools.get("read_reference_analysis").call({ id: "sample" })).content[0].text).result, null);
  } finally { globalThis.fetch = original; }
});
