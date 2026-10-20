import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const priorRoot='/Users/zhengwei/Downloads/caption-three-inputs-20260929';
const root='/Users/zhengwei/Downloads/caption-readability-20260929';
const api=async(path,body)=>{
 const response=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
 const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;
};
const prior=JSON.parse(await fs.readFile(priorRoot+'/designs.json','utf8'));
const designs=structuredClone(prior.designs),template=designs[0].template;
template.id='composition-caption-readability-trial';
template.name='逐词字幕 · 复杂背景可读性候选';
const style=template.styles.find(s=>s.id===template.elements.find(e=>e.id==='headline').styleId);
style.strokeWidth=1.4;
style.background='#101923';style.backgroundOpacity=.62;
style.backgroundPadding={x:14,y:7};
style.shadow={color:'#000000',opacity:.3,blur:3,x:0,y:1};
for(const sample of prior.samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
const manifest={name:template.name,brief:'Preview-only caption readability comparison. Preserve every measured cue, word highlight, placement and motion. Compare thinner stroke and translucent text backing over complex clothing. Not a new distinct qualified design; saved caption remains unchanged.',previewOnly:true,designs,samples:prior.samples,idempotencyKey:'caption-readability-'+createHash('sha256').update(JSON.stringify({designs,samples:prior.samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});
await fs.copyFile(priorRoot+'/application.json',root+'/application.json');
await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);
await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));
console.log(JSON.stringify({root,batchId:batch.id}));
