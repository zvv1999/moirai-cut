import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/cyan-keyword-style-2026-09-28';
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
async function read(path){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path);assert.ok(r.ok,`${path}: ${r.status}`);return r.json();}
const item=await read('/production/'+submission.id+'/items/0');
const results=[];
for(const fixture of item.output.fixtures){
 const input=fixture.request.input;
 const elements=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
 const keywords=elements.filter(e=>e.params?.['template.elementId']==='headline');
 const spans=input.semanticUnits.filter(u=>u.keyword).map(u=>u.keyword);
 assert.equal(keywords.length,spans.length);
 for(let i=0;i<spans.length;i++){
  const span=spans[i],words=input.words.slice(span.startWord,span.endWord),element=keywords[i];
  const start=words[0].start,end=words.at(-1).end;
  assert.ok(Math.abs(element.startTime/120000-start)<=1/120000,'Keyword must start at measured word, without legacy offset');
  assert.ok(Math.abs(element.duration/120000-(end-start))<=1/120000,'Keyword must follow measured duration');
  const compact=s=>s.replace(/\s/g,'');
  assert.equal(compact(element.params.content),compact(words.map(w=>w.text).join('').replace(/[,，。.!！?？;；:：]+$/u,'')));
  assert.notEqual(element.params.content,'全域推广');
  results.push({fixture:fixture.index,text:element.params.content,start,end});
 }
 assert.ok(elements.some(e=>e.params?.['template.elementId']==='caption--headline'),'Independent caption layer retained');
}
const source=JSON.parse(await fs.readFile(root+'/source-reference.json','utf8'));
assert.deepEqual((await read('/dynamic-assets/'+source.id)).definition,source,'Reference style must be unchanged');
const style=JSON.parse(await fs.readFile(root+'/style.json','utf8'));
assert.deepEqual((await read('/dynamic-assets/'+style.id)).definition,style,'Saved style must match verified revision');
await fs.writeFile(root+'/timing-verification.json',JSON.stringify({batchId:submission.id,passed:true,sourceUnchanged:true,results},null,2));
console.log(JSON.stringify({passed:true,fixtures:item.output.fixtures.length,keywordInstances:results.length}));
