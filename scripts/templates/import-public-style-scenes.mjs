import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/style-public-scenes-2026-09-28';
const clips=JSON.parse(await fs.readFile(root+'/clips.json','utf8'));
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const receipts=[];
for(const clip of clips){
 assert.equal(createHash('sha256').update(await fs.readFile(clip.path)).digest('hex'),clip.sha256);
 const input=await api('/inputs/import',{path:clip.path,name:clip.name});
 const detail=await api('/inputs/'+input.id);
 let job=detail.job;
 if(!detail.transcript&&!job)job=await api('/inputs/'+input.id+'/transcribe',{});
 receipts.push({...clip,input,job});await fs.writeFile(root+'/input-receipts.json',JSON.stringify(receipts,null,2));
 console.log(JSON.stringify({id:input.id,name:input.name,job:job?.id,status:job?.status,transcript:!!detail.transcript}));
}
