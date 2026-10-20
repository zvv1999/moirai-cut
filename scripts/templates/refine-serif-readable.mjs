import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/serif-readable-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const original=(await api('/dynamic-assets/style-study-20260924-serif')).definition;assert.equal(original.revision,2);
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/original-v2.json',JSON.stringify(original,null,2));
const definition=structuredClone(original),e=definition.layers.find(l=>l.content.element?.id==='headline').content.element;
e.motions=e.motions.filter(m=>m.property!=='opacity');
definition.provenance+=' Revision 3: remove whole-sentence opacity fades after exported entry frames showed low-contrast reading onset. Preserve Songti typography, keyword treatment and 5px settle; measured content timing unchanged. Pending new export review.';
const normalized=(await api('/dynamic-assets/inspect',definition)).definition;
const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:2,idempotencyKey:'serif-readable-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
assert.equal(saved.revision,3);await fs.writeFile(root+'/saved-v3.json',JSON.stringify(saved,null,2));console.log('Saved serif r3');
