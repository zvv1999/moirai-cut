import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/offset-clearspace-20260929',source='/Users/zhengwei/Downloads/offset-multiline-real-20260929',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const raw=await r.text();assert.ok(r.ok,raw);return JSON.parse(raw);}
const {definition}=await api('/dynamic-assets/style-pilot-20260923-offset');assert.deepEqual(definition,JSON.parse(await fs.readFile(source+'/asset.json')));
const previous=JSON.parse(await fs.readFile(source+'/designs.json')),reports=[];
for(const [fixture,centerX]of [[0,.22],[1,.82],[2,.82]]){
 const folder=root+'/'+fixture;await fs.mkdir(folder,{recursive:true});const application=JSON.parse(await fs.readFile(source+'/application.json'));Object.assign(application.transform,{centerX,centerY:.18});
 const {template}=await api('/dynamic-assets/application',application);template.id='offset-clearspace-20260929-'+fixture;
 const samples=[previous.samples[fixture]],designs=[{template,baseRevision:0}],manifest={name:'双层花字 · 留白应用 '+fixture,brief:'Saved v5; move only application center to manually inspected empty upper area. Original frame, measured words and sound unchanged. No automatic avoidance or aesthetic score claimed.',previewOnly:true,designs,samples,idempotencyKey:'offset-clearspace-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 const validation=await api('/samples/validate',{template,samples});for(const [k,v]of Object.entries({asset:definition,application,designs:manifest,validation}))await fs.writeFile(folder+'/'+k+'.json',JSON.stringify(v,null,2));
 const batch=await api('/production/author',manifest);await fs.writeFile(folder+'/submission.json',JSON.stringify(batch,null,2));reports.push({fixture,folder,batchId:batch.id});await fs.writeFile(root+'/manifest.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.at(-1)));
}
