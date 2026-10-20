import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/offset-formats-2026-09-28';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const assetId=process.env.STYLE_ASSET_ID??'style-pilot-20260923-offset',revision=Number(process.env.STYLE_REVISION??4);
const saved=(await api('/dynamic-assets/'+assetId)).definition;assert.equal(saved.revision,revision);
const chinese=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8')).samples.find(s=>s.inputId==='input-941335914fe590272ed1f8cef9af917a');
const alex=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/offset-public-baseline-2026-09-28/designs.json','utf8')).samples.find(s=>s.inputId==='input-80f248b968faad87d3460b76ec8badd1');
assert.ok(chinese&&alex);const samples=process.env.REAL_INPUT_ONLY?[alex]:[chinese,alex];
for(const sample of samples){assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);sample.focalPoint={x:.5,y:.4};}
const designs=[];
for(const [format,width,height] of [['landscape',1280,720],['portrait',720,1280],['square',720,720]]){
 const {template}=await api('/dynamic-assets/application',{assetId,assetRevision:revision,canvas:{width,height,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:Number(process.env.STYLE_SCALE??.65),centerX:Number(process.env.STYLE_CENTER_X??.5),centerY:Number(process.env.STYLE_CENTER_Y??.85)}});
 template.name=saved.name+' · '+format;designs.push({template,baseRevision:0});
}
const manifest={name:saved.name+' · 双语三画幅检查',brief:'Chinese measured audio-only and English original interview. Application transform is recorded in each template; source focal .5/.4. Check actual readability and crop; no automatic subject avoidance, listening or aesthetic acceptance claimed.',previewOnly:true,designs,samples,idempotencyKey:'keyword-formats-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));assert.deepEqual((await api('/dynamic-assets/'+assetId)).definition,saved);
console.log(JSON.stringify({batchId:batch.id,root,designs:designs.length,samples:samples.length}));
