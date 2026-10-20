import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/bold-growth-20260929',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(body)}:undefined);const text=await r.text();assert.ok(r.ok,text);return JSON.parse(text);}
const seed=(await api('/dynamic-assets/style-study-20260928-growth')).definition;
const definition={...structuredClone(seed),id:'style-study-20260929-bold-growth',revision:0,name:'复古增长 · 三阶跃升',layers:[structuredClone(seed.layers[0])],styles:[],provenance:'Original editable stepped growth motif. Cream silhouette, dark offset depth, red and yellow bars. Qualitative decoration, not measured data. No absolute audio times or reference-video geometry in this asset. Visual acceptance pending.'};
const baseElement=seed.layers.find(l=>l.content.element?.id==='baseline').content.element;
const baseStyle=seed.styles[0];
for(let i=0;i<3;i++){
 const h=[.23,.38,.54][i],x=.19+i*.22,y=.77-h;
 const scaleKeys=[{time:0,value:.12,easing:'linear'},{time:.04*i,value:.12,easing:'ease_out'},{time:.22+.04*i,value:1,easing:'linear'},{time:1,value:1,easing:'linear'}].filter((k,j,a)=>!j||k.time!==a[j-1].time);
 // Whole bar components share a baseline-anchored deformation, including depth.
 for(const [part,dx,dy,w,hh,color,z] of [['depth',.022,.022,.17,h,'#241C19',i],['edge',0,0,.17,h,'#FFF2C9',3+i],['fill',.018,.018,.134,h-.036,['#B34531','#E99A38','#F2DA74'][i],6+i]]){
  const id=`bar-${i}-${part}`,region={x:x+dx,y:y+dy,width:w,height:hh};
  const center=region.y+hh/2;
  const e={...structuredClone(baseElement),id,description:`增长柱${i+1} ${part}`,region,z,styleId:id+'-style',motionTiming:{enterEnd:.3,enterSeconds:.22,exitStart:.85,exitSeconds:.06},motions:[{property:'scale_y',keys:scaleKeys},{property:'y',keys:scaleKeys.map(k=>({...k,value:(.77-center)*720*(1-k.value)}))}]};
  definition.layers.push({parentId:'root',content:{kind:'element',element:e}});
  definition.styles.push({...baseStyle,id:e.styleId,description:e.description,fill:color,strokeWidth:0});
 }
}
const normalized=(await api('/dynamic-assets/inspect',definition)).definition;
const catalog=await api('/dynamic-assets');let saved;
if(catalog.assets.some(a=>a.id===definition.id)){saved=(await api('/dynamic-assets/'+definition.id)).definition;assert.deepEqual(saved,{...normalized,revision:saved.revision});}
else saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:0,idempotencyKey:'bold-growth-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
await fs.writeFile('scripts/templates/seeds/bold-growth.json',JSON.stringify({...saved,revision:0},null,2));
const application={assetId:saved.id,assetRevision:saved.revision,canvas:{width:544,height:960,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.24,centerX:.18,centerY:.13}};
const applied=await api('/dynamic-assets/application',application);await fs.writeFile(root+'/application-response.json',JSON.stringify(applied,null,2));
const template=applied.template;assert.ok(template);template.id='bold-growth-original-20260929';template.name='复古增长 · 原片应用对照';
const samples=[];
for(const folder of ['chinese-growth-original-20260929','chinese-growth-cue-20260929']){const prior=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/'+folder+'/manifest.json'));samples.push(prior.samples[0]);}
const manifest={name:template.name,brief:'Compare a native stepped red/yellow/cream growth motif with the prior mint round badge. Same original source inputs, measured phrase timing, scale and placement. Existing baked captions retained. Isolated samples only; no reference project changes. Two inputs include the original and a prior derivative, not independent content diversity.',previewOnly:true,designs:[{template,baseRevision:0}],samples};
manifest.idempotencyKey='bold-growth-'+createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
for(const[k,v]of Object.entries({definition:saved,application,manifest}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({id:batch.id,root}));
