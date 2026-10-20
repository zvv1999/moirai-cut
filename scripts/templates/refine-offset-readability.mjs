import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/offset-readable-2026-09-28';
const base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const before=(await api('/dynamic-assets/style-pilot-20260923-offset')).definition;
await fs.mkdir(root,{recursive:true});
// Never overwrite the baseline receipt on a repeat invocation.
try{await fs.writeFile(root+'/source-v3.json',JSON.stringify(before,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const original=JSON.parse(await fs.readFile(root+'/source-v3.json','utf8'));assert.equal(original.revision,3);
const definition=structuredClone(original);
for(const layer of definition.layers){if(layer.content.kind!=='element')continue;const e=layer.content.element;
 e.motionTiming.enterSeconds=.12;e.motionTiming.exitSeconds=.06;
 if(e.id==='headline')e.motions=e.motions.filter(m=>m.property!=='opacity');
 const scale=e.motions.find(m=>m.property==='scale');if(scale)scale.keys[0].value=.88;
}
const hash=createHash('sha256').update(JSON.stringify(definition)).digest('hex');
const saved=(await api('/dynamic-assets',{definition,baseRevision:3,idempotencyKey:'offset-readable-'+hash})).definition;
assert.equal(saved.revision,4);assert.equal(saved.layers.find(l=>l.content.element?.id==='headline').content.element.motions.some(m=>m.property==='opacity'),false);
await fs.writeFile(root+'/saved-style.json',JSON.stringify(saved,null,2));console.log(JSON.stringify({id:saved.id,revision:saved.revision,root}));
