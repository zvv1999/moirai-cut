import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/cyan-type-balance-20260929';
const api=async(path,body)=>{
 const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
 const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;
};
const prior=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/cyan-translucent-20260929/designs.json','utf8'));
const designs=structuredClone(prior.designs), template=designs[0].template;
template.id='composition-cyan-type-balance-trial';template.name='青色重点词 · 长短文案排版候选';
const element=template.elements.find(e=>e.id==='headline');
const style=template.styles.find(s=>s.id===element.styleId);
// Keep the anchor and width. Give two lines enough height at the authored size.
const centerY=element.region.y+element.region.height/2;
element.region.height=.27;element.region.y=centerY-element.region.height/2;
style.fontSize=64;style.lineHeight=1.12;
const samples=prior.samples;
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const manifest={name:template.name,brief:'Preview-only typography refinement. Preserve measured keyword timing, source video, center and width, pop/fade and translucent backing. Reduce excessive short-word size and provide a taller two-line region. Does not alter saved styles or count as a distinct design; requires visual review.',previewOnly:true,designs,samples,idempotencyKey:'cyan-type-balance-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);
await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));
console.log(JSON.stringify({batchId:batch.id,root}));
