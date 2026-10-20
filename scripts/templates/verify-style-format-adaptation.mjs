import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/style-format-adaptation-2026-09-28';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const before=await api('/dynamic-assets');
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8'));
for(const sample of samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
const designs=[];
for(const [format,width,height] of [['landscape',1280,720],['portrait',720,1280],['square',720,720]]){
 const canvas={width,height,fps:30}, full={x:0,y:0,width:1,height:1};
 let {template}=await api('/dynamic-assets/application',{assetId:'style-study-20260928-signal',assetRevision:2,canvas,placement:full,transform:{scale:0.8,centerX:0.56,centerY:0.65}});
 assert.equal(template.styles.find(style=>style.id==='headline-style').maxLines,2);
 template=(await api('/dynamic-assets/insert',{template,assetId:'style-pilot-20260923-caption',assetRevision:2,instanceId:'caption',placement:full,transform:{scale:0.65,centerX:0.5,centerY:0.9},captionWidth:0.84})).template;
 const iconWidth=0.1, iconHeight=iconWidth*width/height;
 const request={template,assetId:'style-study-20260928-idea',assetRevision:1,instanceId:'idea',placement:{x:0.05,y:0.55,width:iconWidth,height:iconHeight}};
 const probe=(await api('/dynamic-assets/insert',request)).template;
 const disk=probe.elements.find(e=>e.id==='idea--idea-disc'),lamp=probe.elements.find(e=>e.id==='idea--decoration');
 request.attachments=[disk,lamp].map(e=>({elementId:e.id,relativeTo:'headline',placement:'left',gap:0.025+(disk.region.width-e.region.width)/2,offsetX:0,offsetY:0,referenceBounds:'text_box',followMotion:true}));
 template=(await api('/dynamic-assets/insert',request)).template;
 template.name='独立样式适配 · '+format;
 template.id='style-adaptation-'+createHash('sha256').update(JSON.stringify(template)).digest('hex').slice(0,20);
 designs.push({template,baseRevision:0});
}
const manifest={idempotencyKey:'style-adaptation-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex'),name:'独立样式 · 三画幅与长词适配',brief:'Verify audio-driven independent caption, multiline keyword and text-bound icon styles. Three output aspect ratios, measured English and Chinese word timing. Two English inputs share a scene; Chinese input is audio-only. No diversity or aesthetic acceptance claimed.',previewOnly:true,designs,samples};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));assert.deepEqual(await api('/dynamic-assets'),before);
console.log(JSON.stringify({batchId:batch.id,root,designs:designs.length,samples:samples.length}));
