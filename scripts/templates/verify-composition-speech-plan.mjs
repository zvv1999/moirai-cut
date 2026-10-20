import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/style-composition-persistence-2026-09-29';
const record=JSON.parse(await fs.readFile(root+'/verification.json','utf8'));
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const library=await api('');const template=library.templates.find(t=>t.id===record.templateId);assert.equal(template.revision,record.revision);
const item=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/sparkle-v5-mixed-2026-09-29/item.json','utf8'));
const reports=[];
function equal(a,b){
 if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=4*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const key of Object.keys(a))equal(a[key],b[key]);return;
 }
 assert.deepEqual(a,b);
}
for(const [i,fixture] of item.output.fixtures.entries()){
 const input={...fixture.request.input,template};
 const plan=await api('/plan',input);
 await fs.writeFile(`${root}/speech-plan-${i}.json`,JSON.stringify(plan,null,2));
 assert.deepEqual(plan.words,input.words);
 const inserted=plan.elements.filter(e=>record.insertedElementIds.includes(e.elementId));
 const timing=e=>({layer:e.elementId.split('--').at(-1),content:e.content,start:e.start,end:e.end,motions:e.motions});
 const baselineTemplate=structuredClone(fixture.request.input.template);
 baselineTemplate.visualRhythm=template.visualRhythm;
 const baseline=await api('/plan',{...fixture.request.input,template:baselineTemplate});
 const actual=inserted.map(timing),expected=baseline.elements.filter(e=>['headline','sparkle'].includes(e.elementId)).map(timing);
 assert.ok(actual.length>0);equal(actual,expected);
 reports.push({fixture:i,wordCount:plan.words.length,styleEvents:actual.length,events:actual.map(({motions,...e})=>e)});
}
assert.equal(new Set(reports.map(r=>JSON.stringify(r.events))).size,reports.length);
assert.deepEqual(await api(''),library);
await fs.writeFile(root+'/speech-verification.json',JSON.stringify({templateId:template.id,revision:template.revision,visualRhythm:template.visualRhythm,comparison:'Independent style application with the same composition visualRhythm; numeric tolerance four machine epsilons. Original standalone application may have shorter holds.',reports,libraryUnchanged:true,rendered:false},null,2));
console.log('PASS same saved composition, four measured speech inputs, distinct events; inserted style matches independent application under identical visualRhythm; library unchanged');
