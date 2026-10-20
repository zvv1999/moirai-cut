import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/cyan-accent-marks-20260929';
const api=async(path,body)=>{
 const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
 const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;
};
const prior=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/cyan-type-balance-20260929/designs.json','utf8'));
const designs=structuredClone(prior.designs), template=designs[0].template;
template.id='composition-cyan-accent-marks-trial';template.name='青色花字 · 双笔触装饰候选';
const element=template.elements.find(e=>e.id==='headline');
const style=template.styles.find(s=>s.id===element.styleId);
// Native text and independently editable marks, attached to measured text bounds.
style.background=null;style.strokeWidth=4;
style.shadow={color:'#09222D',opacity:.8,blur:0,x:2,y:3};
template.composition ??= {};
template.composition.spatialRelations ??= [];
for(const [i,dx,angle,height] of [[0,.015,-24,.026],[1,.035,20,.019]]) {
 const mark=structuredClone(element), id='accent-mark-'+i;
 Object.assign(mark,{id,description:'强调笔触 '+(i+1),styleId:id+'-style',literal:null,z:3,region:{x:.2,y:.2,width:.005,height}});
 mark.features.representation='rectangle';mark.features.role='supporting_visual';
 mark.motions=[structuredClone(element.motions.find(m=>m.property==='opacity')),{property:'rotation',keys:[{time:0,value:angle,easing:'linear'},{time:1,value:angle,easing:'linear'}]}];
 template.elements.push(mark);
 template.styles.push({...structuredClone(style),id:id+'-style',fill:'#F5FAF5',stroke:'#09222D',strokeWidth:1,shadow:null});
 template.composition.spatialRelations.push({elementId:id,relativeTo:'headline',placement:'above',referenceBounds:'text_box',gap:.008,offsetX:dx,offsetY:0,followMotion:true});
}
const samples=prior.samples;
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const manifest={name:template.name,brief:'Preview-only decorative refinement. Remove rectangular backing, add dark outline and hard shadow, and two editable cream accent marks attached above measured text bounds. Preserve measured events and headline motion. Pending visual inspection; no saved-style overwrite or accepted-style count.',previewOnly:true,designs,samples,idempotencyKey:'cyan-accent-marks-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);
await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));
console.log(JSON.stringify({batchId:batch.id,root}));
