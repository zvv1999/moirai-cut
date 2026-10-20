import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/decoration-studies-2026-09-28';
if(process.env.PILOT_STYLE&&!['idea','learning','celebrate'].includes(process.env.PILOT_STYLE))throw Error('Unknown PILOT_STYLE');
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const raw=await r.text();if(!r.ok)throw Error(raw);return JSON.parse(raw);}
const catalog=(await api('/dynamic-assets')).assets;
const assets=(await api('/assets')).assets;
const motion=(property,values)=>({property,keys:values.map(([time,value,easing='linear'])=>({time,value,easing}))});
const designs=[],effects=[];
for(const [key,name,mediaName] of [['idea','灵感提示 · 灯泡轻弹','图标 · 灵感提示'],['learning','居家学习 · 插画浮入','插画 · 居家阅读 · 紧凑透明边界'],['celebrate','小小庆祝 · 彩纸散开',null]]){
 if(process.env.PILOT_STYLE&&process.env.PILOT_STYLE!==key)continue;
 const d=(await api('/dynamic-assets/create',{name,purpose:'decoration',canvas:{width:720,height:720,fps:30}})).definition;
 d.id='style-study-20260928-'+key;d.purposes=['decoration'];d.inputs=[];
 d.provenance='Original editable motion composition. Native independent layers; no AI-generated artwork. '+(mediaName?assets.find(a=>a.name===mediaName).provenance:'Native rectangle confetti shapes; no external artwork.');
 const e=d.layers.find(l=>l.content.kind==='element').content.element;
 e.id='decoration';e.description=name;e.binding='keyword';e.timing={anchor:'keyword_start',minSeconds:0.1,maxSeconds:600,offsetSeconds:0};
 e.region={x:0.25,y:0.25,width:0.5,height:0.5};e.motionTiming={enterEnd:0.2,exitStart:0.8,enterSeconds:0.16,exitSeconds:0.1};
 const opacity=motion('opacity',[[0,0,'ease_out'],[0.2,1],[0.8,1,'ease_in'],[1,0]]);
 e.motions=[opacity,motion('scale',[[0,0.65,'overshoot'],[0.2,1],[1,1]])];
 if(mediaName){
  const asset=assets.find(a=>a.name===mediaName);e.features.representation='image';e.resourceId='artwork';e.styleId=null;
  d.resourceSlots=[{id:'artwork',representation:'image',description:mediaName,tags:asset.tags}];d.resourceBindings=[{slotId:'artwork',assetId:asset.id,enabled:true}];
  if(key==='learning'){
   e.region={x:0.05,y:0.15,width:0.9,height:0.675};e.motions=[opacity,motion('y',[[0,36,'ease_out'],[0.2,0],[0.8,-5],[1,-5]])];d.styles=[];
  }else{
   const backing=structuredClone(e);Object.assign(backing,{id:'idea-disc',description:'灵感浅色衬底',resourceId:null,styleId:d.styles[0].id,z:e.z-1,region:{x:0.17,y:0.17,width:0.66,height:0.66}});backing.features.representation='ellipse';d.styles[0].fill='#FFF1C9';d.layers.push({parentId:'root',content:{kind:'element',element:backing}});
   e.motions.push(motion('rotation',[[0,-16,'ease_out'],[0.12,5,'ease_out'],[0.2,0],[1,0]]));
  }
 }else{
  d.layers=d.layers.filter(l=>l.content.kind==='group');const style=d.styles[0];d.styles=[];
  for(let i=0;i<7;i++){
   const part=structuredClone(e),angle=-Math.PI+i*Math.PI/6,dx=Math.cos(angle)*180,dy=Math.sin(angle)*180;
   Object.assign(part,{id:'paper-'+i,description:'彩纸 '+(i+1),styleId:'paper-style-'+i,region:{x:0.48,y:0.57,width:0.045,height:i%2?0.09:0.06},z:i});
   part.motions=[opacity,motion('x',[[0,0,'ease_out'],[0.2,dx],[0.8,dx*1.12],[1,dx*1.15]]),motion('y',[[0,0,'ease_out'],[0.2,dy],[0.8,dy+45],[1,dy+65]]),motion('rotation',[[0,i*30],[0.2,i*30+80],[1,i*30+170]])];
   d.layers.push({parentId:'root',content:{kind:'element',element:part}});d.styles.push({...style,id:part.styleId,fill:['#ED6A5A','#F4C95D','#62C9BD','#7A86D8'][i%4]});
  }
 }
 const current=catalog.find(a=>a.id===d.id);d.revision=current?.revision??0;
 const normalized=(await api('/dynamic-assets/inspect',d)).definition;
 const saved=current&&isDeepStrictEqual(current,normalized)?current:(await api('/dynamic-assets',{definition:normalized,baseRevision:d.revision,idempotencyKey:'decoration-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
 effects.push({id:saved.id,revision:saved.revision,name:saved.name});
 const {template}=await api('/dynamic-assets/application',{assetId:saved.id,assetRevision:saved.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:key==='learning'?0.6:key==='celebrate'?0.65:0.38,centerX:0.22,centerY:0.72}});
 template.id='decoration-'+key;template.id+='-'+createHash('sha256').update(JSON.stringify(template)).digest('hex').slice(0,16);designs.push({template,baseRevision:0});
}
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8'));
for(const sample of samples){const input=await api('/inputs/'+sample.inputId);if(input.transcript.revision!==sample.transcriptRevision)throw Error('Transcript changed');}
const manifest={idempotencyKey:'decoration-studies-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex'),name:'灯泡、学习插画与彩纸 · 独立装饰试制',brief:'Three native editable motion decorations; licensed existing artwork retained. Keyword events provide measured timing. Repeated application is a stress test, not automatic semantic relevance or aesthetic approval.',previewOnly:true,designs,samples};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/effects.json',JSON.stringify(effects,null,2));console.log(JSON.stringify({effects,manifest:root+'/designs.json'}));
