import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/study-guidance-sections-2026-09-29',priorRoot='/Users/zhengwei/Downloads/study-guidance-spacing-2026-09-29';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const manifest=await read(root+'/designs.json'),sub=await read(root+'/submission.json');
const r=await fetch('http://127.0.0.1:3000/api/footage/templates/production/'+sub.id+'/items/0');assert.ok(r.ok);const item=await r.json();await fs.writeFile(root+'/item.json',JSON.stringify(item,null,2));
const old=await read(priorRoot+'/item.json'),results=[];
const elements=f=>f.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
const nonArt=es=>es.filter(e=>!['study--decoration','study--planning'].includes(e.params?.['template.elementId'])).map(e=>[e.params?.['template.elementId'],e.params?.content??null,e.startTime,e.duration]);
for(const [i,f] of item.output.fixtures.entries()){
 assert.deepEqual(f.request.input.words,old.output.fixtures[i].request.input.words);assert.deepEqual(nonArt(elements(f)),nonArt(elements(old.output.fixtures[i])));
 const images=elements(f).filter(e=>['study--decoration','study--planning'].includes(e.params?.['template.elementId'])).sort((a,b)=>a.startTime-b.startTime),units=manifest.samples[i].semanticUnits,words=f.request.input.words;
 assert.equal(images.length,units.length);const intervals=[];
 for(const [j,e] of images.entries()){
  const start=words[units[j].startWord].start,end=j+1<units.length?words[units[j+1].startWord].start:f.request.input.durationSeconds;
  assert.ok(Math.abs(e.startTime/120000-start)<1/120000);assert.ok(Math.abs((e.startTime+e.duration)/120000-end)<1/120000);
  const expected=units[j].intent==='metric'?'study--planning':'study--decoration';assert.equal(e.params['template.elementId'],expected);
  if(j)assert.equal(images[j-1].startTime+images[j-1].duration,e.startTime);
  const binding=expected==='study--planning'?manifest.designs[0].template.resourceBindings.find(b=>b.slotId==='planning--artwork'):(manifest.samples[i].resourceBindings?.find(b=>b.slotId==='study--artwork')??manifest.designs[0].template.resourceBindings.find(b=>b.slotId==='study--artwork'));
  assert.equal(e.mediaId,binding.assetId);intervals.push({start,end,elementId:expected,mediaId:e.mediaId});
 }
 results.push({fixture:i,intervals});
}
await fs.writeFile(root+'/sections-verification.json',JSON.stringify({nonArtworkContentAndTimingUnchanged:true,continuousSceneCoverage:true,results,listened:false,score:null},null,2));console.log(results.map(r=>({fixture:r.fixture,scenes:r.intervals.length,actualImageChanges:r.intervals.filter((s,i)=>i&&s.mediaId!==r.intervals[i-1].mediaId).length})));
