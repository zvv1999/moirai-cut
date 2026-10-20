import fs from 'node:fs/promises';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
const root='/Users/zhengwei/Downloads/bulb-live-20260929',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const source=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/note-paper-live-20260929/manifest.json')),inputs=[],samples=[];
for(const[i,s]of source.samples.entries()){
 const input=await api('/inputs/'+s.inputId);assert.equal(input.transcript.revision,s.transcriptRevision);inputs.push(input);
 if(i===1)assert.equal(input.transcript.words.slice(5,9).map(w=>w.text).join(' '),"we've learned so much.");
 samples.push({...s,semanticUnits:[{startWord:0,endWord:input.transcript.words.length,intent:'explanation',keyword:i===1?{startWord:5,endWord:9}:null,rationale:i===1?'Explicit statement about learning: a bulb supports the new-understanding phrase.':'No explicit new insight cue; do not insert the bulb merely because the subject is science or learning.'}],layoutPhrases:[]});
}
const definition=(await api('/dynamic-assets/style-study-20260929-bulb')).definition;assert.equal(definition.revision,1);
const caption={assetId:'style-pilot-20260923-caption',assetRevision:3,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.6,centerX:.5,centerY:.91},captionWidth:.86};
let {template}=await api('/dynamic-assets/application',caption);
const bulb={assetId:definition.id,assetRevision:1,instanceId:'bulb',placement:{x:0,y:0,width:1,height:1},transform:{scale:.23,centerX:.84,centerY:.26}};
template=(await api('/dynamic-assets/insert',{template,...bulb})).template;template.styles.find(s=>s.id==='headline-style').fill='#FFF8DD';
template.id='composition-bulb-science-20260929';template.name='科普随想 · 灵感点亮';template.tags=['候选待审','科普','灯泡','声音驱动'];template.description='完整逐词字幕，灯泡仅在输入标注的新认识关键词时段出现。右上预留装饰区由Agent审片选择，非自动检测；无匹配语义时只显示字幕。';
assert.ok((await api('/samples/validate',{template,samples})).validated);const designs=[{template,baseRevision:0}],manifest={name:template.name,brief:'Same saved editable bulb and full captions across three real inputs. One explicit learning cue and two negative semantic cases. Upper-right layout manually checked against speaker and background context; no automated detection or universal placement claim.',previewOnly:true,designs,samples,idempotencyKey:'bulb-live-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
for(const[k,v]of Object.entries({manifest,inputs,definition,applications:{caption,bulb}}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));const b=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(b,null,2));assert.deepEqual((await api('/dynamic-assets/'+definition.id)).definition,definition);console.log(b.id);
