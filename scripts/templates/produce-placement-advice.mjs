import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/placement-advice-20260929',base='http://127.0.0.1:3000/api/footage/templates';
const groups=new Map();
for(let i=0;i<3;i++){
 const fixture=JSON.parse(await fs.readFile(root+'/fixture-'+i+'.json'));
 const r=await fetch(base+'/dynamic-assets/placement-advice',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(fixture.request)});const advice=await r.json();assert.ok(r.ok);assert.deepEqual(advice,fixture.result);
 const key=JSON.stringify(advice.template);if(!groups.has(key))groups.set(key,{template:advice.template,samples:[],sourceFixtures:[]});groups.get(key).samples.push(fixture.sample);groups.get(key).sourceFixtures.push(i);
}
const submissions=[];
for(const group of groups.values()){
 const hash=createHash('sha256').update(JSON.stringify(group)).digest('hex');
 const manifest={name:'增长图标 · 原生位置建议验证',brief:'One unchanged saved growth style and native placement policy across source inputs. Caller-provided protected regions based on inspected frames; not automatic subject detection or semantic matching. Keep source framing, audio, effect size and timing. No aesthetic acceptance.',previewOnly:true,designs:[{template:group.template,baseRevision:0}],samples:group.samples,idempotencyKey:'placement-advice-'+hash};
 const r=await fetch(base+'/production/author',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(manifest)});const submission=await r.json();assert.ok(r.ok,JSON.stringify(submission));submissions.push({sourceFixtures:group.sourceFixtures,manifest,batchId:submission.id});
 await fs.writeFile(root+'/submissions.json',JSON.stringify(submissions,null,2));
}
console.log(JSON.stringify(submissions.map(s=>({batchId:s.batchId,sourceFixtures:s.sourceFixtures}))));
