import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/cyan-accent-saved-20260929';
const api=async(p,b)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+p,{method:b?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:b?JSON.stringify(b):undefined});const raw=await r.text();assert.ok(r.ok,raw);return JSON.parse(raw)};
const prior=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/cyan-accent-marks-20260929/designs.json','utf8'));
const t=prior.designs[0].template;
const original=(await api('/dynamic-assets/style-cyan-translucent-candidate-20260929')).definition;
const d=structuredClone(original);Object.assign(d,{id:'style-cyan-accent-candidate-20260929',revision:0,name:'候选 · 青色双笔触花字',canvas:t.canvas,styles:t.styles,spatialRelations:t.composition.spatialRelations,provenance:'Editable cyan decorative keyword candidate. Balanced two-line type, hard shadow and independent measured-bound accent marks with dark backings. Pending visual and audio acceptance; not an additional qualified design.'});
d.layers=[{parentId:null,content:{kind:'group',id:'root',region:{x:0,y:0,width:1,height:1}}},...t.elements.map(element=>({parentId:'root',content:{kind:'element',element}}))];
for(let i=0;i<2;i++){
 const mark=d.layers.find(l=>l.content.element?.id==='accent-mark-'+i).content.element;
 const back=structuredClone(mark);back.id=mark.id+'-backing';back.styleId=back.id+'-style';back.z=2;back.description='强调笔触深色衬层 '+(i+1);back.region.width+=6/1280;back.region.height+=6/720;
 d.layers.push({parentId:'root',content:{kind:'element',element:back}});
 d.styles.push({...structuredClone(d.styles.find(s=>s.id===mark.styleId)),id:back.styleId,fill:'#09222D',strokeWidth:0});
 const rel=structuredClone(d.spatialRelations.find(r=>r.elementId===mark.id));rel.elementId=back.id;rel.gap-=3/720;d.spatialRelations.push(rel);
}
const current=(await api('/dynamic-assets')).assets.find(a=>a.id===d.id);assert.ok(!current,'Candidate already exists; inspect before updating');
const saved=(await api('/dynamic-assets',{definition:d,baseRevision:0,idempotencyKey:'cyan-accent-save-'+createHash('sha256').update(JSON.stringify(d)).digest('hex')})).definition;
assert.deepEqual((await api('/dynamic-assets/'+original.id)).definition,original);
const application={assetId:saved.id,assetRevision:saved.revision,canvas:t.canvas,placement:{x:0,y:0,width:1,height:1}};
const template=(await api('/dynamic-assets/application',application)).template;
const manifest={name:'青色双笔触 · 保存样式验证',brief:'Saved candidate with two independent dark mark backings, same measured input events. No aesthetic score.',previewOnly:true,designs:[{template,baseRevision:0}],samples:prior.samples,idempotencyKey:'cyan-accent-saved-'+createHash('sha256').update(JSON.stringify({template,samples:prior.samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});for(const [n,data]of Object.entries({'style.json':saved,'application.json':application,'designs.json':manifest}))await fs.writeFile(root+'/'+n,JSON.stringify(data,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({root,id:saved.id,batchId:batch.id}));
