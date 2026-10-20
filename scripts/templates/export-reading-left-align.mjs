import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const base='http://127.0.0.1:3000/api/footage/templates',root='/Users/zhengwei/Downloads/reading-left-align-real-20260929';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const reports=[];
for(const [key,source,id,revision] of [['adaptive','adaptive-compact-real-2026-09-29','style-pilot-20260923-adaptive',6],['marker','marker-refine-r4-2026-09-29','style-pilot-20260923-marker',5]]){
 const previous='/Users/zhengwei/Downloads/'+source,{definition}=await api('/dynamic-assets/'+id);assert.equal(definition.revision,revision);
 const expected=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/reading-left-align-20260929/'+id+'-after.json'));assert.deepEqual(definition,expected);
 const {samples}=JSON.parse(await fs.readFile(previous+'/designs.json'));
 for(const sample of samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
 const application={...JSON.parse(await fs.readFile(previous+'/application.json')),assetRevision:revision};const {template}=await api('/dynamic-assets/application',application);template.id='reading-left-'+key+'-20260929';
 const validation=await api('/samples/validate',{template,samples});const designs=[{template,baseRevision:0}];
 const manifest={name:definition.name+' · 左对齐实测对照',brief:'User-requested left alignment. Exact current saved style and prior application/sample inputs; original measured words, audio and framing retained. Independent preview exports, not a 90-point or listening claim.',previewOnly:true,designs,samples,idempotencyKey:'reading-left-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 const folder=root+'/'+key;await fs.mkdir(folder,{recursive:true});for(const [name,data] of Object.entries({asset:definition,application,designs:manifest,validation}))await fs.writeFile(folder+'/'+name+'.json',JSON.stringify(data,null,2));
 const batch=await api('/production/author',manifest);await fs.writeFile(folder+'/submission.json',JSON.stringify(batch,null,2));reports.push({key,source:previous,root:folder,batchId:batch.id,samples:samples.length});console.log(JSON.stringify(reports.at(-1)));
}
await fs.writeFile(root+'/manifest.json',JSON.stringify(reports,null,2));
