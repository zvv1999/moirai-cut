import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/phrase-measured-matrix-20260929',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(body)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const original=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/caption-measured-chinese-20260929/designs.json'));
const samples=structuredClone(original.samples);
// Agent annotations from the inspected transcript, shared unchanged by every design.
samples[0].layoutPhrases=samples[1].layoutPhrases=[{wordSpan:{startWord:14,endWord:18}},{wordSpan:{startWord:33,endWord:37}}];
samples[2].layoutPhrases=[{wordSpan:{startWord:11,endWord:15}},{wordSpan:{startWord:35,endWord:37}},{wordSpan:{startWord:38,endWord:41}},{wordSpan:{startWord:65,endWord:69}},{wordSpan:{startWord:82,endWord:86}}];
const inputs=[];for(const sample of samples){const input=await api('/inputs/'+sample.inputId);assert.equal(input.transcript.revision,sample.transcriptRevision);inputs.push(input);}
const library=await api('/dynamic-assets');const designs=[],assets=[],applications=[];
for(const [index,id] of ['style-study-20260924-echo','style-pilot-20260923-adaptive','style-pilot-20260923-offset'].entries()){
 const {definition}=await api('/dynamic-assets/'+id);assets.push(definition);
 const application={assetId:id,assetRevision:definition.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.65,centerX:.5,centerY:.5}};applications.push(application);
 const {template}=await api('/dynamic-assets/application',application);template.id='phrase-measured-20260929-'+index;designs.push({template,baseRevision:0});
 for(let i=0;i<samples.length;i++){
  const plain=structuredClone(samples[i]);delete plain.layoutPhrases;
  await fs.writeFile(`${root}/before-${index}-${i}.json`,JSON.stringify(await api('/dynamic-assets/sample-preview',{template,sample:plain}),null,2));
 }
}
const manifest={name:'内容短语 × 三款花字 · 实测中文',brief:'Three current saved styles over two synthesis rates and a longer narration, using existing local audio with measured word alignment. Shared Agent-authored phrase hints; black backgrounds, not live-action. Preserve audio, transcript and keyword events. No listening or visual score claim.',previewOnly:true,designs,samples,idempotencyKey:'phrase-measured-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
for(const [name,value]of Object.entries({manifest,assets,applications,inputs}))await fs.writeFile(root+'/'+name+'.json',JSON.stringify(value,null,2));
assert.deepEqual(await api('/dynamic-assets'),library);
const submission=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submission,null,2));console.log(JSON.stringify({batchId:submission.id,root}));
