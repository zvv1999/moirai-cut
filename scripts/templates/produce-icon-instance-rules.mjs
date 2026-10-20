import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/icon-instance-rules-20260929',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,await r.clone().text());return r.json();}
const groups=[{sourceFixtures:[0],designs:[]},{sourceFixtures:[1,2],designs:[]}];
const fixtures=await Promise.all([0,1,2].map(async i=>JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/placement-advice-20260929/fixture-'+i+'.json'))));
const assets=[];
for(const [key,id,revision] of [['growth','style-study-20260928-growth',3],['completion','style-study-20260929-completion',3],['clock','style-study-20260929-clock',2]]){
 const live=(await api('/dynamic-assets/'+id)).definition;let before,saved;
 if(live.revision===revision){before=live;await fs.writeFile(root+'/'+key+'-before.json',JSON.stringify(before,null,2));const candidate=structuredClone(before);const layer=candidate.layers.find(l=>l.content.id==='root');assert.ok(layer.content.composite);layer.content.separateInstances=true;saved=(await api('/dynamic-assets',{definition:candidate,baseRevision:revision,idempotencyKey:'icon-independent-'+createHash('sha256').update(JSON.stringify(candidate)).digest('hex')})).definition;}
 else{assert.equal(live.revision,revision+1,'Refuse newer user edits');before=JSON.parse(await fs.readFile(root+'/'+key+'-before.json'));saved=live;}
 const expected=structuredClone(before);expected.layers.find(l=>l.content.id==='root').content.separateInstances=true;expected.revision=revision+1;assert.deepEqual(saved,expected);
 await fs.writeFile(root+'/'+key+'-saved.json',JSON.stringify(saved,null,2));assets.push({key,id,revision:saved.revision});
 for(let i=0;i<3;i++){
  const application={...fixtures[i].request.application,assetId:id,assetRevision:saved.revision};
  const advice=await api('/dynamic-assets/placement-advice',{...fixtures[i].request,application});assert.ok(advice.application);assert.equal(advice.selectedId,i===0?'current':'upper_right');
  await fs.writeFile(root+'/'+key+'-advice-'+i+'.json',JSON.stringify(advice,null,2));
  // Keep the former whole-span rule as a structural comparator, never alter child animation.
  const oldTemplate=structuredClone(advice.template);for(const g of oldTemplate.composition.groups)delete g.separateInstances;
  const preview=await api('/dynamic-assets/sample-preview',{template:oldTemplate,sample:fixtures[i].sample});
  await fs.writeFile(root+'/'+key+'-before-preview-'+i+'.json',JSON.stringify(preview,null,2));
  const g=groups[i===0?0:1];if(i!==2)g.designs.push({template:advice.template,baseRevision:0});
  else assert.deepEqual(advice.template,g.designs.at(-1).template);
 }
}
await fs.writeFile(root+'/assets.json',JSON.stringify(assets,null,2));
const submissions=[];
for(const g of groups){const samples=g.sourceFixtures.map(i=>fixtures[i].sample);const manifest={name:'组合图标 · 每次完整退场',brief:'Three saved icon rules, independently restarted group effects, unchanged authored child style and animation. Common native placement policy with caller-provided manual protection. Visual adaptation fixtures, not semantic suitability approval.',previewOnly:true,designs:g.designs,samples,idempotencyKey:'icon-instance-rules-'+createHash('sha256').update(JSON.stringify(g)).digest('hex')};const submission=await api('/production/author',manifest);submissions.push({batchId:submission.id,sourceFixtures:g.sourceFixtures,manifest});await fs.writeFile(root+'/submissions.json',JSON.stringify(submissions,null,2));}
console.log(JSON.stringify(submissions.map(s=>({batchId:s.batchId,fixtures:s.sourceFixtures}))));
