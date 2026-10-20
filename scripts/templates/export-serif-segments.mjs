import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const source='/Users/zhengwei/Downloads/serif-readable-real-2026-09-29',root='/Users/zhengwei/Downloads/serif-segments-20260929',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const raw=await r.text();assert.ok(r.ok,raw);return JSON.parse(raw);}
const original=JSON.parse(await fs.readFile(source+'/designs.json'));const application=JSON.parse(await fs.readFile(source+'/application.json'));
const {definition}=await api('/dynamic-assets/'+application.assetId);assert.equal(definition.revision,application.assetRevision);
const {template}=await api('/dynamic-assets/application',application);template.id='serif-segmentation-comparison-20260929';
const revised=original.samples.map((sample,index)=>{const next=structuredClone(sample);delete next.captionSpans;next.captionPolicy={maxCharacters:index===3?16:42,maxPhraseSeconds:3.2,maxCharactersPerSecond:index===3?8:20,pauseBoundarySeconds:.32};return next;});
const reports=[];
for(const [label,samples]of [['before',original.samples],['after',revised]]){
 const folder=root+'/'+label;await fs.mkdir(folder,{recursive:true});
 const selected=structuredClone(template);selected.id+='-'+label;
 for(const sample of samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
 const validation=await api('/samples/validate',{template:selected,samples});
 const designs=[{template:selected,baseRevision:0}],manifest={name:'宋体字幕 · 实测词分段 '+label,brief:'Same saved serif r3 and application. Original manual spans versus measured-word segmentation with explicit Chinese/English budgets. No voice, words, source framing, semantic emphasis or typography change. No listening or aesthetic certification.',previewOnly:true,designs,samples,idempotencyKey:'serif-segments-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 for(const [name,data]of Object.entries({application,asset:definition,designs:manifest,validation}))await fs.writeFile(folder+'/'+name+'.json',JSON.stringify(data,null,2));
 const batch=await api('/production/author',manifest);await fs.writeFile(folder+'/submission.json',JSON.stringify(batch,null,2));reports.push({label,batchId:batch.id});await fs.writeFile(root+'/manifest.json',JSON.stringify(reports,null,2));console.log(batch.id);
}
assert.deepEqual((await api('/dynamic-assets/'+definition.id)).definition,definition);
