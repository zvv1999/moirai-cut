import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/reading-style-composition-2026-09-29';
const read=async name=>JSON.parse(await fs.readFile(`${root}/${name}.json`,'utf8'));
const item=await read('item'),source=await read('source-input'),manifest=await read('designs');
const fixture=item.output.fixtures[0],elements=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
const matches=id=>elements.filter(e=>e.params?.['template.elementId']===id);
const interval=(e,start,end)=>{assert.ok(Math.abs(e.startTime/120000-start)<1/120000);assert.ok(Math.abs((e.startTime+e.duration)/120000-end)<1/120000);};
for(const id of ['page-heading','page-background','study--decoration']){const es=matches(id);assert.equal(es.length,1);interval(es[0],0,source.input.durationSeconds);}
const captions=matches('headline');assert.equal(captions.length,5);
for(const [i,span] of manifest.samples[0].captionSpans.entries()){const ws=source.transcript.words.slice(span.startWord,span.endWord);interval(captions[i],ws[0].start,ws.at(-1).end);assert.equal(captions[i].params.content,ws.map(w=>w.text).join(''));}
for(const id of new Set(elements.map(e=>e.params?.['template.elementId']).filter(id=>id?.startsWith('time--')))){const es=matches(id);assert.equal(es.length,1);interval(es[0],source.transcript.words[14].start,source.transcript.words[15].end);}
for(const id of ['note--headline','note--note-shadow','note--paper-tape']){const es=matches(id);assert.equal(es.length,2);interval(es[0],source.transcript.words[26].start,source.transcript.words[29].end);interval(es[1],source.transcript.words[32].start,source.transcript.words[37].end);}
const result={captionCount:captions.length,illustrationCount:1,clockCueCount:1,noteCueCount:2,measuredTimingPreserved:true,fullAudioDuration:source.input.durationSeconds,listened:false,score:null};
await fs.writeFile(root+'/timing-verification.json',JSON.stringify(result,null,2));console.log(result);
