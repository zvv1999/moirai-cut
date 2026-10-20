import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const multiline=process.env.ECHO_MULTILINE==='1';
const root=process.env.PILOT_OUTPUT??(multiline?'/Users/zhengwei/Downloads/echo-multiline-2026-09-29':'/Users/zhengwei/Downloads/echo-readable-2026-09-29');
const id='style-study-20260924-echo';
async function api(path,body){
 const response=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
 const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;
}
const before=(await api('/dynamic-assets/'+id)).definition;
const definition=structuredClone(before);
if(multiline){
 for(const style of definition.styles){
  if(['headline-style','echo-style'].includes(style.id))style.maxLines=2;
 }
}
for(const layer of definition.layers){
 const e=layer.content.element;if(!e)continue;
 if(e.id==='headline')e.motions=e.motions.filter(m=>m.property!=='opacity');
 if(['headline','echo-text'].includes(e.id)){
  e.motionTiming.enterSeconds=.12;
  e.motionTiming.exitSeconds=.06;
 }
}
await fs.mkdir(root,{recursive:true});
if(JSON.stringify(before)===JSON.stringify(definition)){
 console.log(JSON.stringify({assetId:id,revision:before.revision,unchanged:true}));
}else{
 assert.equal(before.revision,multiline?2:1,'Reassess any intervening author edits before applying this revision');
 await fs.writeFile(root+'/before-definition.json',JSON.stringify(before,null,2));
 const normalized=(await api('/dynamic-assets/inspect',definition)).definition;
 const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:before.revision,idempotencyKey:'echo-readable-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
 assert.deepEqual((await api('/dynamic-assets/'+id)).definition,saved);
 await fs.writeFile(root+'/definition.json',JSON.stringify(saved,null,2));
 console.log(JSON.stringify({assetId:id,revision:saved.revision,root}));
}
