import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const root='/Users/zhengwei/Downloads/checklist-side-reading-20260930',source='/Users/zhengwei/Downloads/checklist-live-reviewed-20260930',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const old=JSON.parse(await fs.readFile(source+'/manifest.json')),inputs=JSON.parse(await fs.readFile(source+'/inputs.json'));
const t=structuredClone(old.designs[0].template),h=t.elements.find(e=>e.id==='headline');h.region={x:.38,y:.40,width:.24,height:.30};
Object.assign(t.styles.find(s=>s.id==='headline-style'),{fontSize:32,textAlign:'left',maxLines:5,lineHeight:1.16});
const gs=t.elements.filter(e=>e.id!=='headline');for(const e of gs)e.region.y-=.17;
const left=Math.min(...gs.map(e=>e.region.x)),right=Math.max(...gs.map(e=>e.region.x+e.region.width)),bottom=Math.max(...gs.map(e=>e.region.y+e.region.height));
t.composition.spatialRelations=gs.map(e=>({elementId:e.id,relativeTo:'headline',placement:'above',referenceBounds:'text_box',gap:.018,offsetX:e.region.x+e.region.width/2-(left+right)/2,offsetY:e.region.y+e.region.height-bottom,followMotion:true}));
let d=(await api('/dynamic-assets/capture',{template:t,name:'侧栏阅读 · 清单建议'})).definition;
d.id='style-study-20260930-checklist-sidebar';d.revision=0;d.provenance='Left-aligned narrow reading column with text-attached checklist above. One visual definition; left/right candidate placement is selected by native advice against caller-supplied manual protection. Not automatic face detection.';
const existing=(await api('/dynamic-assets')).assets.find(a=>a.id===d.id);
if(existing){const saved=(await api('/dynamic-assets/'+d.id)).definition;assert.deepEqual(saved,{...d,revision:saved.revision});d=saved;}else d=(await api('/dynamic-assets',{definition:d,baseRevision:0,idempotencyKey:'checklist-sidebar-'+createHash('sha256').update(JSON.stringify(d)).digest('hex')})).definition;
await fs.writeFile(root+'/definition.json',JSON.stringify(d,null,2));
const policy={application:{assetId:d.id,assetRevision:d.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:1,centerX:.18,centerY:.32}},padding:.015,candidates:[{id:'left',centerX:.18,centerY:.32},{id:'right',centerX:.85,centerY:.32}]};await fs.writeFile(root+'/policy.json',JSON.stringify(policy,null,2));
const protection=[
 [{id:'speaker-and-hands-manual',region:{x:.38,y:.04,width:.57,height:.96}}],
 [{id:'speaker-and-hands-manual',region:{x:.38,y:.03,width:.60,height:.97}}],
 [{id:'speaker-and-hands-manual',region:{x:.30,y:.03,width:.40,height:.97}},{id:'sun-diagram-manual',region:{x:0,y:.02,width:.30,height:.72}}]
];
const submissions=[];
for(let i=0;i<3;i++){
 const folder=root+'/'+i;await fs.mkdir(folder,{recursive:true});const request={...policy,protectedRegions:protection[i]};const advice=await api('/dynamic-assets/placement-advice',request);await fs.writeFile(folder+'/placement.json',JSON.stringify({request,advice},null,2));assert.ok(advice.template,'No safe candidate; do not overlap protected content');
 const template=advice.template;template.id='checklist-sidebar-instance-'+i+'-20260930';template.name='行动建议 · 侧栏阅读验证';const samples=[old.samples[i]],designs=[{template,baseRevision:0}],manifest={name:template.name,brief:'Same saved reading style and common left/right candidates. Manual protection rectangles; preserve source video/audio and reviewed caption annotations. Check readable text and hand protection.',previewOnly:true,designs,samples,idempotencyKey:'checklist-side-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 for(const[k,v]of Object.entries({manifest,inputs:[inputs[i]],definition:d}))await fs.writeFile(folder+'/'+k+'.json',JSON.stringify(v,null,2));const b=await api('/production/author',manifest);await fs.writeFile(folder+'/submission.json',JSON.stringify(b,null,2));submissions.push({fixture:i,id:b.id,selected:advice.selectedId});await fs.writeFile(root+'/submissions.json',JSON.stringify(submissions,null,2));
}
console.log(JSON.stringify(submissions));
