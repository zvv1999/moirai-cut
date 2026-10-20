import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000/api/footage/templates',root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/layout-phrase-exports-2026-09-29';
async function read(path){const r=await fetch(base+path);assert.ok(r.ok);return r.json();}
const sub=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const before=await read('/production/production-6101296fe308a20b217da8e0c89e00b9/items/0');const after=await read('/production/'+sub.id+'/items/0');
const results=[];
for(const [i,f] of after.output.fixtures.entries()){
 const b=before.output.fixtures[i];const input=structuredClone(f.request.input);delete input.layoutPhrases;assert.deepEqual(input,b.request.input);
 const clips=x=>x.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
 const previous=clips(b),current=clips(f);assert.equal(current.length,previous.length);
 const normalized=e=>({elementId:e.params['template.elementId'],content:e.params.content,start:e.startTime,duration:e.duration});
 assert.deepEqual(current.map(normalized),previous.map(normalized));
 const annotated=current.filter(e=>e.params['text.layoutPhrases']);assert.equal(annotated.length,1);
 const metadata=JSON.parse(annotated[0].params['text.layoutPhrases']);assert.equal(metadata.content,annotated[0].params.content);
 const phrases=metadata.ranges.map(r=>metadata.content.slice(r.start,r.end));assert.deepEqual(phrases,[['最重要'],['完成时间。'],['完成时间']][i]);
 results.push({fixture:i,phrases,unchangedWordsAndTiming:true});
}
await fs.writeFile(root+'/range-verification.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify(results));
