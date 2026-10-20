import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/study-guidance-workbench-2026-09-29';
const source='/Users/zhengwei/Downloads/reading-composition-refined-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
function equivalent(a,b,path='template'){
 if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=4*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)),path);return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.equal(Array.isArray(a),Array.isArray(b),path);assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),path);for(const k of Object.keys(a))equivalent(a[k],b[k],path+'.'+k);return;}
 assert.equal(a,b,path);
}
const prior=JSON.parse(await fs.readFile(source+'/designs.json','utf8'));
const sub=JSON.parse(await fs.readFile(source+'/submission.json','utf8'));
const batch=await api('/production/'+sub.id);assert.equal(batch.renderJob.status,'succeeded');assert.equal(batch.items[0].previews.length,3);
for(const p of batch.items[0].previews){assert.ok(p.decodeVerified&&p.audioQuality.validated);assert.equal(createHash('sha256').update(await fs.readFile(p.path)).digest('hex'),p.sha256);}
const before=await api(''),styles=await api('/dynamic-assets');
const template=structuredClone(prior.designs[0].template);template.id='composition-study-guidance-20260929';template.revision=0;template.name='居家学习 · 字幕与重点提示';template.tags=['候选待审','插画讲解','声音驱动','字幕','花字'];
template.description='适合阅读、日程与居家工作讲解。宋体字幕、居家学习插画、时钟与纸签独立组合。标题与插画跟随声音全长；metric语义的重点词显示时钟，call_to_action/conclusion语义的重点词显示纸签。语义与重点词由内容侧标注；不自动识别时间表达。三种文案完成技术导出与部分画面检查，未试听、未正式审美评分。插画来源与MIT许可保留在资源记录。';
template.elements.find(e=>e.id==='page-heading').description='主题标题 · 最多两行';
template.elements.find(e=>e.id==='headline').description='动态字幕 · 宋体与重点色';
template.elements.find(e=>e.id==='page-heading').features.role='title';
template.elements.find(e=>e.id==='page-background').features.role='background';
const existing=before.templates.find(t=>t.id===template.id);
let saved;
if(existing){
 const candidate={...existing,revision:0};
 const normalized=structuredClone(candidate);normalized.elements.find(e=>e.id==='page-heading').features.role='title';normalized.elements.find(e=>e.id==='page-background').features.role='background';
 equivalent(normalized,template);
 if(JSON.stringify(candidate)===JSON.stringify(normalized))saved=existing;
 else saved=(await api('/save',{template,baseRevision:existing.revision,idempotencyKey:'study-guidance-role-correction-v2'})).template;
}
else saved=(await api('/save',{template,baseRevision:0,idempotencyKey:'save-study-guidance-'+createHash('sha256').update(JSON.stringify(template)).digest('hex')})).template;
equivalent({...saved,revision:0},template);
const after=await api('');assert.deepEqual(after.templates.find(t=>t.id===template.id),saved);
for(const t of before.templates.filter(t=>t.id!==template.id))assert.deepEqual(after.templates.find(x=>x.id===t.id),t);
assert.deepEqual(await api('/dynamic-assets'),styles);
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/saved.json',JSON.stringify(saved,null,2));await fs.writeFile(root+'/verification.json',JSON.stringify({templateId:saved.id,revision:saved.revision,sourceBatch:sub.id,previewHashesVerified:3,existingTemplatesUnchanged:true,independentStylesUnchanged:true,score:null,listened:false},null,2));
console.log(JSON.stringify({id:saved.id,revision:saved.revision,root}));
