import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/offset-chinese-20260929';
const base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
await fs.mkdir(root,{recursive:true});
const current=(await api('/dynamic-assets/style-pilot-20260923-offset')).definition;
try{await fs.writeFile(root+'/before-definition.json',JSON.stringify(current,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const before=JSON.parse(await fs.readFile(root+'/before-definition.json'));assert.equal(before.revision,4);
const definition=structuredClone(before);
for(const style of definition.styles)style.maxLines=2;
const expected=structuredClone(definition);expected.revision=5;
if(current.revision===5){assert.deepEqual(current,expected);console.log('Already saved exact v5');process.exit(0);}
assert.deepEqual(current,before);
const key=createHash('sha256').update(JSON.stringify(definition)).digest('hex');
const saved=(await api('/dynamic-assets',{definition,baseRevision:before.revision,idempotencyKey:'offset-multiline-'+key})).definition;
assert.deepEqual(saved,expected);await fs.writeFile(root+'/saved-definition.json',JSON.stringify(saved,null,2));
console.log('Saved v5: only both maxLines and revision changed');
