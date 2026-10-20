import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/study-guidance-sections-2026-09-29',priorRoot='/Users/zhengwei/Downloads/study-guidance-spacing-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const library=await api(''),manifest=JSON.parse(await fs.readFile(priorRoot+'/designs.json','utf8')),t=manifest.designs[0].template;
const art=t.elements.find(e=>e.id==='study--decoration');art.timing.anchor='semantic_start';art.motions=[];art.intents=['neutral','hook','question','contrast','list','emphasis','explanation','conclusion','call_to_action'];art.description='主题插画 · 随语义段落保持';
const planning=structuredClone(art);planning.id='study--planning';planning.intents=['metric'];planning.resourceId='planning--artwork';planning.description='安排时间 · 办公场景';t.elements.push(planning);
t.resourceSlots.push({id:planning.resourceId,description:'安排与时间提示的场景插画',representation:'image',tags:['IRA Design','MIT','工作','透明']});
t.resourceBindings.push({slotId:planning.resourceId,assetId:'visual-a5f1a85376a8c5345699868aa968ec4d4881b70ff74e8fd98d2f6e29a5e04386',enabled:true});
for(const e of [art,planning])t.composition.scheduling.push({elementId:e.id,eventKind:'semantic',endAtNextEvent:true,minConfidence:0,minStrength:0,cooldownSeconds:0,maxOccurrences:100,strengthWeight:0,confidenceWeight:1,repetitionPenalty:0});
t.id='composition-study-guidance-sections-trial';t.name='学习讲解 · 语义分段场景';manifest.name=t.name;manifest.brief='Use continuous semantic intervals for scene artwork: primary topic scene for non-metric units, office planning scene for metric time expressions. Measured semantic boundaries, hold through pauses until next semantic event, no fixed timeline. Direct cuts and constant artwork position avoid repeated entrances. Input intents remain Agent-authored. Independent preview-only trial; no aesthetic score transfer.';
manifest.idempotencyKey='study-guidance-sections-'+createHash('sha256').update(JSON.stringify({designs:manifest.designs,samples:manifest.samples})).digest('hex');
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.copyFile(priorRoot+'/application.json',root+'/application.json');const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));assert.deepEqual(await api(''),library);console.log(JSON.stringify({batchId:batch.id,root}));
