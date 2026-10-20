import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/reading-composition-reuse-2026-09-29';
const original='/Users/zhengwei/Downloads/reading-style-composition-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const prior=JSON.parse(await fs.readFile(original+'/designs.json','utf8'));
const pins=JSON.parse(await fs.readFile(original+'/pinned-styles.json','utf8'));
for(const d of pins)assert.deepEqual((await api('/dynamic-assets/'+d.id)).definition,d);
const cases=[
 {inputId:'input-cff723e5973128fcb40827c9cf585831',title:'把今天安排好',ranges:[[0,9,'neutral'],[9,19,'call_to_action',13,19,'最重要的一件事，'],[19,27,'metric',22,27,'精力最好的时间。'],[27,36,'neutral'],[36,45,'conclusion',40,45,'再检查下一步。']]},
 {inputId:'input-ac789371639a22936895cbebf224de23',title:'把共同目标和下一步行动说清楚',ranges:[[0,26,'call_to_action',4,15,'先用一句话说明共同目标，'],[26,51,'metric',35,37,'完成时间'],[51,69,'neutral'],[69,91,'conclusion',80,91,'并把下一步行动留在记录里。']]},
];
const samples=[structuredClone(prior.samples[0])],sources=[await api('/inputs/'+samples[0].inputId)];assert.equal(sources[0].transcript.revision,4);
for(const c of cases){const d=await api('/inputs/'+c.inputId);assert.equal(d.transcript.revision,2);sources.push(d);
 const semanticUnits=c.ranges.map(([startWord,endWord,intent,a,b,text])=>{const unit={startWord,endWord,intent,rationale:'Agent-selected cue category: time expression routed to clock, action/conclusion routed to note. No automated semantic extraction claim.'};if(text){assert.equal(d.transcript.words.slice(a,b).map(w=>w.text).join(''),text);unit.keyword={startWord:a,endWord:b};}return unit;});
 samples.push({inputId:c.inputId,transcriptRevision:2,title:c.title,semanticUnits,captionPolicy:{maxCharacters:18,maxPhraseSeconds:4.5,maxCharactersPerSecond:10,pauseBoundarySeconds:.32}});
}
const designs=structuredClone(prior.designs);
if(process.env.REFINE_LAYOUT==='1'){
 const t=designs[0].template,h=t.elements.find(e=>e.id==='page-heading');
 h.region={x:.08,y:.055,width:.84,height:.15};t.styles.find(s=>s.id===h.styleId).maxLines=2;
 samples[1].layoutPhrases=[{wordSpan:{startWord:13,endWord:15}}];
}
const manifest={name:'居家学习组合 · 三种文案复用验证',brief:'Reuse the identical editable composition on reading, daily planning and long collaboration narration. Measured audio timing, Agent-selected semantic cues. Long title and long action keywords stress layout. Preview only; no listening or aesthetic acceptance claim.',previewOnly:true,designs,samples,idempotencyKey:'reading-composition-reuse-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});for(const [name,value] of Object.entries({designs:manifest,sources,'pinned-styles':pins}))await fs.writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2));
await fs.copyFile(original+'/application.json',root+'/application.json');
const submitted=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submitted,null,2));
console.log(JSON.stringify({batchId:submitted.id,root}));
