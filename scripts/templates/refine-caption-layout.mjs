import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const priorRoot='/Users/zhengwei/Downloads/caption-readability-20260929';
const root='/Users/zhengwei/Downloads/caption-layout-20260929';
const api=async(path,body)=>{
 const response=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
 const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;
};
const prior=JSON.parse(await fs.readFile(priorRoot+'/designs.json','utf8'));
const designs=structuredClone(prior.designs),template=designs[0].template;
template.id='composition-caption-layout-trial';
template.name='逐词字幕 · 收窄排版候选';
const element=template.elements.find(e=>e.id==='headline');
const centerX=element.region.x+element.region.width/2;
const centerY=element.region.y+element.region.height/2;
element.region={x:centerX-.68/2,y:centerY-.18/2,width:.68,height:.18};
for(const sample of prior.samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
const manifest={name:template.name,brief:'Preview-only content wrapping improvement: narrow caption region to 68% of frame width and provide 18% height for two lines. Preserve appearance, measured words, cue timing, highlight and motion. Not a distinct qualified design.',previewOnly:true,designs,samples:prior.samples,idempotencyKey:'caption-layout-'+createHash('sha256').update(JSON.stringify({designs,samples:prior.samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});
await fs.copyFile(priorRoot+'/application.json',root+'/application.json');
await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);
await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));
console.log(JSON.stringify({root,batchId:batch.id}));
