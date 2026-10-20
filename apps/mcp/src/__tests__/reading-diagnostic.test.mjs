import { strict as assert } from "node:assert";
import test from "node:test";
import { registerTemplateTools } from "../template-workbench.mjs";

test("reading diagnostic forwards exact frozen identity and caller observations without granting acceptance", async () => {
  const registered = new Map();
  registerTemplateTools({ registerTool:(name,definition,call)=>registered.set(name,{definition,call}) });
  const tool=registered.get("diagnose_template_production_reading");
  assert.equal(tool.definition.annotations.readOnlyHint,true);
  const request={fixtureId:1,outputSha256:"a".repeat(64),viewportWidthPx:390,minFontSizePx:24,maxLines:2,budgets:[{elementId:"actual-instance-id",stableStartSeconds:2.4,stableSeconds:1.4,requiredStableSeconds:1.2}]};
  const previous=globalThis.fetch;
  try {
    globalThis.fetch=async(url,init)=>{
      assert.ok(url.endsWith("/templates/production/batch/items/2/reading-diagnostic"));
      assert.equal(init.method,"POST");assert.deepEqual(JSON.parse(init.body),request);
      return Response.json({timingCheck:{status:"passed"},visualCheck:{status:"unverified"},aestheticQualityVerified:false});
    };
    const result=JSON.parse((await tool.call({id:"batch",index:2,request})).content[0].text);
    assert.equal(result.visualCheck.status,"unverified");assert.equal(result.aestheticQualityVerified,false);
    globalThis.fetch=async()=>Response.json({error:"published file changed"},{status:400});
    const rejected=await tool.call({id:"batch",index:2,request});assert.equal(rejected.isError,true);assert.equal(JSON.parse(rejected.content[0].text).error,"published file changed");
  } finally {globalThis.fetch=previous;}
});
