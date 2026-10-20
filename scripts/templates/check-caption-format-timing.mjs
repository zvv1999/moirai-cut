import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/caption-formats-2026-09-28';
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8'));
assert.equal(manifest.designs.length,3,'This check requires all three formats');
const base='http://127.0.0.1:3000/api/footage/templates/production/'+submission.id;
const records=[];
for(let index=0;index<3;index++){
 const response=await fetch(base+'/items/'+index);assert.ok(response.ok);const item=await response.json();
 assert.equal(item.output.fixtures.length,manifest.samples.length);
 for(const fixture of item.output.fixtures){
  const captions=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements)).filter(e=>e.params?.['template.elementId']==='headline');
  assert.ok(captions.length,'Missing native captions');
  records.push({index,fixture:fixture.index,events:captions.map(e=>({text:e.params.content,start:e.startTime,duration:e.duration,wordTimings:JSON.parse(e.params['text.wordTimings'])}))});
 }
}
for(let fixture=0;fixture<manifest.samples.length;fixture++)for(let index=1;index<3;index++){
 assert.deepEqual(records.find(r=>r.index===index&&r.fixture===fixture)?.events,records.find(r=>r.index===0&&r.fixture===fixture)?.events,'Changing the canvas must preserve caption content and every measured word window');
}
await fs.writeFile(root+'/timing-verification.json',JSON.stringify({passed:true,batchId:submission.id,listened:false,records},null,2));
console.log('PASS caption content, cue timing and all word windows are identical across three formats');
