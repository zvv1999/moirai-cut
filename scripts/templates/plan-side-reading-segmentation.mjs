import fs from'node:fs/promises';import assert from'node:assert/strict';
const source='/Users/zhengwei/Downloads/checklist-side-reading-20260930',root='/Users/zhengwei/Downloads/checklist-side-segmented-20260930',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
const policy={maxCharacters:42,maxPhraseSeconds:3.5,pauseBoundarySeconds:.32,maxCharactersPerSecond:24};
await fs.writeFile(root+'/segmentation-policy.json',JSON.stringify(policy,null,2));
for(const i of [1,2]){
 const old=JSON.parse(await fs.readFile(source+'/'+i+'/manifest.json')),template=structuredClone(old.designs[0].template),samples=structuredClone(old.samples);
 template.segmentation=policy;template.visualRhythm.minDisplaySeconds=.5;template.id='checklist-sidebar-segmented-'+i+'-20260930';samples[0].captionSpans=[];
 const r=await fetch(base+'/samples/validate',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify({template,samples})});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));const folder=root+'/'+i;await fs.mkdir(folder,{recursive:true});await fs.writeFile(folder+'/plan.json',JSON.stringify(data,null,2));await fs.writeFile(folder+'/draft.json',JSON.stringify({template,samples},null,2));console.log(i,JSON.stringify(data.samples[0].plan.captions),data.samples[0].plan.warnings);
}
