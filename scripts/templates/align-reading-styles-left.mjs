import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/reading-left-align-20260929';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const reports=[];
for(const id of ['style-pilot-20260923-marker','style-pilot-20260923-adaptive']){
 const {definition:original}=await api('/dynamic-assets/'+id);const path=root+'/'+id;
 const prior=await fs.readFile(path+'-before.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e});
 if(prior){const expected=structuredClone(prior);expected.revision++;expected.styles.find(s=>s.id===prior.layers.find(l=>l.content.element?.id==='headline').content.element.styleId).textAlign='left';assert.deepEqual(original,expected);reports.push({id,revision:original.revision,reused:true});continue;}
 await fs.writeFile(path+'-before.json',JSON.stringify(original,null,2));
 const definition=structuredClone(original),styleId=definition.layers.find(l=>l.content.element?.id==='headline').content.element.styleId;definition.styles.find(s=>s.id===styleId).textAlign='left';
 const {definition:saved}=await api('/dynamic-assets',{definition,baseRevision:original.revision,idempotencyKey:'reading-left-'+createHash('sha256').update(JSON.stringify(definition)).digest('hex')});
 definition.revision++;assert.deepEqual(saved,definition);await fs.writeFile(path+'-after.json',JSON.stringify(saved,null,2));reports.push({id,from:original.revision,to:saved.revision,onlyTextAlignmentChanged:true});
}
await fs.writeFile(root+'/save-verification.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
