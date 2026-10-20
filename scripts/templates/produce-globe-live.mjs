import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/globe-decoration-20260929',base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(body)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const definition=(await api('/dynamic-assets/style-study-20260929-globe')).definition;assert.deepEqual(definition,JSON.parse(await fs.readFile(root+'/definition.json')));
const samples=[],advice=[];
for(const n of [1,2]){
 const f=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/placement-advice-20260929/fixture-'+n+'.json'));
 const spans=n===1?[null,{startWord:14,endWord:18},null,null]:[{startWord:2,endWord:4},null,{startWord:19,endWord:21},null];
 f.sample.semanticUnits.forEach((u,i)=>{u.keyword=spans[i];u.rationale='Agent selected explicit Earth/home-planet references; unrelated units intentionally have no icon keyword. Keep measured word times.'});
 const request={...f.request,application:{...f.request.application,assetId:definition.id,assetRevision:definition.revision,transform:{scale:.32,centerX:.82,centerY:.3}}};
 const a=await api('/dynamic-assets/placement-advice',request);assert.ok(a.application,'No clear position');samples.push(f.sample);advice.push(a);await fs.writeFile(root+'/live-'+n+'.json',JSON.stringify({request,advice:a,sample:f.sample},null,2));
}
assert.deepEqual(advice[0].template,advice[1].template);const designs=[{template:advice[0].template,baseRevision:0}];
const manifest={name:'地球科普 · 实拍语义应用',brief:'Editable schematic globe on two existing Earth science clips, only Agent-selected explicit Earth references. Native position advice uses manually inspected protection boxes. Not an automatic semantic or face detector, and not a geographic/scientific scale model.',previewOnly:true,designs,samples,idempotencyKey:'globe-live-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};await fs.writeFile(root+'/manifest.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({batchId:batch.id}));
