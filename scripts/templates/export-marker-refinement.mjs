import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/marker-refine-r4-2026-09-29';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const definition=(await api('/dynamic-assets/style-pilot-20260923-marker')).definition;assert.equal(definition.revision,4);
const {samples}=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28/designs.json','utf8'));
assert.equal(samples.length,3);
for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
const application={assetId:definition.id,assetRevision:definition.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.72,centerX:Number(process.env.CENTER_X??.5),centerY:Number(process.env.CENTER_Y??.82)}};
const {template}=await api('/dynamic-assets/application',application);
const designs=[{template,baseRevision:0}];
const manifest={name:'珊瑚侧标 · 三份实测声音验收',brief:'Revision 4 editorial corner marker. Three existing measured Chinese/English inputs. Original audio and word alignment retained. Application placement is explicit, not automatic subject avoidance. Preview-only independent projects; visual review pending.',previewOnly:true,designs,samples,idempotencyKey:'marker-r4-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.writeFile(root+'/application.json',JSON.stringify(application,null,2));await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));console.log(JSON.stringify({batchId:batch.id,root}));
