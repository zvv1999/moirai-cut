import { strict as assert } from "node:assert";
import test from "node:test";
import { registerTemplateTools } from "../template-workbench.mjs";

test("ellipse geometry and independent stroke reveal survive the AI transport contract", async () => {
  const tools = new Map();
  registerTemplateTools({registerTool:(name,definition,call)=>tools.set(name,{definition,call})});
  const previous = globalThis.fetch;
  const ellipseArc={startDegrees:-35,sweepDegrees:325,cap:"round"};
  const motion={property:"stroke_reveal",keys:[{time:0,value:0,easing:"ease_out"},{time:1,value:1,easing:"linear"}]};
  const definition={id:"arc",revision:2,layers:[{parentId:"root",content:{kind:"element",element:{id:"ring",ellipseArc,motions:[motion]}}}]};
  try {
    for(const [name,path,request] of [
      ["edit_dynamic_asset_layers","/layers",{definition,operation:{kind:"ellipse_arc",layerId:"ring",ellipseArc}}],
      ["edit_dynamic_asset_layers","/layers",{definition,operation:{kind:"ellipse_arc",layerId:"ring",ellipseArc:null}}],
      ["edit_dynamic_asset_layers","/layers",{definition,operation:{kind:"outline",layerId:"ring",enabled:true}}],
      ["save_dynamic_asset","/dynamic-assets",{definition,baseRevision:2,idempotencyKey:"save-arc"}],
    ]) {
      globalThis.fetch=async(url,init)=>{
        assert.ok(url.endsWith(path));assert.deepEqual(JSON.parse(init.body),request);
        return Response.json({definition});
      };
      const result=await tools.get(name).call({request});
      assert.deepEqual(JSON.parse(result.content[0].text).definition,definition);
    }
    const reason="stroke_reveal treatment requires an individual outlined ellipse, not a group or layout";
    globalThis.fetch=async()=>Response.json({error:reason},{status:400});
    const result=await tools.get("preview_dynamic_asset").call({request:{definition,inputs:{},durationSeconds:2}});
    assert.equal(result.isError,true);assert.equal(JSON.parse(result.content[0].text).error,reason);
    assert.match(tools.get("dynamic_asset_schema").definition.description,/params\.strokeReveal/);
    assert.match(tools.get("edit_dynamic_asset_layers").definition.description,/ellipse_arc/);
  } finally {globalThis.fetch=previous;}
});

test("dynamic asset transport retains revisions and native errors without project writes", async () => {
  const tools = new Map();
  registerTemplateTools({ registerTool: (name, definition, call) => tools.set(name, { definition, call }) });
  const previous = globalThis.fetch;
  try {
    for (const [name, args, path, body, readOnly] of [
      ["dynamic_asset_schema", {}, "/schema", undefined, true],
      ["advise_dynamic_asset_placement", {request:{application:{assetId:"icon",assetRevision:3},protectedRegions:[{id:"logo",region:{x:0,y:0,width:0.3,height:0.4}}]}}, "/placement-advice", {application:{assetId:"icon",assetRevision:3},protectedRegions:[{id:"logo",region:{x:0,y:0,width:0.3,height:0.4}}]}, true],
      ["prepare_dynamic_asset_application", {request:{assetId:"keyword",assetRevision:2,transform:{scale:0.5,centerX:0.5,centerY:0.5,rotationDegrees:90},textWidths:{headline:0.5}}}, "/application", {assetId:"keyword",assetRevision:2,transform:{scale:0.5,centerX:0.5,centerY:0.5,rotationDegrees:90},textWidths:{headline:0.5}}, true],
      ["insert_dynamic_asset", {request:{assetId:"keyword",assetRevision:2,instanceId:"extra",textWidths:{headline:0.5}}}, "/insert", {assetId:"keyword",assetRevision:2,instanceId:"extra",textWidths:{headline:0.5}}, true],
      ["create_dynamic_asset", { request: { name: "Captions", canvas: { width: 720, height: 720, fps: 30 }, purpose: "caption" } }, "/create", { name: "Captions", canvas: { width: 720, height: 720, fps: 30 }, purpose: "caption" }, true],
      ["edit_dynamic_asset_layers", {request:{definition:{id:"draft"},operation:{kind:"group_instances",layerId:"root",separateInstances:true}}}, "/layers", {definition:{id:"draft"},operation:{kind:"group_instances",layerId:"root",separateInstances:true}}, true],
      ["edit_dynamic_asset_layers", { request: { definition: { id: "draft" }, operation: { kind: "resize", layerId: "icon", corner: "bottom_right", deltaX: 0.05, deltaY: 0.1 } } }, "/layers", { definition: { id: "draft" }, operation: { kind: "resize", layerId: "icon", corner: "bottom_right", deltaX: 0.05, deltaY: 0.1 } }, true],
      ["edit_dynamic_asset_layers", { request: { definition: { id: "draft" }, operation: { kind: "move", layerId: "icon", deltaX: 0.05, deltaY: -0.1 } } }, "/layers", { definition: { id: "draft" }, operation: { kind: "move", layerId: "icon", deltaX: 0.05, deltaY: -0.1 } }, true],
      ["edit_dynamic_asset_layers", { request: { definition: { id: "draft" }, operation: { kind: "place_beside", layerId: "icon", referenceId: "caption", side: "above", gap: 0.02 } } }, "/layers", { definition: { id: "draft" }, operation: { kind: "place_beside", layerId: "icon", referenceId: "caption", side: "above", gap: 0.02 } }, true],
      ["edit_dynamic_asset_layers", { request: { definition: { id: "draft" }, operation: { kind: "align", layerId: "icon", alignment: "right" } } }, "/layers", { definition: { id: "draft" }, operation: { kind: "align", layerId: "icon", alignment: "right" } }, true],
      ["edit_dynamic_asset_layers", { request: { definition: { id: "draft" }, operation: { kind: "stack", layerId: "icon", position: "back" } } }, "/layers", { definition: { id: "draft" }, operation: { kind: "stack", layerId: "icon", position: "back" } }, true],
      ["edit_dynamic_asset_media", { request: { definition: { id: "draft" }, assetId: "icon", layerId: "decoration" } }, "/media", { definition: { id: "draft" }, assetId: "icon", layerId: "decoration" }, true],
      ["list_dynamic_assets", {}, "", undefined, true],
      ["list_dynamic_asset_reviews", {}, "/reviews", undefined, true],
      ["list_dynamic_asset_review_series", {}, "/review-series", undefined, true],
      ["review_dynamic_asset_series", {request:{cases:[{application:{assetId:"style",assetRevision:2},review:{batchId:"case-a",item:0},rationale:"Move around source diagram"}],rationale:"Fixed style; per-input placement",coverage:"Two real backgrounds and Chinese speech",limitations:"Not listened"}}, "/review-series", {cases:[{application:{assetId:"style",assetRevision:2},review:{batchId:"case-a",item:0},rationale:"Move around source diagram"}],rationale:"Fixed style; per-input placement",coverage:"Two real backgrounds and Chinese speech",limitations:"Not listened"}, false],
      ["review_dynamic_asset", {request:{application:{assetId:"style",assetRevision:2},review:{batchId:"batch",item:0}}}, "/reviews", {application:{assetId:"style",assetRevision:2},review:{batchId:"batch",item:0}}, false],
      ["read_dynamic_asset", { id: "impact" }, "/impact", undefined, true],
      ["inspect_dynamic_asset", { request: { id: "draft" } }, "/inspect", { id: "draft" }, true],
      ["edit_dynamic_asset_layers", { request: { definition: { id: "draft" }, operation: { kind: "duplicate", layerId: "root" } } }, "/layers", { definition: { id: "draft" }, operation: { kind: "duplicate", layerId: "root" } }, true],
      ["create_dynamic_asset", { request: { name: "Text", canvas: { width: 720, height: 720, fps: 30 } } }, "/create", { name: "Text", canvas: { width: 720, height: 720, fps: 30 } }, true],
      ["prepare_dynamic_asset_application", { request: { assetId: "impact", assetRevision: 2, canvas: { width: 1280, height: 720, fps: 30 }, placement: { x: 0, y: 0.5, width: 1, height: 0.5 }, videoRegion: { x: 0, y: 0, width: 1, height: 0.8 } } }, "/application", { assetId: "impact", assetRevision: 2, canvas: { width: 1280, height: 720, fps: 30 }, placement: { x: 0, y: 0.5, width: 1, height: 0.5 }, videoRegion: { x: 0, y: 0, width: 1, height: 0.8 } }, true],
      ["preview_dynamic_asset", { request: { definition: { id: "draft" }, inputs: {}, durationSeconds: 2 } }, "/preview", { definition: { id: "draft" }, inputs: {}, durationSeconds: 2 }, true],
      ["preview_detached_dynamic_asset", { request: { preview: { definition: { id: "draft" }, inputs: {}, durationSeconds: 2 }, layerId: "icon" } }, "/detach-preview", { preview: { definition: { id: "draft" }, inputs: {}, durationSeconds: 2 }, layerId: "icon" }, true],
      ["preview_dynamic_asset_application", { request: { template: { id: "trial" }, durationSeconds: 2 } }, "/application-preview", { template: { id: "trial" }, durationSeconds: 2 }, true],
      ["preview_dynamic_asset_sample", { request: { template: { id: "trial" }, sample: { inputId: "speech", transcriptRevision: 2, title: "Trial" } } }, "/sample-preview", { template: { id: "trial" }, sample: { inputId: "speech", transcriptRevision: 2, title: "Trial" } }, true],
      ["archive_dynamic_asset", { request: { assetId: "impact", assetRevision: 2, baseRevision: 0, archived: true } }, "/archive", { assetId: "impact", assetRevision: 2, baseRevision: 0, archived: true }, false],
      ["save_dynamic_asset", { request: { definition: { id: "impact" }, baseRevision: 2, idempotencyKey: "save" } }, "", { definition: { id: "impact" }, baseRevision: 2, idempotencyKey: "save" }, false],
      ["capture_dynamic_asset", { request: { template: { id: "trial" }, name: "Pair" } }, "/capture", { template: { id: "trial" }, name: "Pair" }, true],
      ["insert_dynamic_asset", { request: { assetId: "impact", assetRevision: 1, instanceId: "one", inputs: { headline: "Hello" } } }, "/insert", { assetId: "impact", assetRevision: 1, instanceId: "one", inputs: { headline: "Hello" } }, true],
      ["insert_dynamic_asset", { request: { assetId: "caption", assetRevision: 2, instanceId: "caption-one", placement: { x: 0, y: 0, width: 1, height: 1 }, transform: { scale: 0.65, centerX: 0.5, centerY: 0.9, rotationDegrees: -90 }, captionWidth: 0.84 } }, "/insert", { assetId: "caption", assetRevision: 2, instanceId: "caption-one", placement: { x: 0, y: 0, width: 1, height: 1 }, transform: { scale: 0.65, centerX: 0.5, centerY: 0.9, rotationDegrees: -90 }, captionWidth: 0.84 }, true],
      ["insert_dynamic_asset", { request: { assetId: "lamp", assetRevision: 1, instanceId: "icon", attachments: [{ elementId: "icon--lamp", relativeTo: "keyword", placement: "right", gap: 0.02, offsetX: 0, offsetY: 0, referenceBounds: "text_box", followMotion: true }] } }, "/insert", { assetId: "lamp", assetRevision: 1, instanceId: "icon", attachments: [{ elementId: "icon--lamp", relativeTo: "keyword", placement: "right", gap: 0.02, offsetX: 0, offsetY: 0, referenceBounds: "text_box", followMotion: true }] }, true],
      ["insert_dynamic_asset", { request: { assetId: "impact", assetRevision: 1, instanceId: "fit", placement: { x: 0.1, y: 0.5, width: 0.8, height: 0.4 } } }, "/insert", { assetId: "impact", assetRevision: 1, instanceId: "fit", placement: { x: 0.1, y: 0.5, width: 0.8, height: 0.4 } }, true],
    ]) {
      globalThis.fetch = async (url, init) => {
        assert.ok(url.endsWith(`/templates/dynamic-assets${path}`));
        assert.equal(init.method, body === undefined ? "GET" : "POST");
        assert.deepEqual(init.body ? JSON.parse(init.body) : undefined, body);
        return Response.json({ error: "revision_conflict" }, { status: 400 });
      };
      const tool = tools.get(name);
      assert.equal(tool.definition.annotations.readOnlyHint, readOnly);
      const result = await tool.call(args);
      assert.equal(result.isError, true);
      assert.equal(JSON.parse(result.content[0].text).error, "revision_conflict");
    }
  } finally { globalThis.fetch = previous; }
});

test("placement advice carries exact caller timing evidence and preserves incomplete/failed coverage", async () => {
  const tools = new Map();
  registerTemplateTools({ registerTool: (name, definition, call) => tools.set(name, { definition, call }) });
  const tool = tools.get("advise_dynamic_asset_placement");
  const previous = globalThis.fetch;
  try {
    for (const status of ["passed", "failed", "partial", "not_provided", "unscoped", "requires_candidate_measurement"]) {
      const samples = ["short", "long"].map((id, index) => ({
        id, elementId: "headline", lineCount: index + 1, fontSizePx: 32, overflowing: false,
        ...(status === "not_provided" || (status === "partial" && index === 1) ? {} : {
          timing: { stableSeconds: status === "failed" && index === 0 ? 0.1 : 2, requiredStableSeconds: 1.5 },
        }),
      }));
      const application = { assetId: "caption", assetRevision: 5 };
      const sample = { inputId: "input-one", transcriptRevision: 2, title: "Reviewed content" };
      const request = { application, sample, protectedRegions: [], readingCheck: { ...(status === "unscoped" ? {} : {scope: {application, sample}}), maxLines: 3, minFontSizePx: 28, samples } };
      const native = { selectedId: status === "failed" ? null : "left", readingCheck: {
        status: status === "not_provided" ? "passed" : status,
        currentApplicationEvidence: !["unscoped", "requires_candidate_measurement"].includes(status),
        participatesInGate: status !== "unscoped",
        timingCheck: { status, providedSamples: samples.filter(s => s.timing).length, reviewedSamples: 2, missingSampleIds: samples.filter(s => !s.timing).map(s => s.id) },
        findings: status === "failed" ? [{sampleId: "short", reasons: ["stable_time_too_short"], timing: samples[0].timing}] : [],
      }};
      globalThis.fetch = async (url, init) => {
        assert.ok(url.endsWith("/templates/dynamic-assets/placement-advice"));
        assert.deepEqual(JSON.parse(init.body), request);
        return Response.json(native);
      };
      const result = await tool.call({request});
      assert.notEqual(result.isError, true);
      assert.deepEqual(JSON.parse(result.content[0].text), native);
    }
    globalThis.fetch = async () => Response.json({error:"invalid stable reading time or required duration"},{status:400});
    const invalid = await tool.call({request:{application:{assetId:"caption",assetRevision:5},protectedRegions:[],readingCheck:{maxLines:3,minFontSizePx:28,samples:[{id:"bad",elementId:"headline",lineCount:1,fontSizePx:32,overflowing:false,timing:{stableSeconds:-1,requiredStableSeconds:0}}]}}});
    assert.equal(invalid.isError,true);
    assert.equal(JSON.parse(invalid.content[0].text).error,"invalid stable reading time or required duration");
  } finally { globalThis.fetch = previous; }
});

test("measured size binding survives layer edits and host insertion without losing independent axes", async () => {
  const tools = new Map();
  registerTemplateTools({registerTool:(name,definition,call)=>tools.set(name,{definition,call})});
  const previous = globalThis.fetch;
  const relation={elementId:"ring--outer",relativeTo:"headline",placement:"overlay",referenceBounds:"text_box",followMotion:true,gap:0,offsetX:0,offsetY:0,sizeBinding:{width:{factor:1.45,padding:0.01},height:{factor:1.3,padding:0.02}}};
  try {
    for(const [name,path,request] of [
      ["edit_dynamic_asset_layers","/layers",{definition:{id:"draft"},operation:{kind:"spatial_relation",layerId:relation.elementId,relation}}],
      ["insert_dynamic_asset","/insert",{assetId:"rings",assetRevision:3,instanceId:"ring",attachments:[relation]}],
    ]) {
      globalThis.fetch=async(url,init)=>{
        assert.ok(url.endsWith(path));assert.deepEqual(JSON.parse(init.body),request);
        return Response.json({relation});
      };
      const response=await tools.get(name).call({request});
      assert.deepEqual(JSON.parse(response.content[0].text).relation,relation);
    }
  } finally { globalThis.fetch=previous; }
});

test("native star geometry is discoverable and transported without rewriting",async()=>{
 const tools=new Map();registerTemplateTools({registerTool:(name,definition,call)=>tools.set(name,{definition,call})});
 const old=globalThis.fetch,definition={id:"star",revision:2,layers:[{content:{kind:"element",element:{id:"shape",features:{representation:"star"},starGeometry:{points:4,depth:18}}}}]};
 try{
  for(const starGeometry of [{points:4,depth:18},null]){
   const request={definition,operation:{kind:"star_geometry",layerId:"shape",starGeometry}};
   globalThis.fetch=async(url,init)=>{assert.ok(url.endsWith('/layers'));assert.deepEqual(JSON.parse(init.body),request);return Response.json({definition});};
   const result=await tools.get('edit_dynamic_asset_layers').call({request});assert.deepEqual(JSON.parse(result.content[0].text).definition,definition);
  }
  globalThis.fetch=async()=>Response.json({error:"star depth must be finite and between 1 and 99"},{status:400});
  const result=await tools.get('edit_dynamic_asset_layers').call({request:{definition,operation:{kind:'star_geometry',layerId:'shape',starGeometry:{points:4,depth:100}}}});assert.equal(result.isError,true);
  assert.match(tools.get('dynamic_asset_schema').definition.description,/starGeometryCapabilities/);assert.match(tools.get('edit_dynamic_asset_layers').definition.description,/star_geometry/);
  assert.match(tools.get('add_template_element').definition.description,/representation: text\|rectangle\|ellipse\|line\|star/);
  assert.match(tools.get('edit_dynamic_asset_layers').definition.description,/add \(representation text\|rectangle\|ellipse\|line\|star/);
  assert.match(tools.get('edit_dynamic_asset_layers').definition.description,/sizeBinding:.*rectangle\/ellipse\/line\/star dimensions/);
  assert.match(tools.get('insert_dynamic_asset').definition.description,/sizeBinding:.*rectangle\/ellipse\/line\/star leaves/);
  assert.match(tools.get('edit_dynamic_asset_media').definition.description,/converts a rectangle or ellipse to media/);
 }finally{globalThis.fetch=old;}
});

test("rectangle geometry capability and full drafts pass through without local reinterpretation", async () => {
  const tools = new Map();
  registerTemplateTools({ registerTool: (name, definition, call) => tools.set(name, { definition, call }) });
  const previous = globalThis.fetch;
  const definition = {
    id: "rectangle", revision: 2, name: "Unsaved rectangle title",
    layers: [{ content: { kind: "element", element: {
      id: "shape", features: { representation: "rectangle", outline: true },
      rectangleGeometry: { cornerRadius: 18 }, motions: [{ property: "scale", keys: [{ time: 0, value: 1 }] }],
    } } }],
    spatialRelations: [{ elementId: "shape", relativeTo: "text", sizeBinding: { width: { factor: 1.1, padding: 0 } } }],
  };
  try {
    for (const rectangleGeometry of [{ cornerRadius: 0 }, { cornerRadius: 12.5 }, { cornerRadius: 50 }, null]) {
      const request = { definition, operation: { kind: "rectangle_geometry", layerId: "shape", rectangleGeometry } };
      globalThis.fetch = async (url, init) => {
        assert.ok(url.endsWith("/dynamic-assets/layers"));
        assert.deepEqual(JSON.parse(init.body), request);
        return Response.json({ definition, selectedLayerId: "shape" });
      };
      const result = await tools.get("edit_dynamic_asset_layers").call({ request });
      assert.deepEqual(JSON.parse(result.content[0].text).definition, definition);
    }
    for (const request of [
      { definition, operation: { kind: "rectangle_geometry", layerId: "shape", rectangleGeometry: { cornerRadius: 51 } } },
      { definition, operation: { kind: "rectangle_geometry", layerId: "text", rectangleGeometry: { cornerRadius: 18 } } },
    ]) {
      globalThis.fetch = async (_url, init) => {
        assert.deepEqual(JSON.parse(init.body), request);
        return Response.json({ error: "rectangle geometry requires a rectangle and cornerRadius 0..50" }, { status: 400 });
      };
      const result = await tools.get("edit_dynamic_asset_layers").call({ request });
      assert.equal(result.isError, true);
      assert.match(JSON.parse(result.content[0].text).error, /cornerRadius 0\.\.50/);
    }
    const native = { rectangleGeometryCapabilities: { geometryField: "rectangleGeometry", cornerRadius: { minimum: 0, maximum: 50 }, animationSupported: false } };
    globalThis.fetch = async (url, init) => {
      assert.ok(url.endsWith("/dynamic-assets/schema"));
      assert.equal(init?.body, undefined);
      return Response.json(native);
    };
    const discovery = await tools.get("dynamic_asset_schema").call({});
    assert.deepEqual(JSON.parse(discovery.content[0].text), native);
    assert.match(tools.get("dynamic_asset_schema").definition.description, /rectangleGeometryCapabilities/);
    assert.match(tools.get("dynamic_asset_schema").definition.description, /actual rectangle shorter side/);
    assert.match(tools.get("edit_dynamic_asset_layers").definition.description, /rectangle_geometry/);
  } finally { globalThis.fetch = previous; }
});

test("generic placement rules and evidence decisions pass through the AI contract",async()=>{
 const tools=new Map();registerTemplateTools({registerTool:(name,definition,call)=>tools.set(name,{definition,call})});
 const tool=tools.get("advise_dynamic_asset_placement"),previous=globalThis.fetch;
 const request={application:{assetId:"style",assetRevision:4},protectedRegions:[{id:"subject",region:{x:.4,y:.2,width:.3,height:.5}}],padding:.03,policy:{safeInset:.04,requireFullCoverage:true}};
 try {
  for(const decision of ["propose","skip","needs_evidence"]){
   const native={decision,selectedId:decision==="propose"?"auto-1":null,application:decision==="propose"?{...request.application,transform:{scale:1,centerX:.2,centerY:.5}}:null,geometryCheck:{status:"requires_render_measurement",placementCertified:false},search:{method:"obstacle_boundary_minimum_pixel_displacement",complete:true,evaluatedCenters:18}};
   globalThis.fetch=async(url,init)=>{assert.ok(url.endsWith('/placement-advice'));assert.deepEqual(JSON.parse(init.body),request);return Response.json(native);};
   const response=await tool.call({request});assert.deepEqual(JSON.parse(response.content[0].text),native);
  }
  assert.equal(tool.definition.annotations.readOnlyHint,true);
  assert.match(tool.definition.description,/requireFullCoverage/);assert.match(tool.definition.description,/minimal pixel displacement/);assert.match(tool.definition.description,/never placement certification/);
 } finally {globalThis.fetch=previous;}
});
