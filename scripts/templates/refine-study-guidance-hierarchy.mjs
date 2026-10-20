import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/study-guidance-hierarchy-2026-09-29',priorRoot='/Users/zhengwei/Downloads/study-guidance-published-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await api(''),assets=await api('/dynamic-assets'),saved=before.templates.find(t=>t.id==='composition-study-guidance-20260929');assert.equal(saved.revision,3);
const prior=JSON.parse(await fs.readFile(priorRoot+'/designs.json','utf8')),template=structuredClone(saved);
template.id='composition-study-guidance-hierarchy-trial';template.revision=0;template.name='学习讲解 · 强调层级优化试映';
const caption=template.elements.find(e=>e.id==='headline'),style=template.styles.find(s=>s.id===caption.styleId);Object.assign(style,{fontSize:42,weight:600,fill:'#E1E4EC',strokeWidth:0});
// A plain caption remains the reading layer; the independent note carries emphasis.
const highlightIds=new Set(template.composition.treatments.filter(t=>t.operation.kind==='text_highlight').map(t=>t.id));
template.composition.applications=template.composition.applications.filter(a=>!(a.target.kind==='element'&&a.target.id==='headline'&&highlightIds.has(a.treatmentId)));
template.composition.treatments=template.composition.treatments.filter(t=>!highlightIds.has(t.id)||template.composition.applications.some(a=>a.treatmentId===t.id));
const slot=template.resourceSlots.find(s=>s.id==='study--artwork');slot.description='主题场景插画 · 可按输入替换';slot.tags=['IRA Design','MIT','illustration','主题场景','透明'];
const samples=structuredClone(prior.samples),overrides=[null,'visual-a5f1a85376a8c5345699868aa968ec4d4881b70ff74e8fd98d2f6e29a5e04386','visual-b8186a280d242b5fc9ccc125e706d86b05273249169bc864109b4d8433930665'];
for(const [i,assetId] of overrides.entries())if(assetId)samples[i].resourceBindings=[{slotId:slot.id,assetId,enabled:true}];
for(const sample of samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
const designs=[{template,baseRevision:0}],manifest={name:template.name,brief:'Reduce caption size/weight and remove duplicate keyword coloring; paper note remains the accent. Use a desk illustration for planning and a two-person desk illustration for collaboration via input-level asset bindings. Existing MIT assets, not AI generated. Independent preview-only trial, no score transfer from saved v3.',previewOnly:true,designs,samples,idempotencyKey:'study-guidance-hierarchy-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/baseline-template.json',JSON.stringify(saved,null,2));await fs.copyFile(priorRoot+'/application.json',root+'/application.json');
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));assert.deepEqual(await api(''),before);assert.deepEqual(await api('/dynamic-assets'),assets);console.log(JSON.stringify({batchId:batch.id,root}));
