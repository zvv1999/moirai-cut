import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/chinese-semantic-icons-2026-09-29',base='http://127.0.0.1:3000/api/footage/templates';
async function read(path){const r=await fetch(base+path);assert.ok(r.ok);return r.json();}
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8')),manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8')),expected=JSON.parse(await fs.readFile(root+'/expectations.json','utf8'));
const item=await read('/production/'+submission.id+'/items/0'),results=[];
assert.equal(item.output.fixtures.length,3);
for(const fixture of item.output.fixtures){
 const sample=manifest.samples[fixture.index],input=await read('/inputs/'+sample.inputId);
 assert.equal(input.transcript.revision,sample.transcriptRevision);
 assert.deepEqual(fixture.request.input.words,input.transcript.words);
 function flatten(tracks){return tracks.flatMap(t=>t.elements.flatMap(e=>e.renderGroup?flatten(e.renderGroup.tracks):[e]));}
 const elements=fixture.compilation.document.scenes.flatMap(s=>flatten(s.tracks.overlay));
 const events=expected.filter(e=>e.inputId===sample.inputId);assert.equal(events.length,2);
 for(const event of events){
  const layers=elements.filter(e=>e.params?.['template.elementId']?.startsWith(event.instanceId+'--'));
  const count=event.instanceId==='time'?11:7;
  assert.equal(layers.length,count,'Each icon must occur exactly once, with no neutral-segment instances');
  assert.equal(new Set(layers.map(e=>e.params['template.elementId'])).size,count);
  for(const e of layers){
   assert.ok(Math.abs(e.startTime/120000-event.start)<1/120000);
   assert.ok(Math.abs((e.startTime+e.duration)/120000-event.end)<1/120000);
  }
 }
 const captions=elements.filter(e=>e.params?.['template.elementId']==='headline');assert.ok(captions.length);
 results.push({fixture:fixture.index,inputId:sample.inputId,transcriptRevision:sample.transcriptRevision,wordCount:input.transcript.words.length,captionUnits:captions.length,icons:events});
}
for(const d of JSON.parse(await fs.readFile(root+'/pinned-styles.json','utf8')))assert.deepEqual((await read('/dynamic-assets/'+d.id)).definition,d);
const result={passed:true,batchId:submission.id,scope:'Agent annotated semantic ranges; measured timings retained. Not automatic semantic recognition or aesthetic acceptance.',results,libraryUnchanged:true};
await fs.writeFile(root+'/semantic-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
