import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const root='/Users/zhengwei/Downloads/science-caption-composition-20260929',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(body)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const library=await api('/dynamic-assets');
const pins=[['style-pilot-20260923-caption',3],['style-study-20260929-globe',2]];const definitions=[];for(const[id,rev]of pins){const d=(await api('/dynamic-assets/'+id)).definition;assert.equal(d.revision,rev);definitions.push(d);}
const caption={assetId:pins[0][0],assetRevision:3,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.7,centerX:.5,centerY:.88},captionWidth:.84};
let {template}=await api('/dynamic-assets/application',caption);
const insertion={assetId:pins[1][0],assetRevision:2,instanceId:'earth',placement:{x:0,y:0,width:1,height:1},transform:{scale:.32,centerX:.82,centerY:.3}};
template=(await api('/dynamic-assets/insert',{template,...insertion})).template;
template.id='composition-science-caption-20260929';template.revision=0;template.name='地球科普 · 逐词讲述与经纬提示';template.tags=['候选待审','科普口播','逐词字幕','地球图标','声音驱动'];template.description='完整字幕在底部逐词跟读，经纬动图只在内容侧选定的地球关键词段出现；没有关键词时仅显示字幕。需预留右上安全区，应用前检查人物/原图示，不自动识别主题或人物。字体与图形可分别编辑，时间来自输入的实测词对齐。';
const samples=[];
const f=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/placement-advice-20260929/fixture-0.json'));f.sample.semanticUnits.forEach(u=>{u.keyword=null;u.rationale='Unrelated household anecdote: no Earth reference; caption only, no decorative globe.'});samples.push(f.sample);
for(const n of [1,2])samples.push(JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/globe-stroke-rule-20260929/live-'+n+'.json')).sample);
const validation=await api('/samples/validate',{template,samples});assert.ok(validation.validated);
const designs=[{template,baseRevision:0}],manifest={name:template.name,brief:'Reusable candidate combining saved caption and globe styles. Full measured-word captions, Earth-only Agent annotations, no globe for unrelated speech. Fixed lower caption safe area and manually reviewed upper-right decoration zone. Three live inputs; pending visual/aural acceptance.',previewOnly:true,designs,samples,idempotencyKey:'science-caption-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
for(const[k,v]of Object.entries({manifest,definitions,caption,insertion,validation,'agent-content':{version:1,entries:samples.map(s=>({...s,layoutPhrases:s.layoutPhrases??[]})),liveInputId:samples[1].inputId}}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));
const submission=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submission,null,2));assert.deepEqual(await api('/dynamic-assets'),library);console.log(JSON.stringify({batchId:submission.id,root}));
