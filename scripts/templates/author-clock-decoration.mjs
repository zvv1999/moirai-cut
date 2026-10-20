import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/clock-decoration-2026-09-29';
const base=(process.env.WORKBENCH_URL??'http://127.0.0.1:3000')+'/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const catalog=(await api('/dynamic-assets')).assets;
let saved=catalog.find(a=>a.id==='style-study-20260929-clock');
// Existing user edits are authoritative. The seed only initializes missing assets.
if(!saved){
 const seed=JSON.parse(await fs.readFile(new URL('./seeds/clock.json',import.meta.url),'utf8'));
 const normalized=(await api('/dynamic-assets/inspect',seed)).definition;
 saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:0,idempotencyKey:'clock-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
}
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/definition.json',JSON.stringify(saved,null,2));console.log(JSON.stringify({assetId:saved.id,revision:saved.revision,layers:saved.layers.length,root}));
