import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const oldRoot='/Users/zhengwei/Downloads/note-baseline-real-2026-09-29',root='/Users/zhengwei/Downloads/note-readable-real-2026-09-29';
const before=JSON.parse(await fs.readFile(oldRoot+'/item.json','utf8'));
const {id}=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const response=await fetch('http://127.0.0.1:3000/api/footage/templates/production/'+id+'/items/0');assert.ok(response.ok);const after=await response.json();
assert.equal(after.output.fixtures.length,before.output.fixtures.length);
const reports=[];
for(const [index,f] of after.output.fixtures.entries()){
 const original=before.output.fixtures[index];
 const input=f=>Object.fromEntries(Object.entries(f.request.input).filter(([k])=>k!=='template'));
 assert.deepEqual(input(f),input(original));
 const clips=f=>f.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
 const signature=e=>[e.params.content,e.startTime,e.duration];
 assert.deepEqual(clips(f).map(signature),clips(original).map(signature));
 const holds=[];
 for(const e of clips(f)){
  const keys=e.animations.opacity.keys,expected=e.params['template.elementId']==='paper-tape'?.9:1;
  assert.equal(keys[0].value,expected);assert.equal(keys.at(-2).value,expected);assert.equal(keys.at(-1).value,0);
  assert.ok(Math.abs((e.duration-keys.at(-2).time)/120000-.03)<1/120000);
  holds.push({layer:e.params['template.elementId'],text:e.params.content,duration:e.duration/120000,stableOpacitySeconds:keys.at(-2).time/120000});
 }
 reports.push({fixture:index,sourceInputEqual:true,eventContentAndTimingEqual:true,holds});
}
await fs.writeFile(root+'/readability-verification.json',JSON.stringify({reports,listened:false},null,2));console.log(JSON.stringify(reports));
