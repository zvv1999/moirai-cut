import { strict as assert } from "node:assert";
import test from "node:test";
import { registerTemplateTools } from "../template-workbench.mjs";

test("production tools preserve immutable requests, preview fingerprints and revisions",async()=>{
 const registered=new Map();registerTemplateTools({registerTool:(name,definition,call)=>registered.set(name,{definition,call})});
 const previous=globalThis.fetch;
 try {
  for(const [name,args,route,body] of [
   ["create_template_production",{request:{idempotencyKey:"batch",items:[]}},"/production",{idempotencyKey:"batch",items:[]}],
   ["read_template_production",{id:"batch"},"/production/batch",undefined],
   ["execute_template_production",{id:"batch"},"/production/batch/execute",{}],
   ["audit_template_production_item",{id:"batch",index:2,baseRevision:7},"/production/batch/items/2/audit",{baseRevision:7}],
   ["read_template_production_item",{id:"batch",index:2},"/production/batch/items/2",undefined],
   ["control_template_production",{id:"batch",action:"retry_failed"},"/production/batch/control",{action:"retry_failed"}],
   ["publish_template_production_item",{id:"batch",index:2,request:{baseRevision:7,previews:[{fixture:0,requestFingerprint:"exact",path:"/tmp/render.mp4"}]}},"/production/batch/items/2/publish",{baseRevision:7,previews:[{fixture:0,requestFingerprint:"exact",path:"/tmp/render.mp4"}]}],
  ]) {
   globalThis.fetch=async(url,init)=>{assert.ok(url.endsWith(route));assert.equal(init.method,body===undefined?"GET":"POST");assert.deepEqual(init.body?JSON.parse(init.body):undefined,body);return new Response(JSON.stringify({ok:true}));};
   assert.equal(registered.get(name).definition.annotations.readOnlyHint,body===undefined);
   assert.equal(JSON.parse((await registered.get(name).call(args)).content[0].text).ok,true);
  }
 }finally{globalThis.fetch=previous;}
});

test("repair and preference tools preserve native policies and audit revisions",async()=>{
 const registered=new Map();registerTemplateTools({registerTool:(name,definition,call)=>registered.set(name,{definition,call})});
 const previous=globalThis.fetch;
 try{
  for(const [name,path,request] of [
   ["repair_template_plan","/repair",{request:{document:{revision:7}},repair:{shortenElements:{visual:0.5},cutTransitions:["pair"]}}],
   ["record_template_preference","/preferences",{evaluationId:"evaluation",preferredId:0,rejectedId:1,reason:"review",idempotencyKey:"feedback",renderedPaths:{0:"/tmp/a.png",1:"/tmp/b.png"}}],
   ["retract_template_preference","/preferences/retract",{id:"feedback",baseRevision:1}],
  ]){
   globalThis.fetch=async(url,init)=>{assert.ok(url.endsWith(path));assert.deepEqual(JSON.parse(init.body),request);return new Response(JSON.stringify({ok:true}));};
   assert.equal(registered.get(name).definition.annotations.readOnlyHint,name==="repair_template_plan");
   assert.equal(JSON.parse((await registered.get(name).call({request})).content[0].text).ok,true);
  }
  globalThis.fetch=async(url,init)=>{assert.ok(url.endsWith("/preferences/test"));assert.equal(init.method,"GET");return new Response(JSON.stringify({active:false}));};
  assert.equal(JSON.parse((await registered.get("read_template_preference_profile").call({id:"test"})).content[0].text).active,false);
 }finally{globalThis.fetch=previous;}
});

test("preflight and complete plan evaluation forward exact context without project writes",async()=>{
	const registered=new Map();registerTemplateTools({registerTool:(name,definition,call)=>registered.set(name,{definition,call})});
	const previous=globalThis.fetch;const context={input:{events:[]},document:{revision:5},media:{asset:{id:"asset"}},baseRevision:5};
	try{for(const [name,path,request] of [["preflight_template","/preflight",context],["evaluate_template_plans","/evaluate",{request:context,maxCandidates:4,weights:{coverage:2}}]]){
		assert.equal(registered.get(name).definition.annotations.readOnlyHint,name==="preflight_template");
		globalThis.fetch=async(url,init)=>{assert.ok(url.endsWith(path));assert.deepEqual(JSON.parse(init.body),request);return new Response(JSON.stringify({executable:false,issues:[{code:"compile_rejected",message:"insufficient preroll"}]}));};
		const result=await registered.get(name).call({request});assert.equal(JSON.parse(result.content[0].text).issues[0].code,"compile_rejected");
	}}finally{globalThis.fetch=previous;}
});

test("ontology aliases use the authoritative native model", async () => {
	const registered = new Map();
	registerTemplateTools({ registerTool: (name, definition, call) => registered.set(name, { definition, call }) });
	const previous = globalThis.fetch;
	const urls = [];
	try {
		globalThis.fetch = async (url) => {
			urls.push(url);
			return new Response(JSON.stringify({ schemaVersion: "moirai.template.v2" }));
		};
		assert.equal(registered.get("read_template_ontology").definition.annotations.readOnlyHint, true);
		await registered.get("read_template_ontology").call({ id: "reference-01" });
		await registered.get("plan_template").call({ input: {}, format: "ontology" });
		await registered.get("plan_template").call({ input: {} });
		assert.ok(urls[0].endsWith("/templates/reference-01/ontology"));
		assert.ok(urls[1].endsWith("/templates/ontology/plan"));
		assert.ok(urls[2].endsWith("/templates/plan"));
	} finally { globalThis.fetch = previous; }
});

test("template transport preserves native errors and CAS payload", async () => {
	const registered = new Map();
	registerTemplateTools({
		registerTool: (name, definition, call) => {
			assert.ok(!registered.has(name), `Duplicate tool: ${name}`);
			registered.set(name, { definition, call });
		},
	});
	assert.ok(registered.has("save_template"));
	assert.ok(registered.has("preview_dynamic_asset_sample"));
	assert.ok(registered.has("duplicate_dynamic_asset"));
	const previous = globalThis.fetch;
	const body = {
		template: { id: "example" },
		baseRevision: 4,
		idempotencyKey: "stable-key",
	};
	try {
		globalThis.fetch = async (url, init) => {
			assert.ok(url.endsWith("/templates/save"));
			assert.equal(init.headers["x-requested-with"], "moirai-footage");
			assert.deepEqual(JSON.parse(init.body), body);
			return new Response(JSON.stringify({ error: "revision_conflict" }), {
				status: 409,
			});
		};
		const response = await registered.get("save_template").call(body);
		assert.equal(response.isError, true);
		assert.equal(
			JSON.parse(response.content[0].text).error,
			"revision_conflict",
		);
		globalThis.fetch = async () => {
			throw Error("service unavailable");
		};
		const failure = await registered.get("list_templates").call();
		assert.equal(failure.isError, true);
		assert.match(failure.content[0].text, /service unavailable/);
		globalThis.fetch = async () => new Response("Failed to buffer the request body: length limit exceeded", { status: 413 });
		const oversized = await registered.get("list_templates").call();
		assert.equal(oversized.isError, true);
		assert.match(oversized.content[0].text, /HTTP 413:.*length limit exceeded/);
	} finally {
		globalThis.fetch = previous;
	}
});

test("template application uses project CAS writer and verifies native readback", async () => {
	const registered = new Map();
	registerTemplateTools({ registerTool: (name, _definition, call) => registered.set(name, call) });
	const previous = globalThis.fetch;
	const request = { projectId: "project", sceneId: "scene", baseRevision: 7, idempotencyKey: "apply", startTimeSeconds: 0, input: {} };
	let written = false;
	let compilations = 0;
	try {
		globalThis.fetch = async (url, init = {}) => {
			if (url.endsWith("/templates/compile")) {
				compilations++;
				const body = JSON.parse(init.body);
				assert.equal(body.document.revision, written ? 8 : 7);
				return new Response(JSON.stringify({ document: { revision: 7, scenes: [] }, elementCount: 2, warnings: ["source_layout_not_applied"], deduplicated: written }));
			}
			assert.ok(url.endsWith("/api/projects/project"));
			if (init.method === "PUT") {
				assert.equal(init.headers["if-match"], "7");
				assert.equal(written, false);
				written = true;
				return new Response(JSON.stringify({ revision: 8 }));
			}
			return new Response(JSON.stringify({ revision: written ? 8 : 7 }));
		};
		const response = await registered.get("apply_template")(request);
		assert.equal(response.isError, undefined);
		const result = JSON.parse(response.content[0].text);
		assert.equal(result.verified, true);
		assert.equal(result.readbackRevision, 8);
		assert.equal(compilations, 2);
		assert.deepEqual(result.warnings, ["source_layout_not_applied"]);
	} finally { globalThis.fetch = previous; }
});

test("sound trimming forwards separated sound identity and native provenance", async () => {
	const registered = new Map();
	registerTemplateTools({ registerTool: (name, _definition, call) => registered.set(name, call) });
	const previous = globalThis.fetch;
	const request = { soundId: "reference-54-other-stem", startSeconds: 0.2, endSeconds: 0.5, name: "Excerpt", description: "Needs audition" };
	const sound = { id: "derived", status: "review", derivation: { parentSoundId: request.soundId, parentAudioSha256: "a".repeat(64), startSeconds: 0.2, endSeconds: 0.5 } };
	try {
		globalThis.fetch = async (url, init) => {
			assert.ok(url.endsWith("/sounds/clip"));
			assert.deepEqual(JSON.parse(init.body), request);
			return new Response(JSON.stringify(sound));
		};
		const result = await registered.get("clip_template_sound")(request);
		assert.equal(result.isError, undefined);
		assert.deepEqual(JSON.parse(result.content[0].text), sound);
	} finally { globalThis.fetch = previous; }
});

test("v2 default visual bindings resolve the project media catalog without application overrides", async () => {
    const registered=new Map();
    registerTemplateTools({registerTool:(name,_definition,call)=>registered.set(name,call)});
    const previous=globalThis.fetch;
    let mediaReads=0;
    const assets={image:{id:"image",type:"image",width:1080,height:1920}};
    try {
        globalThis.fetch=async(url,init={})=>{
            if(url.endsWith("/api/media/project")){mediaReads++;return new Response(JSON.stringify({assets}));}
            if(url.endsWith("/templates/compile")){
                assert.deepEqual(JSON.parse(init.body).media,assets);
                return new Response(JSON.stringify({deduplicated:true,elementCount:1,warnings:[]}));
            }
            assert.ok(url.endsWith("/api/projects/project"));
            return new Response(JSON.stringify({revision:2}));
        };
        const result=await registered.get("apply_template")({projectId:"project",sceneId:"scene",baseRevision:2,idempotencyKey:"replay",input:{template:{resourceSlots:[{id:"picture",representation:"image"}],resourceBindings:[{slotId:"picture",assetId:"image",enabled:true}]}}});
        assert.equal(result.isError,undefined);assert.equal(mediaReads,1);
    } finally {globalThis.fetch=previous;}
});

test("sound search preserves eligibility and assessment evidence", async () => {
	const registered = new Map();
	registerTemplateTools({ registerTool: (name, _definition, call) => registered.set(name, call) });
	const previous = globalThis.fetch;
	const request = { query: "A short click sound effect.", matchBy: "audio", kind: "sound_effect", includeReview: true, maxDurationSeconds: 1, limit: 5 };
	const response = { candidates: [{ sound: { id: "candidate", revision: 2, status: "review" }, canBind: false, assessment: { speechScore: 0.6 } }] };
	try {
		globalThis.fetch = async (url, init) => {
			assert.ok(url.endsWith("/sounds/search"));
			assert.deepEqual(JSON.parse(init.body), request);
			return new Response(JSON.stringify(response));
		};
		const result = await registered.get("search_template_sounds")(request);
		assert.deepEqual(JSON.parse(result.content[0].text), response);
	} finally { globalThis.fetch = previous; }
});

test("speech generation keeps source script and measured-transcription job", async () => {
	const registered = new Map();
	registerTemplateTools({ registerTool: (name, _definition, call) => registered.set(name, call) });
	const previous = globalThis.fetch;
	const request = { name: "配音", text: "先讲案例，再讲方法。", voiceId: "local-voice", speakingRate: 180 };
	const response = { synthesis: { request, input: { id: "input-a", durationSeconds: 3.2 } }, transcriptionJob: { id: "job", status: "queued" }, deduplicated: false };
	try {
		globalThis.fetch = async (url, init) => {
			assert.ok(url.endsWith("/tts/generate"));
			assert.deepEqual(JSON.parse(init.body), request);
			return new Response(JSON.stringify(response));
		};
		const result = await registered.get("generate_template_speech")(request);
		assert.deepEqual(JSON.parse(result.content[0].text), response);
	} finally { globalThis.fetch = previous; }
});
