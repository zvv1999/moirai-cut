import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/growth-rule-20260929',base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const x=await r.json();assert.ok(r.ok,JSON.stringify(x));return x;}
const before=JSON.parse(await fs.readFile(root+'/before.json')),candidate=JSON.parse(await fs.readFile(root+'/candidate.json'));
const current=(await api('/dynamic-assets/'+before.id)).definition;
const application={assetId:before.id,assetRevision:before.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.25,centerX:.18,centerY:.3}};
let oldTemplate,saved;
if(current.revision===before.revision){assert.deepEqual(current,before);oldTemplate=(await api('/dynamic-assets/application',application)).template;await fs.writeFile(root+'/before-template.json',JSON.stringify(oldTemplate,null,2));saved=(await api('/dynamic-assets',{definition:candidate,baseRevision:before.revision,idempotencyKey:'growth-rule-'+createHash('sha256').update(JSON.stringify(candidate)).digest('hex')})).definition;}else if(current.revision===candidate.revision){
 assert.deepEqual(current,JSON.parse(await fs.readFile(root+'/saved.json')),'Do not overwrite unrelated edits');
 oldTemplate=JSON.parse(await fs.readFile(root+'/before-template.json'));
 saved=(await api('/dynamic-assets',{definition:candidate,baseRevision:current.revision,idempotencyKey:'growth-rule-'+createHash('sha256').update(JSON.stringify(candidate)).digest('hex')})).definition;
}else{assert.equal(current.revision,candidate.revision+1);assert.deepEqual({...current,revision:candidate.revision},candidate);saved=current;oldTemplate=JSON.parse(await fs.readFile(root+'/before-template.json'));}
await fs.writeFile(root+'/saved.json',JSON.stringify(saved,null,2));application.assetRevision=saved.revision;
const template=(await api('/dynamic-assets/application',application)).template;oldTemplate.id='growth-rule-20260929-before';template.id='growth-rule-20260929-after';
const samples=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/growth-decoration-2026-09-28/designs.json')).samples;
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const designs=[{template:oldTemplate,baseRevision:0},{template,baseRevision:0}];
const request={name:'增长图标 · 圆顶与整组淡出',brief:'Visual adaptation fixtures, not semantic growth annotation approval. One native rounded-bar rule and identical scale/placement across three existing interviews. Compared to saved r1; source media and aligned keyword timing unchanged. Aesthetic review pending.',previewOnly:true,designs,samples,idempotencyKey:'growth-rule-20260929-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.writeFile(root+'/application.json',JSON.stringify(application,null,2));await fs.writeFile(root+'/designs.json',JSON.stringify(request,null,2));const batch=await api('/production/author',request);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({batchId:batch.id,revision:saved.revision,designs:2,samples:3}));
