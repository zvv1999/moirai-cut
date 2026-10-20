import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/study-guidance-hierarchy-2026-09-29',oldRoot='/Users/zhengwei/Downloads/study-guidance-published-2026-09-29';
const read=async(path)=>JSON.parse(await fs.readFile(path,'utf8'));
const old=await read(oldRoot+'/item.json'),item=await read(root+'/item.json'),manifest=await read(root+'/designs.json');
const elements=f=>f.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
const summaries=es=>es.map(e=>[e.params?.['template.elementId'],e.params?.content??null,e.startTime,e.duration]);
let captions=0;
for(const [i,f] of item.output.fixtures.entries()){
 assert.deepEqual(f.request.input.words,old.output.fixtures[i].request.input.words);
 assert.deepEqual(summaries(elements(f)),summaries(elements(old.output.fixtures[i])));
 const binding=manifest.samples[i].resourceBindings?.[0]??manifest.designs[0].template.resourceBindings[0];
 assert.equal(elements(f).find(e=>e.params?.['template.elementId']==='study--decoration').mediaId,binding.assetId);
 for(const e of elements(f).filter(e=>e.params?.['template.elementId']==='headline')){assert.notEqual(e.params['text.highlightEnabled'],true);assert.equal(e.params['text.highlightColor'],undefined);assert.equal(e.params.color,'#E1E4EC');const prior=elements(old.output.fixtures[i]).find(p=>p.params?.['template.elementId']==='headline'&&p.startTime===e.startTime);assert.ok(Math.abs(e.params.fontSize/prior.params.fontSize-42/53.2)<1e-12);captions++;}
}
assert.equal(captions,21);const result={fixtures:3,captions,measuredWordsUnchanged:true,allContentAndIntervalsUnchanged:true,perInputIllustrations:true,score:null,listened:false};await fs.writeFile(root+'/hierarchy-verification.json',JSON.stringify(result,null,2));console.log(result);
