import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/composed-style-pilot-2026-09-28';
async function api(path,body){
 const response=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
 const text=await response.text();if(!response.ok)throw Error(text);return JSON.parse(text);
}
assert.ok((await api('/schema')).productionAuthoringInput);
const catalog=(await api('/dynamic-assets')).assets;
const pinned=[['style-pilot-20260923-caption',2],['style-study-20260928-signal',1],['style-study-20260928-idea',1]];
for(const [id,revision] of pinned)assert.equal(catalog.find(asset=>asset.id===id)?.revision,revision,`Review changed style ${id} before authoring`);
let {template}=await api('/dynamic-assets/application',{assetId:pinned[0][0],assetRevision:pinned[0][1],canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.65,centerX:0.5,centerY:0.9},captionWidth:0.84});
for(const [id,revision,instanceId,placement] of [
 [pinned[1][0],1,'keyword',{x:0,y:0.25,width:1,height:0.75}],
 [pinned[2][0],1,'idea',{x:0.03,y:0.49,width:0.18,height:0.32}],
])template=(await api('/dynamic-assets/insert',{template,assetId:id,assetRevision:revision,instanceId,placement})).template;
// Application-level layout keeps the three library styles independent.
// Both lamp layers follow the keyword's measured bounds, with matching centers.
for(const [id,width,gap] of [['idea--idea-disc',0.07,0.021],['idea--decoration',0.053,0.0295]]){
 const element=template.elements.find(element=>element.id===id);assert.ok(element);
 element.region.width=width;element.region.height=width*1280/720;
 template.composition.spatialRelations.push({elementId:id,relativeTo:'keyword--headline',placement:'left',referenceBounds:'text_box',gap,offsetX:0,offsetY:0,followMotion:true});
}
template.styles.find(style=>style.id==='keyword--headline-style').maxLines=2;
template.name='清晰讲述 · 字幕、侧标与灵感提示';
template.id='composed-signal-idea';
template.id+='-'+createHash('sha256').update(JSON.stringify(template)).digest('hex').slice(0,20);
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8'));
for(const sample of samples){const input=await api('/inputs/'+sample.inputId);assert.equal(input.transcript.revision,sample.transcriptRevision);}
const designs=[{template,baseRevision:0}];
const manifest={idempotencyKey:'composed-style-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex'),name:template.name,brief:'Composition trial of three independently reusable styles: active-word captions, keyword side label and lightbulb decoration. Measured words drive timing. Repeated icons test overlap and reuse, not semantic recommendation. No aesthetic acceptance implied.',previewOnly:true,designs,samples};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/pinned-styles.json',JSON.stringify(pinned,null,2));
console.log(JSON.stringify({manifest:root+'/designs.json',samples:samples.length}));
