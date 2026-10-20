import fs from 'node:fs/promises';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
const root='/Users/zhengwei/Downloads/checklist-refined-20260930',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
for(const [id,name,file]of [['style-study-20260929-checklist','行动清单 · 勾选确认','icon'],['style-study-20260929-checklist-headline','行动清单 · 方法花字','definition']]){
 const before=(await api('/dynamic-assets/'+id)).definition;assert.equal(before.revision,1,'Revision-aware refinement requires original reviewed version');
 const d=structuredClone(before);d.name=name;
 for(const l of d.layers){if(l.content.kind!=='element')continue;const e=l.content.element;
  if(e.id.startsWith('tick-')){e.motions=e.motions.map(m=>m.property==='opacity'?{property:'opacity',keys:[{time:0,value:0,easing:'ease_out'},{time:.3,value:1,easing:'linear'},{time:1,value:1,easing:'linear'}]}:m);e.motionTiming.enterSeconds=.08;}
  if(e.id==='headline'){e.region.x=.06;e.region.width=.88;}
 }
 if(file==='definition')d.styles.find(s=>s.id==='headline-style').fontSize=78;
 d.provenance+=' Revision 2: common 80ms simultaneous check reveal for concise events; no duration-specific condition or source retiming. Headline uses a wider reading budget and 78px type to preserve valid phrase groups.';
 const normalized=(await api('/dynamic-assets/inspect',d)).definition;
 const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:before.revision,idempotencyKey:'checklist-refine-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
 await fs.writeFile(root+'/'+file+'.json',JSON.stringify(saved,null,2));await fs.writeFile(root+'/'+file+'-before.json',JSON.stringify(before,null,2));console.log(saved.id,saved.revision);
}
