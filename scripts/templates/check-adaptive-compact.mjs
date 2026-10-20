import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const oldRoot='/Users/zhengwei/Downloads/adaptive-reading-real-2026-09-29',root='/Users/zhengwei/Downloads/adaptive-compact-real-2026-09-29';
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
  const keys=e.animations.opacity.keys;assert.equal(keys[0].value,0);assert.equal(keys.at(-1).value,0);
  assert.equal(keys[1].value,1);assert.equal(keys.at(-2).value,1);
  assert.ok(Math.abs(keys[1].time/120000-.04)<1/120000);
  assert.ok(Math.abs((e.duration-keys.at(-2).time)/120000-.04)<1/120000);
  holds.push({text:e.params.content,duration:e.duration/120000,fullOpacitySeconds:(keys.at(-2).time-keys[1].time)/120000});
 }
 reports.push({fixture:index,sourceInputEqual:true,eventContentAndTimingEqual:true,holds});
}
await fs.writeFile(root+'/compact-verification.json',JSON.stringify({reports,listened:false},null,2));console.log(JSON.stringify(reports));
