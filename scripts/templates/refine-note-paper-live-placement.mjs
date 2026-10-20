import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:3000/api/footage/templates',source='/Users/zhengwei/Downloads/note-paper-live-20260929',root='/Users/zhengwei/Downloads/note-paper-safe-20260929';
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const manifest=JSON.parse(await fs.readFile(source+'/manifest.json')),inputs=JSON.parse(await fs.readFile(source+'/inputs.json')),definition=JSON.parse(await fs.readFile(source+'/definition.json')),apps=JSON.parse(await fs.readFile(source+'/applications.json'));
const policy=JSON.parse(await fs.readFile(new URL('./seeds/note-paper-placement.json',import.meta.url)));
assert.equal(policy.application.assetId,definition.id);assert.equal(policy.application.assetRevision,definition.revision);
await fs.mkdir(root,{recursive:true});const submissions=[];
for(let i=0;i<3;i++){
 const folder=root+'/'+i;await fs.mkdir(folder,{recursive:true});
 const fixture=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/placement-advice-20260929/fixture-'+[0,2,1][i]+'.json'));
 const application=structuredClone(policy.application);
 const request={...structuredClone(policy),protectedRegions:fixture.request.protectedRegions};
 const advice=await api('/dynamic-assets/placement-advice',request);await fs.writeFile(folder+'/placement.json',JSON.stringify({request,advice},null,2));assert.ok(advice.application,'No safe placement; do not render over protected content');
 let {template}=await api('/dynamic-assets/application',apps.caption);
 template=(await api('/dynamic-assets/insert',{template,assetId:definition.id,assetRevision:definition.revision,instanceId:'note',placement:application.placement,transform:advice.application.transform})).template;
 template.styles.find(s=>s.id==='headline-style').fill='#FFF9EC';template.id='note-paper-safe-instance-'+i+'-20260929';template.name='注释便签 · 保护区应用验证';
 const designs=[{template,baseRevision:0}],samples=[manifest.samples[i]],next={name:template.name,brief:'Unchanged saved note-paper style, common scale and candidate positions. Native selection uses caller-provided manually inspected protection; individual result is an application, not a new style.',previewOnly:true,designs,samples,idempotencyKey:'note-safe-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 for(const [k,v]of Object.entries({manifest:next,inputs:[inputs[i]],definition}))await fs.writeFile(folder+'/'+k+'.json',JSON.stringify(v,null,2));
 const b=await api('/production/author',next);await fs.writeFile(folder+'/submission.json',JSON.stringify(b,null,2));submissions.push({fixture:i,id:b.id,selected:advice.selectedId});await fs.writeFile(root+'/submissions.json',JSON.stringify(submissions,null,2));
}
assert.deepEqual((await api('/dynamic-assets/'+definition.id)).definition,definition);console.log(JSON.stringify(submissions));
