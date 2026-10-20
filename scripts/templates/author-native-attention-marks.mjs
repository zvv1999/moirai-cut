import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/native-attention-marks-2026-09-28';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const text=await r.text();assert.ok(r.ok,text);return JSON.parse(text);}
const catalog=(await api('/dynamic-assets')).assets,designs=[],effects=[];
const motion=(property,keys)=>({property,keys:keys.map(([time,value,easing='linear'])=>({time,value,easing}))});
for(const key of ['arrow','rings']){
 let d;
 if(key==='arrow'){
  // The reviewed reusable geometry and usage guide have one source; seeds initialize missing styles only.
  d=JSON.parse(await fs.readFile(new URL('./seeds/arrow.json',import.meta.url),'utf8'));
 }else{
  d=(await api('/dynamic-assets/create',{name:'圈选提示 · 双圈强调',purpose:'decoration',canvas:{width:720,height:720,fps:30}})).definition;
  d.id='style-study-20260928-rings';d.inputs=[];d.purposes=['decoration'];d.provenance='Original editable native geometric attention mark. No external artwork, rasterization or generated-image claim. Manually selected application position; not automatic object tracking.';
  const seed=d.layers.find(l=>l.content.kind==='element').content.element,style=d.styles[0];d.layers=d.layers.filter(l=>l.content.kind==='group');d.styles=[];
  function layer(id,region,angle,width,color,z){
   const description=(id.startsWith('ring-main')?'主圈':'辅助圈')+(id.endsWith('-edge')?'描边':'');
   const e=structuredClone(seed);Object.assign(e,{id,description,region,z,binding:'keyword',literal:null,styleId:id+'-style',timing:{anchor:'keyword_start',minSeconds:0.1,maxSeconds:600,offsetSeconds:0},motionTiming:{enterEnd:0.2,exitStart:0.8,enterSeconds:0.18,exitSeconds:0.1}});
   e.features.representation='ellipse';e.features.outline=true;
   e.motions=[motion('opacity',[[0,0,'ease_out'],[0.2,1],[0.8,1],[1,0]]),motion('rotation',[[0,angle],[1,angle]]),motion('scale',[[0,0.82,'overshoot'],[0.2,1],[1,1]])];
   d.layers.push({parentId:'root',content:{kind:'element',element:e}});d.styles.push({...structuredClone(style),id:e.styleId,fill:color,stroke:color,strokeWidth:width});
  }
  for(const [suffix,color,stroke,z] of [['edge','#233032',17,0],['ink','#FFE38A',8,2]]){
   layer('ring-main-'+suffix,{x:.20,y:.34,width:.60,height:.32},-7,stroke,color,z);
   layer('ring-echo-'+suffix,{x:.19,y:.35,width:.62,height:.30},5,stroke*.65,color,z+1);
  }
 }
 const current=catalog.find(a=>a.id===d.id);let saved;
 if(key==='arrow'&&current){
  saved=(await api('/dynamic-assets/'+d.id)).definition;
 }else{
  d.revision=current?.revision??0;
  const normalized=(await api('/dynamic-assets/inspect',d)).definition;
  saved=current&&isDeepStrictEqual(current,normalized)?current:(await api('/dynamic-assets',{definition:normalized,baseRevision:d.revision,idempotencyKey:'attention-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
 }
 effects.push({id:saved.id,revision:saved.revision,name:saved.name});
 let {template}=await api('/dynamic-assets/application',{assetId:saved.id,assetRevision:saved.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:key==='arrow'?0.8:1,centerX:key==='arrow'?0.30:0.63,centerY:key==='arrow'?0.70:0.35}});
 if(key==='arrow'){
  const full={x:0,y:0,width:1,height:1};
  let host=(await api('/dynamic-assets/application',{assetId:'style-study-20260928-signal',assetRevision:2,canvas:template.canvas,placement:full,transform:{scale:0.7,centerX:0.60,centerY:0.72}})).template;
  host=(await api('/dynamic-assets/insert',{template:host,assetId:'style-pilot-20260923-caption',assetRevision:2,instanceId:'caption',placement:full,transform:{scale:0.6,centerX:0.5,centerY:0.92},captionWidth:0.84})).template;
  const request={template:host,assetId:saved.id,assetRevision:saved.revision,instanceId:'mark',placement:full,transform:{scale:0.55,centerX:0.25,centerY:0.72}};
  const probe=(await api('/dynamic-assets/insert',request)).template;
  const parts=probe.elements.filter(e=>e.id.startsWith('mark--'));
  const left=Math.min(...parts.map(e=>e.region.x)),right=Math.max(...parts.map(e=>e.region.x+e.region.width));
  const top=Math.min(...parts.map(e=>e.region.y)),bottom=Math.max(...parts.map(e=>e.region.y+e.region.height));
  request.attachments=parts.map(e=>({elementId:e.id,relativeTo:'headline',placement:'left',referenceBounds:'text_box',followMotion:true,gap:0.028,offsetX:e.region.x+e.region.width-right,offsetY:e.region.y+e.region.height/2-(top+bottom)/2}));
  template=(await api('/dynamic-assets/insert',request)).template;
  template.name='箭头指向 · 独立字幕与重点词组合';
 }
 template.id+='-'+key;designs.push({template,baseRevision:0});
}
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8'));
for(const sample of samples)assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);
const manifest={idempotencyKey:'attention-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex'),name:'箭头与双圈 · 原生装饰验证',brief:'Two editable native geometric marks, manually placed. Fixed circle size is adjustable, not automatically fit to an object or text. Three measured audio inputs; repeated keyword activation is a motion stress test, not semantic relevance approval.',previewOnly:true,designs,samples};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/effects.json',JSON.stringify(effects,null,2));
console.log(JSON.stringify({root,effects}));
