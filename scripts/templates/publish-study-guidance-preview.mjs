import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/study-guidance-published-2026-09-29',priorRoot='/Users/zhengwei/Downloads/reading-composition-refined-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
await fs.mkdir(root,{recursive:true});
let manifest;
try{manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;
 const prior=JSON.parse(await fs.readFile(priorRoot+'/designs.json','utf8'));
 const library=await api(''),template=library.templates.find(t=>t.id==='composition-study-guidance-20260929');assert.equal(template?.revision,2);
 for(const sample of prior.samples){const d=await api('/inputs/'+sample.inputId);assert.equal(d.transcript.revision,sample.transcriptRevision);}
 const designs=[{template,baseRevision:2}],samples=prior.samples;
 manifest={name:'居家学习 · 当前保存版成片',brief:'Publish local editable composition and attach previews for the current saved design. Three measured Chinese audio samples. Candidate awaiting aesthetic review; no listening or score claim.',previewOnly:false,designs,samples,idempotencyKey:'study-guidance-published-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
 await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/library-before.json',JSON.stringify(library,null,2));await fs.copyFile(priorRoot+'/application.json',root+'/application.json');await fs.copyFile(priorRoot+'/sources.json',root+'/sources.json');
}
const submitted=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submitted,null,2));console.log(JSON.stringify({batchId:submitted.id,root}));
