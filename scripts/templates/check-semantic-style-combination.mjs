import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/semantic-style-combination-2026-09-28',base='http://127.0.0.1:3000/api/footage/templates';
const read=async path=>{const r=await fetch(base+path);assert.ok(r.ok);return r.json();};
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8')),manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8'));
const item=await read('/production/'+submission.id+'/items/0'),input=await read('/inputs/'+manifest.samples[0].inputId);
const elements=item.output.fixtures[0].compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
const icon=elements.filter(e=>e.params?.['template.elementId']?.startsWith('growth--'));
assert.equal(icon.length,5);assert.equal(new Set(icon.map(e=>e.params['template.elementId'])).size,5);
const range=manifest.samples[0].semanticUnits.at(-1).keyword,words=input.transcript.words;
const start=words[range.startWord].start,end=words[range.endWord-1].end;
for(const e of icon){assert.ok(Math.abs(e.startTime/120000-start)<1/120000);assert.ok(Math.abs((e.startTime+e.duration)/120000-end)<1/120000);}
const emphasis=elements.filter(e=>e.params?.['template.elementId']==='emphasis--headline');assert.equal(emphasis.length,4);
for(const [index,e] of emphasis.entries()){const k=manifest.samples[0].semanticUnits[index].keyword;assert.ok(Math.abs(e.startTime/120000-words[k.startWord].start)<1/120000);assert.ok(Math.abs((e.startTime+e.duration)/120000-words[k.endWord-1].end)<1/120000);}
for(const d of JSON.parse(await fs.readFile(root+'/pinned-styles.json','utf8')))assert.deepEqual((await read('/dynamic-assets/'+d.id)).definition,d);
const result={passed:true,batchId:submission.id,growth:{occurrences:1,layers:5,start,end,text:words.slice(range.startWord,range.endWord).map(w=>w.text).join(' ')},emphasisOccurrences:4,captionUnits:elements.filter(e=>e.params?.['template.elementId']==='headline').length,libraryUnchanged:true,listened:false};
await fs.writeFile(root+'/semantic-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
