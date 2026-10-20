import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/quotation-formats-2026-09-28';
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const base='http://127.0.0.1:3000/api/footage/templates/production/'+submission.id;
const records=[];
for(let index=0;index<3;index++){
 const response=await fetch(base+'/items/'+index);assert.ok(response.ok);const item=await response.json();
 for(const fixture of item.output.fixtures){
  const elements=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
  const main=elements.filter(e=>e.params?.['template.elementId']==='headline');
  for(const id of ['quote-left','quote-right']){
   const quotes=elements.filter(e=>e.params?.['template.elementId']===id);
   assert.equal(quotes.length,main.length);
   assert.deepEqual(quotes.map(e=>[e.startTime,e.duration]),main.map(e=>[e.startTime,e.duration]),'Quotes must share the measured keyword window');
  }
  records.push({index,fixture:fixture.index,events:main.map(e=>({text:e.params.content,start:e.startTime,duration:e.duration}))});
 }
}
for(let fixture=0;fixture<2;fixture++)for(let index=1;index<3;index++)assert.deepEqual(records.find(r=>r.index===index&&r.fixture===fixture).events,records.find(r=>r.index===0&&r.fixture===fixture).events);
await fs.writeFile(root+'/timing-verification.json',JSON.stringify({passed:true,records},null,2));
console.log('PASS keyword content/timing unchanged across three formats; both quote layers share every keyword window');
