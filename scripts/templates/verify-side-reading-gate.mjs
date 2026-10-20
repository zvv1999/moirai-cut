import fs from'node:fs/promises';import assert from'node:assert/strict';
const root='/Users/zhengwei/Downloads/checklist-side-reading-20260930',base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(body)}:undefined);const text=await r.text();assert.ok(r.ok,text);return JSON.parse(text);}
const before=await api('/dynamic-assets/style-study-20260930-checklist-sidebar'),results=[];
for(let i=0;i<3;i++){
 const request=JSON.parse(await fs.readFile(root+'/'+i+'/reading-request.json'));const result=await api('/dynamic-assets/placement-advice',request);
 assert.equal(result.readingCheck.status,i===0?'passed':'failed');assert.equal(result.selectedId,i===0?'left':null);
 if(i){assert.equal(result.application,null);assert.equal(result.template,null);assert.ok(result.readingCheck.findings.some(f=>f.reasons.includes('too_many_lines')));}
 await fs.writeFile(root+'/'+i+'/reading-advice.json',JSON.stringify(result,null,2));results.push({fixture:i,selected:result.selectedId,reading:result.readingCheck});
 const geometric=await api('/dynamic-assets/placement-advice',{...request,readingCheck:undefined});assert.equal(geometric.readingCheck.status,'not_provided');assert.equal(geometric.selectedId,['left','left','right'][i]);
}
assert.deepEqual(await api('/dynamic-assets/style-study-20260930-checklist-sidebar'),before);await fs.writeFile(root+'/reading-gate-verification.json',JSON.stringify({results,libraryUnchanged:true,geometricOnlyNotReadabilityPass:true},null,2));console.log(JSON.stringify(results));
