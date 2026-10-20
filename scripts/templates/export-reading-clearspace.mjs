import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const base='http://127.0.0.1:3000/api/footage/templates',root='/Users/zhengwei/Downloads/reading-clearspace-20260929',previous='/Users/zhengwei/Downloads/reading-left-align-real-20260929';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const reports=[];
for(const [key,indexes,centerX,centerY] of [['adaptive',[1],.82,.18],['marker',[0,1,2],.22,.18]]){
 const source=previous+'/'+key,old=JSON.parse(await fs.readFile(source+'/designs.json')),application=JSON.parse(await fs.readFile(source+'/application.json')),samples=indexes.map(i=>old.samples[i]);
 const {definition}=await api('/dynamic-assets/'+application.assetId);assert.deepEqual(definition,JSON.parse(await fs.readFile(source+'/asset.json')));
 Object.assign(application.transform,{centerX,centerY});const {template}=await api('/dynamic-assets/application',application);template.id='reading-clearspace-'+key+'-20260929';
 const designs=[{template,baseRevision:0}],manifest={name:definition.name+' · 留白位置试映',brief:'Same saved left-aligned style, measured content, original audio and source framing. Move only the application to observed empty space: right upper area for solar backdrop, left upper area for interview marker. These explicit placements are not automatic scene avoidance. Preview-only, no score or listening claim.',previewOnly:true,designs,samples,idempotencyKey:'reading-clearspace-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 const validation=await api('/samples/validate',{template,samples}),folder=root+'/'+key;await fs.mkdir(folder,{recursive:true});for(const [name,data]of Object.entries({asset:definition,application,designs:manifest,validation}))await fs.writeFile(folder+'/'+name+'.json',JSON.stringify(data,null,2));
 const batch=await api('/production/author',manifest);await fs.writeFile(folder+'/submission.json',JSON.stringify(batch,null,2));reports.push({key,source,root:folder,batchId:batch.id,fixtureMap:indexes,samples:samples.length});console.log(JSON.stringify(reports.at(-1)));
}
await fs.writeFile(root+'/manifest.json',JSON.stringify(reports,null,2));
