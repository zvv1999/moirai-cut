import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/study-guidance-spacing-2026-09-29',priorRoot='/Users/zhengwei/Downloads/study-guidance-hierarchy-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await api(''),manifest=JSON.parse(await fs.readFile(priorRoot+'/designs.json','utf8'));
const t=manifest.designs[0].template,art=t.elements.find(e=>e.id==='study--decoration');
const width=art.region.width*.9,height=art.region.height*.9;art.region={x:(1-width)/2,y:.4-height/2,width,height};
t.id='composition-study-guidance-spacing-trial';t.name='学习讲解 · 插画留白优化试映';manifest.name=t.name;manifest.brief='Keep the hierarchy trial and three input-specific illustrations, reduce the shared artwork region by 10% and move its center from .43 to .40 to separate visible artwork from paper tape. No changes to sound, semantic timing, captions, notes or title. Preview-only; no rating transfer.';
manifest.idempotencyKey='study-guidance-spacing-'+createHash('sha256').update(JSON.stringify({designs:manifest.designs,samples:manifest.samples})).digest('hex');
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.copyFile(priorRoot+'/application.json',root+'/application.json');
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));assert.deepEqual(await api(''),before);console.log(JSON.stringify({batchId:batch.id,root}));
