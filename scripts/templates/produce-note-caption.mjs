import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/note-caption-20260929',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const source=(await api('/dynamic-assets/style-study-20260929-note-paper')).definition;assert.equal(source.revision,1);
const d=structuredClone(source);d.id='style-study-20260929-note-caption';d.revision=0;d.name='便签正文 · 左对齐字幕';d.provenance='Reading variant of original editable note-paper: sentence-driven, upright text, small vertical entry, measured yellow background and attached tape. No duplicated corner keyword. Pending live-action visual acceptance.';
for(const l of d.layers){const e=l.content.element;if(!e)continue;e.binding='sentence';e.timing.anchor='cue_start';if(e.id==='headline')e.motions=[{property:'y',keys:[{time:0,value:8,easing:'ease_out'},{time:.2,value:0,easing:'linear'},{time:1,value:0,easing:'linear'}]}];}
d.styles.find(s=>s.id==='headline-style').maxLines=2;d.styles.find(s=>s.id==='headline-style').lineHeight=1.16;
const normalized=(await api('/dynamic-assets/inspect',d)).definition;let definition;const assets=await api('/dynamic-assets');if(assets.assets.some(a=>a.id===d.id)){definition=(await api('/dynamic-assets/'+d.id)).definition;assert.deepEqual(definition,{...normalized,revision:definition.revision});}else definition=(await api('/dynamic-assets',{definition:normalized,baseRevision:0,idempotencyKey:'note-caption-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex')})).definition;
const application={assetId:definition.id,assetRevision:definition.revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:Number(process.env.NOTE_SCALE??.65),centerX:.5,centerY:Number(process.env.NOTE_CENTER_Y??.85)},captionWidth:.84};
const {template}=await api('/dynamic-assets/application',application);template.id='composition-note-caption-20260929';template.name='访谈笔记 · 便签字幕';template.tags=['候选待审','便签','完整字幕'];template.description='左对齐便签作为主字幕，每句按原声显示；不重复角落花字。需检查底部手势与画面信息，不自动避让。';
const old=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/note-paper-live-20260929/manifest.json')),samples=old.samples;
const inputs=[];for(const s of samples){const inp=await api('/inputs/'+s.inputId);assert.equal(inp.transcript.revision,s.transcriptRevision);inputs.push(inp);}
assert.ok((await api('/samples/validate',{template,samples})).validated);
const designs=[{template,baseRevision:0}],manifest={name:template.name,brief:'Upright sentence-driven note-paper subtitles with measured backing and text-attached tape. Same authored layout across three real interviews, no duplicate keyword sticker. Compare against corner-note baseline for hierarchy and readability.',previewOnly:true,designs,samples,idempotencyKey:'note-caption-live-'+createHash('sha256').update(JSON.stringify({designs,samples})+(process.env.NOTE_RENDER_REVISION??'')).digest('hex')};
for(const[k,v]of Object.entries({definition,application,manifest,inputs}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));
await fs.writeFile('scripts/templates/seeds/note-caption.json',JSON.stringify({...definition,revision:0},null,2));
const b=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(b,null,2));assert.deepEqual((await api('/dynamic-assets/'+source.id)).definition,source);console.log(b.id);
