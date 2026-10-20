import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/adaptive-reading-real-2026-09-29';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const definition=(await api('/dynamic-assets/style-pilot-20260923-adaptive')).definition;assert.equal(definition.revision,Number(process.env.STYLE_REVISION??4));
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/offset-public-baseline-2026-09-28/designs.json','utf8'));
assert.equal(samples.length,3);
if(process.env.INCLUDE_CHINESE==='1'){
 const chinese=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8')).samples.find(s=>s.inputId==='input-941335914fe590272ed1f8cef9af917a');
 assert.ok(chinese);samples.push(chinese);
}
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const portrait=process.env.PORTRAIT==='1';
if(portrait){
 for(const sample of samples){
  sample.focalPoint={x:sample.inputId==='input-99fa58d72fd4c9ad5cc2eed30b95b6a1'?.64:.51,y:.4};
 }
}
const application={assetId:definition.id,assetRevision:definition.revision,canvas:{width:portrait?720:1280,height:portrait?1280:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:Number(process.env.STYLE_SCALE??.65),centerX:Number(process.env.CENTER_X??.22),centerY:Number(process.env.CENTER_Y??.18)}};
if(process.env.VIDEO_HEIGHT){
 const height=Number(process.env.VIDEO_HEIGHT);assert.ok(height>0&&height<=1);application.videoRegion={x:0,y:0,width:1,height};
}
const {template}=await api('/dynamic-assets/application',application);
const designs=[{template,baseRevision:0}];
const manifest={name:'奶油底签 · 人物场景与长短词适配',brief:`Revision ${definition.revision} cream adaptive backing and stable readable text. Three existing distinct interview speakers; optional measured Chinese audio sample. Original audio and word alignment retained. Application placement is explicit, not automatic subject avoidance. Preview-only independent projects; visual review pending.`,previewOnly:true,designs,samples,idempotencyKey:'adaptive-r'+definition.revision+'-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.writeFile(root+'/application.json',JSON.stringify(application,null,2));await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({batchId:batch.id,root}));
