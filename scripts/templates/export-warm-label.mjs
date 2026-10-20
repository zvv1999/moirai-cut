import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/warm-label-20260929/production',source='/Users/zhengwei/Downloads/reading-clearspace-20260929/marker',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const text=await r.text();assert.ok(r.ok,text);return JSON.parse(text);}
const {samples}=JSON.parse(await fs.readFile(source+'/designs.json'));
samples[1].layoutPhrases=[{wordSpan:{startWord:36,endWord:38}}];
const priorApplication=JSON.parse(await fs.readFile(source+'/application.json'));
const saved=(await api('/dynamic-assets/style-study-20260928-measured-sparkle')).definition;assert.equal(saved.revision,3);
const designs=[];
for(const revision of [2,3]){
 const application={...priorApplication,assetId:saved.id,assetRevision:revision};
 const {template}=await api('/dynamic-assets/application',application);template.id='warm-label-r'+revision+'-20260929';
 const validation=await api('/samples/validate',{template,samples});
 await fs.writeFile(root+'/application-r'+revision+'.json',JSON.stringify(application,null,2));await fs.writeFile(root+'/validation-r'+revision+'.json',JSON.stringify(validation,null,2));
 designs.push({template,baseRevision:0});
}
const manifest={name:'温暖批注 · 左对齐与短词清晰停留',brief:'Compare saved r2/r3 with identical original audio, measured words and application placement. Two live-action samples and one Chinese audio-only sample. Current renderer for both versions. No listening or aesthetic pass claimed.',previewOnly:true,designs,samples,idempotencyKey:'warm-label-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const submitted=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submitted,null,2));assert.deepEqual((await api('/dynamic-assets/'+saved.id)).definition,saved);console.log(submitted.id);
