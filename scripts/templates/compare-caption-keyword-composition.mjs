import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const centerX=Number(process.env.KEYWORD_CENTER_X??.5),centerYOverride=process.env.KEYWORD_CENTER_Y===undefined?undefined:Number(process.env.KEYWORD_CENTER_Y);
assert.ok(Number.isFinite(centerX)&&centerX>=0&&centerX<=1);assert.ok(centerYOverride===undefined||(Number.isFinite(centerYOverride)&&centerYOverride>=0&&centerYOverride<=1));
const textWidth=process.env.TEXT_WIDTH===undefined?undefined:Number(process.env.TEXT_WIDTH);
const root=process.env.COMPOSITION_OUTPUT??'/Users/zhengwei/Downloads/caption-keyword-composition-20260929';
assert.ok(textWidth===undefined||(Number.isFinite(textWidth)&&textWidth>=.1&&textWidth<=1));
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const text=await r.text();assert.ok(r.ok,text);return JSON.parse(text);}
assert.ok((await api('/schema')).productionAuthoringInput);
const before=await api('/dynamic-assets');
const application=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/caption-footprint-20260929/saved-application.json','utf8'));
assert.equal(application.assetRevision,3);assert.equal(before.assets.find(a=>a.id===application.assetId).revision,3);
const accent=before.assets.find(a=>a.id==='style-study-20260928-cyan-impact');assert.equal(accent.revision,2);
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/caption-footprint-20260929/designs.json','utf8'));
const first=samples[0];assert.equal(first.inputId,'input-99fa58d72fd4c9ad5cc2eed30b95b6a1');
for(const [i,range] of [[0,[8,9]],[1,[19,20]],[2,[21,24]]])first.semanticUnits[i]={...first.semanticUnits[i],keyword:{startWord:range[0],endWord:range[1]},rationale:'Author-selected contrast for combination inspection: house, calculator, never got upset; retain ASR word times and caption spans.'};
for(const sample of samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
const {template:base}=await api('/dynamic-assets/application',application);
const designs=[],insertions=[],validations=[];
for(const centerY of centerYOverride===undefined?(textWidth===undefined?[.70,.76]:[.70]):[centerYOverride]){
 const request={template:base,assetId:accent.id,assetRevision:accent.revision,instanceId:'emphasis',placement:{x:0,y:0,width:1,height:1},transform:{scale:.6,centerX,centerY},...(textWidth===undefined?{}:{textWidths:{headline:textWidth}}),intents:[]};
 const {template}=await api('/dynamic-assets/insert',request);
 template.id='composition-caption-keyword-'+Math.round(centerY*100)+'-x'+Math.round(centerX*100)+(textWidth===undefined?'':'-width'+Math.round(textWidth*100));template.name='逐词字幕与青色花字 · 高度'+Math.round(centerY*100)+(textWidth===undefined?'':' · 行宽'+Math.round(textWidth*100));
 assert.deepEqual(template.layouts[0].videoRegion,base.layouts[0].videoRegion);
 assert.deepEqual(template.elements.find(e=>e.id==='headline'),base.elements.find(e=>e.id==='headline'));
 validations.push(await api('/samples/validate',{template,samples}));
 designs.push({template,baseRevision:0});insertions.push({...request,template:undefined});
}
const manifest={name:textWidth===undefined?'逐词字幕与花字组合 · 两种高度对照':'逐词字幕与花字组合 · 行宽与位置对照',brief:`Keyword application center ${centerX}, ${centerYOverride??'per-design'}. `+(textWidth===undefined?'':`Explicit per-layer keyword width ${textWidth}, without changing font, motion or input times. `)+'Apply independent cyan keyword overlay at the explicit per-design center, scale .6, over saved caption v3 at .90. Three real inputs with measured words and unchanged framing. Explicit author keyword selection; no automatic subject avoidance or aesthetic acceptance.',previewOnly:true,designs,samples,idempotencyKey:'caption-keyword-composition-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});for(const [name,data] of Object.entries({designs:manifest,application,insertions,validations}))await fs.writeFile(`${root}/${name}.json`,JSON.stringify(data,null,2));
assert.deepEqual(await api('/dynamic-assets'),before);
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({root,batchId:batch.id}));
