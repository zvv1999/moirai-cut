import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/note-readable-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const original=(await api('/dynamic-assets/style-study-20260924-note')).definition;assert.equal(original.revision,4);
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/original-v4.json',JSON.stringify(original,null,2));
const definition=structuredClone(original);
for(const layer of definition.layers){
 const e=layer.content.element;if(!e)continue;
 e.motionTiming={enterEnd:.2,exitStart:.8,enterSeconds:.07,exitSeconds:.03};
 const opacity=e.motions.find(m=>m.property==='opacity');
 if(opacity){const value=e.id==='paper-tape'?.9:1;opacity.keys=[{time:0,value,easing:'linear'},{time:.8,value,easing:'linear'},{time:1,value:0,easing:'linear'}];}
 if(e.features.representation==='text')e.features.role='emphasis';
}
for(const style of definition.styles.filter(s=>s.id!=='paper-tape-style'))style.backgroundPadding={x:20,y:14};
definition.provenance+=' Revision 5: full-opacity entry for text, backing and tape, retain synchronized rotated-paper settling with 70ms entrance and 30ms exit. Reduce paper padding 28/20 to 20/14 without reducing text size. Pending same-input checks; historical score not inherited.';
const normalized=(await api('/dynamic-assets/inspect',definition)).definition;
const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:4,idempotencyKey:'note-readable-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
assert.equal(saved.revision,5);await fs.writeFile(root+'/saved-v5.json',JSON.stringify(saved,null,2));console.log('Saved note r5');
