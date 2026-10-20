import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/paper-note-composition-formats-2026-09-28';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const before=await api('/dynamic-assets');
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8'));
for(const sample of samples)sample.focalPoint={x:0.64,y:0.5};
for(const sample of samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
const designs=[];
if(process.env.PILOT_FORMAT)assert.ok(['landscape','portrait','square'].includes(process.env.PILOT_FORMAT));
for(const [format,width,height] of [['landscape',1280,720],['portrait',720,1280],['square',720,720]]){
 if(process.env.PILOT_FORMAT&&format!==process.env.PILOT_FORMAT)continue;
 const canvas={width,height,fps:30}, full={x:0,y:0,width:1,height:1};
 let {template}=await api('/dynamic-assets/application',{assetId:'style-study-20260924-note',assetRevision:4,canvas,placement:full,transform:{scale:format==='square'?0.75:0.82,centerX:0.5,centerY:0.68}});
 assert.equal(template.styles.find(style=>style.id==='headline-style').maxLines,2);
 template=(await api('/dynamic-assets/insert',{template,assetId:'style-pilot-20260923-caption',assetRevision:2,instanceId:'caption',placement:full,transform:{scale:0.62,centerX:0.5,centerY:format==='square'?0.90:0.93},captionWidth:0.84})).template;
 template.name='纸签与逐词字幕 · '+format;
 template.id='style-adaptation-'+createHash('sha256').update(JSON.stringify(template)).digest('hex').slice(0,20);
 designs.push({template,baseRevision:0});
}
const manifest={idempotencyKey:'style-adaptation-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex'),name:'纸签 v4 与独立字幕 · 三画幅适配',brief:'Verify saved paper note revision 4 plus independent caption revision 2. Source focal point is explicitly set to x=0.64, y=0.5; not automatic face tracking. Three output aspect ratios, measured English and Chinese word timing. Two English inputs share a scene; Chinese input is audio-only. No diversity or aesthetic acceptance claimed.',previewOnly:true,designs,samples};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));assert.deepEqual(await api('/dynamic-assets'),before);
console.log(JSON.stringify({batchId:batch.id,root,designs:designs.length,samples:samples.length}));
