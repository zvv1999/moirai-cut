import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const oldRoot='/Users/zhengwei/Downloads/cyan-validation-2026-09-29',root='/Users/zhengwei/Downloads/cyan-natural-real-2026-09-29';
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
  const words=f.request.input.words;
  const span=f.request.input.semanticUnits.filter(u=>u.keyword)[holds.length].keyword;
  assert.ok(Math.abs(e.startTime/120000-words[span.startWord].start)<1/120000);
  assert.ok(Math.abs((e.startTime+e.duration)/120000-words[span.endWord-1].end)<1/120000);
  holds.push({text:e.params.content,start:e.startTime/120000,duration:e.duration/120000,measuredWordTiming:true});
 }
 reports.push({fixture:index,sourceInputEqual:true,eventContentAndTimingEqual:true,holds});
}
await fs.writeFile(root+'/timing-verification.json',JSON.stringify({reports,listened:false},null,2));console.log(JSON.stringify(reports));
