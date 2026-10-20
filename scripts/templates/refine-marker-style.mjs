import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/marker-refine-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
assert.ok((await api('/schema')).productionAuthoringInput);
const original=(await api('/dynamic-assets/style-pilot-20260923-marker')).definition;
assert.equal(original.revision,2,'Re-read and inspect newer revisions before modifying');
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/original-v2.json',JSON.stringify(original,null,2));
const d=structuredClone(original);
d.name='重点批注 · 珊瑚侧标';
const elements=Object.fromEntries(d.layers.filter(l=>l.content.element).map(l=>[l.content.element.id,l.content.element]));
const text=elements.headline;
text.features.role='emphasis';text.region={x:.14,y:.35,width:.74,height:.3};
const motion=(property,values)=>({property,keys:values.map(([time,value,easing='linear'])=>({time,value,easing}))});
for(const e of Object.values(elements)){
 e.motionTiming={enterEnd:.2,exitStart:.8,enterSeconds:.10,exitSeconds:.07};
 e.motions=[motion('opacity',[[0,0,'ease_out'],[.2,1],[.8,1,'ease_in'],[1,0]])];
}
text.motions.push(motion('x',[[0,16,'ease_out'],[.2,0],[1,0]]));
elements['marker-bar'].region={x:.1,y:.445,width:.012,height:.11};
elements['marker-bar'].description='文字左侧珊瑚竖线';
elements['marker-panel'].region={x:.1,y:.54,width:.055,height:.009};
elements['marker-panel'].description='侧标底部短横';
d.spatialRelations=[
 {elementId:'marker-bar',relativeTo:'headline',placement:'left',referenceBounds:'text_box',gap:.026,offsetX:0,offsetY:0,followMotion:true},
 {elementId:'marker-panel',relativeTo:'headline',placement:'left',referenceBounds:'text_box',gap:.026,offsetX:.043,offsetY:.05,followMotion:true},
];
for(const s of d.styles){
 if(s.id==='headline-style')Object.assign(s,{fontSize:84,weight:700,fill:'#FFF8EF',stroke:'#202B32',strokeWidth:3,maxLines:2,lineHeight:1.1,background:null,shadow:{color:'#101820',opacity:.35,blur:5,x:0,y:3}});
 else Object.assign(s,{fill:'#FF8C76',strokeWidth:0,shadow:null,background:null});
}
d.provenance+=' Revision 3: remove full fluorescent panel; warm-white editorial text with measured coral corner marker and short lateral entrance. Preserve keyword-driven timing. Visual/audio acceptance pending; no score inherited.';
const normalized=(await api('/dynamic-assets/inspect',d)).definition;
const saved=(await api('/dynamic-assets',{definition:normalized,baseRevision:original.revision,idempotencyKey:'marker-refine-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
assert.equal(saved.revision,3);await fs.writeFile(root+'/saved-v3.json',JSON.stringify(saved,null,2));
console.log(JSON.stringify({id:saved.id,revision:saved.revision,root}));
