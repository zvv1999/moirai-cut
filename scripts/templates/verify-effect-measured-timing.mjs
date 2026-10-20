import assert from "node:assert/strict";

const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
assert.ok(process.env.TEST_EFFECT_ID&&process.env.TEST_INPUT_IDS,"Set TEST_EFFECT_ID and comma-separated TEST_INPUT_IDS");
async function api(path,body) {
	const response=await fetch(`${base}/api/footage/templates${path}`,{method:body?"POST":"GET",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:body?JSON.stringify(body):undefined});
	const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;
}
const asset=await api(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`);
const reports=[];
for(const id of process.env.TEST_INPUT_IDS.split(",")) {
	const input=await api(`/inputs/${id}`);
	const template=asset.projection;
	const request={
		input:{template,words:input.transcript.words,durationSeconds:input.input.durationSeconds,title:"",translations:[],semanticUnits:[],captionSpans:[]},
		document:{version:31,revision:0,settings:{canvasSize:{width:template.canvas.width,height:template.canvas.height}},scenes:[{id:"validation",tracks:{main:{id:"main",type:"video",elements:[]},overlay:[],audio:[]}}]},
		sceneId:"validation",baseRevision:0,idempotencyKey:`measured-${id}`,startTimeSeconds:0,source:null,media:null,
	};
	const compiled=await api("/compile",request);
	assert.deepEqual(compiled.plan.words,input.transcript.words,"phase timing must not rewrite measured word times");
	const relative=structuredClone(request);
	for(const element of relative.input.template.elements)delete element.motionTiming;
	const baseline=await api("/compile",relative);
	const clips=compiled.document.scenes[0].tracks.overlay.flatMap((track)=>track.elements);
	const old=baseline.document.scenes[0].tracks.overlay.flatMap((track)=>track.elements);
	assert.ok(clips.length>0);assert.equal(clips.length,old.length);
	for(const clip of clips) {
		const previous=old.find((other)=>other.params["template.instanceId"]===clip.params["template.instanceId"]);
		assert.equal(clip.startTime,previous.startTime);
		assert.equal(clip.duration,previous.duration);
		const highlightKeys=(element)=>element.animations["text.highlightRange"].keys.map(({id,...key})=>key);
		assert.deepEqual(highlightKeys(clip),highlightKeys(previous),"active-word clock must stay aligned to speech");
		const keys=clip.animations.opacity.keys;
		assert.equal(keys[0].time,0);assert.ok(Math.abs(keys.at(-1).time-clip.duration)<=1);
		assert.ok(keys.every((key)=>key.time>=0&&key.time<=clip.duration+1));
		assert.ok(keys.every((key,index)=>!index||key.time>keys[index-1].time));
		if(clip.duration>=42000) {assert.equal(keys[1].time,24000);assert.ok(Math.abs(keys.at(-2).time-(clip.duration-18000))<=1);}
	}
	assert.deepEqual((await api(`/inputs/${id}`)).transcript,input.transcript);
	reports.push({inputId:id,transcriptRevision:input.transcript.revision,words:input.transcript.words.length,clips:clips.length,warnings:compiled.warnings});
}
assert.deepEqual(await api(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`),asset);
console.log(JSON.stringify({reports,passed:["measured word times unchanged","caption boundaries unchanged","active-word keys unchanged","fixed motion phases compile across real transcripts","input and effect records unchanged"],projectWritten:false,videoExported:false}));
