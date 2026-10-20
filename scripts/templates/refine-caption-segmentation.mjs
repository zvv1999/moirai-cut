import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/caption-segmentation-20260929',prior='/Users/zhengwei/Downloads/caption-saved-20260929';
const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const original=JSON.parse(await fs.readFile(prior+'/designs.json','utf8'));
const style=JSON.parse(await fs.readFile(prior+'/style.json','utf8'));assert.deepEqual((await api('/dynamic-assets/'+style.id)).definition,style);
const designs=structuredClone(original.designs),t=designs[0].template;t.id='composition-caption-segmentation-trial';t.name='清晰逐词字幕 · 声音分段对照';
const samples=structuredClone(original.samples);
for(const s of samples){assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);s.captionSpans=[];s.captionPolicy={...t.segmentation,maxCharacters:32};}
const manifest={name:t.name,brief:'Preview-only: regenerate caption display spans using per-sound 32-character policy. Preserve saved style v1, source framing, semantic units and all measured words. Compare occlusion and short-cue readability; no inherited score.',previewOnly:true,designs,samples,idempotencyKey:'caption-segmentation-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.copyFile(prior+'/application.json',root+'/application.json');await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));const b=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(b,null,2));console.log(JSON.stringify({root,batchId:b.id,renderJob:b.renderJob}));
