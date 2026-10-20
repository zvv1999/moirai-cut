import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/note-paper-live-20260929',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const old=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/editorial-cross-input-20260929/manifest.json'));
const ranges=[[21,24],[32,34],[32,34]],samples=[],inputs=[];
for(const [i,s] of old.samples.entries()){
 const input=await api('/inputs/'+s.inputId);assert.equal(input.transcript.revision,s.transcriptRevision);inputs.push(input);
 const [startWord,endWord]=ranges[i];
 samples.push({...s,semanticUnits:[{startWord:0,endWord:input.transcript.words.length,intent:'explanation',keyword:{startWord,endWord},rationale:'Human-selected spoken takeaway: '+input.transcript.words.slice(startWord,endWord).map(w=>w.text).join(' ')}],layoutPhrases:[{wordSpan:{startWord,endWord}}]});
}
const definition=(await api('/dynamic-assets/style-study-20260929-note-paper')).definition;
assert.equal(definition.revision,1);
const cap={assetId:'style-pilot-20260923-caption',assetRevision:3,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.6,centerX:.5,centerY:.91},captionWidth:.86};
let {template}=await api('/dynamic-assets/application',cap);
const note={assetId:definition.id,assetRevision:definition.revision,instanceId:'note',placement:{x:0,y:0,width:1,height:1},transform:{scale:.65,centerX:.24,centerY:.25}};
template=(await api('/dynamic-assets/insert',{template,...note})).template;
template.styles.find(s=>s.id==='headline-style').fill='#FFF9EC';
template.id='composition-note-paper-live-20260929';template.name='访谈注释 · 暖黄便签';template.description='完整逐词字幕与独立便签重点词；同一画内位置验证三种真实背景，人工选择关键词，尚未自动避让。';template.tags=['候选待审','便签','访谈'];
assert.ok((await api('/samples/validate',{template,samples})).validated);
const designs=[{template,baseRevision:0}],manifest={name:'注释便签 · 三种真实背景',brief:'Same saved note-paper r1, same landscape placement and full captions across three speakers/backgrounds. Keywords selected from measured source words. No per-case layout edits, no automatic obstacle detection, visual acceptance pending.',previewOnly:true,designs,samples,idempotencyKey:'note-live-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
for(const [k,v]of Object.entries({manifest,inputs,definition,applications:{caption:cap,note}}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));assert.deepEqual((await api('/dynamic-assets/'+definition.id)).definition,definition);console.log(batch.id);
