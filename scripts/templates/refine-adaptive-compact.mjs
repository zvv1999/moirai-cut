import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/adaptive-compact-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const original=(await api('/dynamic-assets/style-pilot-20260923-adaptive')).definition;assert.equal(original.revision,4);
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/original-v4.json',JSON.stringify(original,null,2));
const definition=structuredClone(original),e=definition.layers.find(l=>l.content.element?.id==='headline').content.element;
Object.assign(definition.styles[0],{fontSize:68,backgroundPadding:{x:14,y:8}});
e.motionTiming={enterEnd:.2,exitStart:.8,enterSeconds:.04,exitSeconds:.04};
e.motions=[{property:'opacity',keys:[{time:0,value:0,easing:'ease_out'},{time:.2,value:1,easing:'linear'},{time:.8,value:1,easing:'ease_in'},{time:1,value:0,easing:'linear'}]}];
definition.provenance+=' Revision 5: reduce type 76 to 68 and backing padding 20/10 to 14/8, remove lateral settle, use 40ms entry/exit opacity phases to soften hard cuts while preserving short-word hold. Pending same-input comparison; prior score not inherited.';
const normalized=(await api('/dynamic-assets/inspect',definition)).definition;
const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:4,idempotencyKey:'adaptive-compact-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
assert.equal(saved.revision,5);await fs.writeFile(root+'/saved-v5.json',JSON.stringify(saved,null,2));console.log('Saved adaptive r5');
