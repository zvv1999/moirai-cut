import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/caption-phrases-20260929',prior='/Users/zhengwei/Downloads/caption-saved-20260929';
const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const original=JSON.parse(await fs.readFile(prior+'/designs.json','utf8')),style=JSON.parse(await fs.readFile(prior+'/style.json','utf8'));assert.deepEqual((await api('/dynamic-assets/'+style.id)).definition,style);
const designs=structuredClone(original.designs),t=designs[0].template;t.id='composition-caption-phrase-trial';t.name='清晰逐词字幕 · 自然词组分段';
const samples=structuredClone(original.samples),boundaries=[[0,10,16,24,30,38],[0,7,11,18,21,27,31,37],[0,8,14,25,28,36,45,50,54]],plans=[];
for(const [i,s] of samples.entries()){
 const input=await api('/inputs/'+s.inputId);assert.equal(input.transcript.revision,s.transcriptRevision);
 s.captionSpans=boundaries[i].slice(0,-1).map((startWord,j)=>({startWord,endWord:boundaries[i][j+1]}));s.captionPolicy={...t.segmentation,maxCharacters:i===0?16:60};
 const p=await api('/plan',{template:t,words:input.transcript.words,durationSeconds:input.input.durationSeconds,title:s.title,semanticUnits:s.semanticUnits,captionSpans:s.captionSpans,captionPolicy:s.captionPolicy});
 assert.equal(p.captions.length,s.captionSpans.length);let next=0;
 for(const c of p.captions){assert.equal(c.wordSpan.startWord,next);next=c.wordSpan.endWord;assert.equal(c.start,input.transcript.words[c.wordSpan.startWord].start);assert.equal(c.end,input.transcript.words[next-1].end);assert.ok(c.end-c.start>=.6,JSON.stringify({sample:s.title,caption:c}));}
 assert.equal(next,input.transcript.words.length);plans.push(p);
}
const manifest={name:t.name,brief:'Agent-authored display spans at grammatical phrase boundaries, grounded in original measured word alignment. Preserve semantic units and saved style v1. Keep rapid whole phrases together; compare footprint and cue changes. No aesthetic score inherited.',previewOnly:true,designs,samples,idempotencyKey:'caption-phrases-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.copyFile(prior+'/application.json',root+'/application.json');await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/plans.json',JSON.stringify(plans,null,2));const result=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(result,null,2));console.log(JSON.stringify({root,batchId:result.id,cues:plans.map(p=>p.captions.length)}));
