import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/clock-detail-20260929';
const api=async(p,b)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+p,{method:b?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:b?JSON.stringify(b):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const original=(await api('/dynamic-assets/style-study-20260929-clock')).definition;
const d=structuredClone(original);Object.assign(d,{id:'style-clock-detail-candidate-20260929',revision:0,name:'候选 · 精细刻度时钟',provenance:'Original editable clock refinement: slim teal casing, warm paper face, twelve hour markers and brass central pin. Quarter-turn is a qualitative time cue, not a clock reading or elapsed-time indicator. Pending visual and audio review; not an additional qualified design.'});
const element=id=>d.layers.find(l=>l.content.element?.id===id).content.element;
const style=id=>d.styles.find(s=>s.id===element(id).styleId);
for(const layer of d.layers){const e=layer.content.element;if(e){e.z+=3;e.motionTiming.enterSeconds=.28;}}
style('rim').fill='#224F55';style('face').fill='#FAF6EA';element('face').region={x:.169,y:.169,width:.662,height:.662};
for(const id of ['hour','hour-tip','hub'])style(id).fill='#224F55';for(const id of ['minute','minute-tip'])style(id).fill='#DB9B46';
const add=(id,description,region,fill,z)=>{const e=structuredClone(element('face'));Object.assign(e,{id,description,region,z,styleId:id+'-style'});d.layers.push({parentId:'root',content:{kind:'element',element:e}});d.styles.push({...structuredClone(style('face')),id:e.styleId,description,fill});};
add('case-depth','表框背衬',{x:.14,y:.157,width:.72,height:.72},'#173C42',0);
for(const [id,x,y,w,h] of [['mark-north',.494,.24,.012,.04],['mark-east',.72,.494,.04,.012],['mark-south',.494,.72,.012,.04],['mark-west',.24,.494,.04,.012]]){element(id).region={x,y,width:w,height:h};style(id).fill='#537375';}
for(let h=0;h<12;h++){if(h%3===0)continue;const a=h*Math.PI/6,r=.25,size=.014;add('hour-dot-'+h,`${h}点圆刻度`,{x:.5+Math.sin(a)*r-size/2,y:.5-Math.cos(a)*r-size/2,width:size,height:size},'#9DAF9F',5);}
element('hub').region={x:.464,y:.464,width:.072,height:.072};add('hub-pin','黄铜轴心',{x:.487,y:.487,width:.026,height:.026},'#DB9B46',9);
const existing=(await api('/dynamic-assets')).assets.find(a=>a.id===d.id);const comparable=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e12)/1e12:v));if(existing)assert.deepEqual(comparable({...existing,revision:0}),comparable(d),'Existing candidate must match within JSON floating-point precision');
const saved=existing??(await api('/dynamic-assets',{definition:d,baseRevision:0,idempotencyKey:'clock-detail-save-'+createHash('sha256').update(JSON.stringify(d)).digest('hex')})).definition;
assert.deepEqual((await api('/dynamic-assets/'+original.id)).definition,original);
const application={intents:['emphasis'],assetId:saved.id,assetRevision:saved.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.4,centerX:.83,centerY:.25}};
const template=(await api('/dynamic-assets/application',application)).template;
const prior=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/cyan-accent-saved-20260929/designs.json','utf8'));
const samples=structuredClone(prior.samples.slice(0,2));for(const [i,sample] of samples.entries())for(const [j,unit] of sample.semanticUnits.entries())if(!(i===0?j===1:j<2)){unit.intent='neutral';delete unit.keyword;}
for(const sample of samples){assert.equal((await api('/inputs/'+sample.inputId)).transcript.revision,sample.transcriptRevision);for(const unit of sample.semanticUnits)unit.rationale='Author-selected time-related term, retaining measured word timing; not automatic semantic detection.';}
const manifest={name:'精细刻度时钟 · 时间语义样片',brief:'Saved editable clock candidate on measured time-related words in two sources. Top-right placement, no source-project edits; pending aesthetic review and listening.',previewOnly:true,designs:[{template,baseRevision:0}],samples,idempotencyKey:'clock-detail-'+createHash('sha256').update(JSON.stringify({template,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});for(const[n,data]of Object.entries({'style.json':saved,'application.json':application,'designs.json':manifest}))await fs.writeFile(root+'/'+n,JSON.stringify(data,null,2));const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({root,batchId:batch.id,layers:saved.layers.length}));
