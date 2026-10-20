import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/adaptive-reading-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const original=(await api('/dynamic-assets/style-pilot-20260923-adaptive')).definition;assert.equal(original.revision,3);
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/original-v3.json',JSON.stringify(original,null,2));
const definition=structuredClone(original);definition.name='阅读强调 · 奶油底签';
const e=definition.layers.find(l=>l.content.element?.id==='headline').content.element;
e.features.role='emphasis';e.description='随重点词长度适配的阅读底签';
e.motionTiming={enterEnd:.2,exitStart:.8,enterSeconds:.09,exitSeconds:.05};
e.motions=[{property:'x',keys:[{time:0,value:8,easing:'ease_out'},{time:.2,value:0,easing:'linear'},{time:1,value:0,easing:'linear'}]}];
Object.assign(definition.styles[0],{background:'#F5E6B8',backgroundPadding:{x:20,y:10},fill:'#272B30',fontSize:76,weight:600,maxLines:2,lineHeight:1.16,description:'深墨文字与奶油色阅读底签'});
definition.provenance+=' Revision 4: calm reading emphasis with cream adaptive text backing and a 90ms lateral settle; remove bounce and opacity fades to keep brief keywords readable, allow two lines. Original editable design, pending visual acceptance.';
const inspected=(await api('/dynamic-assets/inspect',definition)).definition;
const saved=(await api('/dynamic-assets',{definition:inspected,baseRevision:3,idempotencyKey:'adaptive-reading-'+createHash('sha256').update(JSON.stringify(inspected)).digest('hex')})).definition;
assert.equal(saved.revision,4);await fs.writeFile(root+'/saved-v4.json',JSON.stringify(saved,null,2));console.log({id:saved.id,revision:saved.revision});
