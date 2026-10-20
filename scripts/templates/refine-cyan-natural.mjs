import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/cyan-natural-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const original=(await api('/dynamic-assets/style-study-20260928-cyan-impact')).definition;assert.equal(original.revision,1);
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/original-v1.json',JSON.stringify(original,null,2));
const definition=structuredClone(original),e=definition.layers.find(l=>l.content.element?.id==='headline').content.element;
e.region={x:.06,y:.625,width:.88,height:.20};
e.features.role='emphasis';
e.motionTiming={enterEnd:.2,exitStart:.9,enterSeconds:.09,exitSeconds:.04};
e.motions=[
 {property:'opacity',keys:[{time:0,value:1,easing:'linear'},{time:.9,value:1,easing:'linear'},{time:1,value:0,easing:'linear'}]},
 {property:'scale',keys:[{time:0,value:.86,easing:'ease_out'},{time:.12,value:1.06,easing:'ease_out'},{time:.2,value:1,easing:'linear'},{time:1,value:1,easing:'linear'}]}
];
definition.provenance+=' Revision 2: restore natural letter proportions instead of x .90 / y 1.12, enlarge text region while preserving its center, use 90ms uniform pop and 40ms exit, full opacity at entry for short keywords. Retains editable cyan fill and dark outline. Pending same-input visual review; not reference fidelity certification.';
const normalized=(await api('/dynamic-assets/inspect',definition)).definition;
const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:1,idempotencyKey:'cyan-natural-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
assert.equal(saved.revision,2);await fs.writeFile(root+'/saved-v2.json',JSON.stringify(saved,null,2));console.log('Saved cyan r2');
