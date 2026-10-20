// One authored effect rule, applied unchanged across all source samples.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/echo-effect-rule-20260929';
const base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=JSON.parse(await fs.readFile(root+'/before.json'));
const candidate=(await api('/dynamic-assets/inspect',JSON.parse(await fs.readFile(root+'/candidate.json')))).definition;
const reports=[];
for(const durationSeconds of [.125,.45,1.4,4]){
 const previews=[];
 for(const definition of [before,candidate])previews.push(await api('/dynamic-assets/preview',{definition,inputs:{},durationSeconds,example:{text:'把复杂的事情讲清楚',keyword:'把复杂的事情讲清楚'}}));
 const groups=previews.map(p=>p.tracks.overlay.flatMap(t=>t.elements));const old=groups[0].find(e=>e.params['template.elementId']==='headline'),main=groups[1].find(e=>e.params['template.elementId']==='headline');
 assert.deepEqual([old.params.content,old.startTime,old.duration],[main.params.content,main.startTime,main.duration]);assert.equal(groups[1].length,3);
 const canonical=keys=>keys.map(({id,...key})=>key);
 for(const e of groups[1]){
  assert.deepEqual([e.params.content,e.startTime,e.duration],[main.params.content,main.startTime,main.duration]);
  for(const key of ['fontSize','fontFamily','fontWeight','text.maxLines','text.maxWidth','text.maxHeight'])assert.equal(e.params[key],main.params[key]);
  for(const key of ['transform.scaleX','transform.scaleY'])assert.deepEqual(canonical(e.animations[key].keys),canonical(main.animations[key].keys));
  for(const track of Object.values(e.animations))assert.ok(track.keys.every(k=>k.time>=0&&k.time<=e.duration));
 }
 const settle=main.animations['transform.scaleX'].keys.find(k=>k.value===1).time/120000;
 const ghost=groups[1].find(e=>e.params['template.elementId']==='echo-right');const clear=ghost.animations.opacity.keys.find((k,i)=>i>0&&k.value===0).time/120000;
 if(main.duration/120000>=.2){assert.ok(Math.abs(settle-.1)<1e-5);assert.ok(Math.abs(clear-.16)<1e-5);}
 reports.push({durationSeconds,eventSeconds:main.duration/120000,settleSeconds:settle,ghostClearSeconds:clear,identicalTypographyAndScale:true});
 await fs.writeFile(root+'/duration-'+durationSeconds+'.json',JSON.stringify(previews[1],null,2));
}
await fs.writeFile(root+'/rule-verification.json',JSON.stringify({passed:true,reports,syntheticTimes:true},null,2));
const current=(await api('/dynamic-assets/'+before.id)).definition;
let saved;
const application={assetId:before.id,assetRevision:3,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.65,centerX:.22,centerY:.18}};
let oldTemplate;
if(current.revision===3){
 assert.deepEqual(current,before);
 oldTemplate=(await api('/dynamic-assets/application',application)).template;
 await fs.writeFile(root+'/before-template.json',JSON.stringify(oldTemplate,null,2));
 saved=(await api('/dynamic-assets',{definition:candidate,baseRevision:3,idempotencyKey:'echo-rule-v4-'+createHash('sha256').update(JSON.stringify(candidate)).digest('hex')})).definition;
}else{
 assert.equal(current.revision,4,'Do not overwrite subsequent edits');
 assert.deepEqual({...current,revision:3},candidate);saved=current;
 oldTemplate=JSON.parse(await fs.readFile(root+'/before-template.json'));
}
assert.equal(saved.revision,4);await fs.writeFile(root+'/saved.json',JSON.stringify(saved,null,2));
application.assetRevision=4;
const template=(await api('/dynamic-assets/application',application)).template;
oldTemplate.id='echo-shared-rule-20260929-before';template.id='echo-shared-rule-20260929-after';
const samples=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/cyan-natural-real-2026-09-29/designs.json')).samples;
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const designs=[{template:oldTemplate,baseRevision:0},{template,baseRevision:0}];
const request={name:'消散重影 · 同一规则跨文案与声音',brief:'Saved reusable r4 versus r3. One application and unchanged four input annotations. Shared scale clock across all text layers, opposed chromatic echoes clear at 160ms, headline settles at 100ms, 40ms exit. Native short-event compression. No per-sample style, layout or animation edits. Three English interviews plus Chinese measured audio. Original framing and audio preserved; aesthetic acceptance pending.',previewOnly:true,designs,samples,idempotencyKey:'echo-shared-rule-20260929-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.writeFile(root+'/application.json',JSON.stringify(application,null,2));await fs.writeFile(root+'/designs.json',JSON.stringify(request,null,2));
const submission=await api('/production/author',request);await fs.writeFile(root+'/submission.json',JSON.stringify(submission,null,2));console.log(JSON.stringify({revision:4,batchId:submission.id,designs:2,samples:4}));
