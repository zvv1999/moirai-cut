import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/caption-formats-2026-09-28';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const saved=(await api('/dynamic-assets/style-pilot-20260923-caption')).definition;assert.equal(saved.revision,3);
const chinese=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8')).samples.find(s=>s.inputId==='input-941335914fe590272ed1f8cef9af917a');
const alex=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/quotation-right-2026-09-28/designs.json','utf8')).samples[0];
const samples=process.env.REAL_INPUT_ONLY? [alex]:[chinese,alex];
if(process.env.SOURCE_FOCUS_Y)for(const sample of samples)sample.focalPoint={x:.5,y:Number(process.env.SOURCE_FOCUS_Y)};
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const designs=[];
for(const [format,width,height] of [['landscape',1280,720],['portrait',720,1280],['square',720,720]]){
 if(process.env.PORTRAIT_SQUARE_ONLY&&format==='landscape')continue;
 const {template}=await api('/dynamic-assets/application',{assetId:saved.id,assetRevision:3,canvas:{width,height,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:Number(process.env.STYLE_SCALE??.65),centerX:Number(process.env.STYLE_CENTER_X??.5),centerY:Number(process.env.STYLE_CENTER_Y??.9)},captionWidth:.84,...(process.env.VIDEO_HEIGHT?{videoRegion:{x:0,y:0,width:1,height:Number(process.env.VIDEO_HEIGHT)}}:{})});
 template.name=saved.name+' · '+format;
 designs.push({template,baseRevision:0});
}
const manifest={name:'动态字幕 v3 · 中文与实拍三画幅',brief:'Native measured Chinese audio-only and English interview word timing. Tests geometry, wrapping and motion across three aspect ratios; not aesthetic or listening acceptance.',previewOnly:true,designs,samples,idempotencyKey:'caption-formats-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));
assert.deepEqual((await api('/dynamic-assets/'+saved.id)).definition,saved);
console.log(JSON.stringify({batchId:batch.id,root}));
