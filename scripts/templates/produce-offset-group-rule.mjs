// A shared two-layer opacity envelope; no text- or source-specific style branches.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/offset-group-rule-20260929';
const base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=JSON.parse(await fs.readFile(root+'/before.json'));
const candidate=(await api('/dynamic-assets/inspect',JSON.parse(await fs.readFile(root+'/candidate.json')))).definition;
const collect=es=>es.flatMap(e=>[e,...collect(e.renderGroup?.tracks.flatMap(t=>t.elements)??[])]);
const reports=[];
for(const durationSeconds of [.125,.45,1.4,4]){
 const data=await api('/dynamic-assets/preview',{definition:candidate,inputs:{},durationSeconds,example:{text:'把复杂的事情讲清楚',keyword:'把复杂的事情讲清楚'}});
 const old=await api('/dynamic-assets/preview',{definition:before,inputs:{},durationSeconds,example:{text:'把复杂的事情讲清楚',keyword:'把复杂的事情讲清楚'}});
 const es=collect(data.tracks.overlay.flatMap(t=>t.elements)),os=collect(old.tracks.overlay.flatMap(t=>t.elements));
 const group=es.find(e=>e.renderGroup),children=es.filter(e=>e.params['template.elementId']);assert.equal(children.length,2);assert.ok(group);
 for(const e of children){const previous=os.find(o=>o.params['template.elementId']===e.params['template.elementId']);assert.deepEqual([e.params.content,e.startTime,e.duration],[previous.params.content,previous.startTime,previous.duration]);assert.ok(!e.animations.opacity);for(const property of ['transform.scaleX','transform.scaleY','transform.rotate']){const strip=track=>track.keys.map(({id,...k})=>k);assert.deepEqual(strip(e.animations[property]),strip(previous.animations[property]));}}
 const k=group.animations.opacity.keys;assert.equal(k[0].value,1);assert.equal(k.at(-1).value,0);const enter=k.find(k=>k.value===1).time/120000,exit=(k.at(-1).time-k.findLast(k=>k.value===1).time)/120000;
 if(group.duration/120000>=.18){assert.ok(Math.abs(enter-0)<.00002);assert.ok(Math.abs(exit-.06)<.00002);}
 assert.ok(k.every(k=>k.time>=0&&k.time<=group.duration));reports.push({durationSeconds,eventSeconds:group.duration/120000,enter,exit,preservedTypographyAndMotion:true});
}
await fs.writeFile(root+'/rule-verification.json',JSON.stringify({passed:true,reports,syntheticTimes:true},null,2));
const application={assetId:before.id,assetRevision:5,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.65,centerX:.22,centerY:.18}};
const current=(await api('/dynamic-assets/'+before.id)).definition;let saved,oldTemplate;
oldTemplate=JSON.parse(await fs.readFile(root+'/before-template.json'));
if(current.revision===6){assert.deepEqual(current,JSON.parse(await fs.readFile(root+'/saved-v6.json')));saved=(await api('/dynamic-assets',{definition:candidate,baseRevision:6,idempotencyKey:'offset-group-v7-'+createHash('sha256').update(JSON.stringify(candidate)).digest('hex')})).definition;}
else{assert.equal(current.revision,7,'Refuse later edits');assert.deepEqual({...current,revision:6},candidate);saved=current;}
await fs.writeFile(root+'/saved.json',JSON.stringify(saved,null,2));application.assetRevision=7;
const template=(await api('/dynamic-assets/application',application)).template;oldTemplate.id='offset-group-rule-before-20260929';template.id='offset-group-rule-after-20260929';
const samples=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/cyan-natural-real-2026-09-29/designs.json')).samples;
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const designs=[{template:oldTemplate,baseRevision:0},{template,baseRevision:0}];
const request={name:'双层花字 · 整体入退场跨文案验证',brief:'Exact saved r5 versus r7 with one application. Isolated two-layer composition with separate active intervals and 60ms exit. Existing 120ms scale and tilt motion preserved. Same four inputs and annotations, no per-case motion changes. Placement is a controlled comparison, not obstruction acceptance.',previewOnly:true,designs,samples,idempotencyKey:'offset-group-rule-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.writeFile(root+'/application.json',JSON.stringify(application,null,2));await fs.writeFile(root+'/designs.json',JSON.stringify(request,null,2));const submission=await api('/production/author',request);await fs.writeFile(root+'/submission.json',JSON.stringify(submission,null,2));console.log(JSON.stringify({revision:saved.revision,batchId:submission.id}));
