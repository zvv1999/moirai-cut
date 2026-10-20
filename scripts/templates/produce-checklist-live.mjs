import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/checklist-live-20260930',base='http://127.0.0.1:3000/api/footage/templates';await fs.mkdir(root,{recursive:true});
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined);const t=await r.text();assert.ok(r.ok,t);return JSON.parse(t);}
const mentor=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/growth-headline-live-20260929/manifest.json')).samples[0];
const negative=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/bulb-reading-phrases-20260929/manifest.json')).samples;
negative[2].semanticUnits[0].keyword=null;
negative[2].semanticUnits[0].rationale="Explanation of a natural mechanism, not an action instruction; preserve reviewed reading phrases without decorative checklist.";
const samples=[{...mentor,semanticUnits:[{startWord:0,endWord:54,intent:'explanation',keyword:{startWord:17,endWord:22},rationale:'Agent annotation: things you need to do explicitly introduces actions. The abstract checklist illustrates advice, not completed user tasks.'}],layoutPhrases:[{wordSpan:{startWord:17,endWord:22}}]},negative[0],negative[2]];
const inputs=[];for(const s of samples){const i=await api('/inputs/'+s.inputId);assert.equal(i.transcript.revision,s.transcriptRevision);inputs.push(i);}
const definition=(await api('/dynamic-assets/style-study-20260929-checklist')).definition;assert.equal(definition.revision,2);
const caption={assetId:'style-pilot-20260923-caption',assetRevision:3,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.6,centerX:.53,centerY:.91},captionWidth:.64};
let{template}=await api('/dynamic-assets/application',caption);
const icon={assetId:definition.id,assetRevision:definition.revision,instanceId:'checklist',placement:{x:0,y:0,width:1,height:1},transform:{scale:.14,centerX:.5,centerY:.5}};
template=(await api('/dynamic-assets/insert',{template,...icon})).template;
const gs=template.elements.filter(e=>e.id!=='headline');assert.equal(gs.length,20);const right=Math.max(...gs.map(e=>e.region.x+e.region.width)),top=Math.min(...gs.map(e=>e.region.y)),bottom=Math.max(...gs.map(e=>e.region.y+e.region.height));
template.composition.spatialRelations.push(...gs.map(e=>({elementId:e.id,relativeTo:'headline',placement:'left',referenceBounds:'text_box',gap:.015,offsetX:e.region.x+e.region.width-right,offsetY:e.region.y+e.region.height/2-(top+bottom)/2,followMotion:true})));
template.styles.find(s=>s.id==='headline-style').fill='#FFF8E9';template.id='composition-checklist-advice-20260930';template.name='行动建议 · 清单字幕';template.tags=['候选待审','行动建议','清单'];template.description='完整字幕与文字依附清单；仅在输入明确标注的行动建议词段出现。勾选为抽象图示，不宣称实际任务完成；非自动语义识别。';
const existing=(await api('')).templates.find(t=>t.id===template.id);
if(existing){const reviewed=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/checklist-live-20260930/saved.json'));assert.deepEqual(existing,reviewed,'Saved template changed; preserve user edits');template=structuredClone(existing);}
assert.ok((await api('/samples/validate',{template,samples})).validated);const designs=[{template,baseRevision:existing?.revision??0}],manifest={name:template.name,brief:'Saved checklist r2 with measured captions. One explicit advice phrase on a real speaker and two no-keyword controls. Shared text-bound attachment; source audio and word timing unchanged. Inspect faces, hands, contextual diagrams and motion.',previewOnly:true,designs,samples,idempotencyKey:'checklist-live-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
for(const[k,v]of Object.entries({definition,inputs,manifest,applications:{caption,icon}}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));const b=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(b,null,2));console.log(b.id);
