import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/chinese-semantic-icons-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const pins=JSON.parse(process.env.STYLE_PINS??'null')??[['style-pilot-20260923-caption',3],['style-study-20260929-clock',1],['style-study-20260929-completion',2]];
const definitions=[];
for(const [id,revision] of pins){const d=(await api('/dynamic-assets/'+id)).definition;assert.equal(d.revision,revision);definitions.push(d);}
let {template}=await api('/dynamic-assets/application',{assetId:pins[0][0],assetRevision:3,canvas:{width:720,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.85,centerX:.5,centerY:.7},captionWidth:.84,intents:[]});
for(const [index,instanceId,intent] of [[1,'time','emphasis'],[2,'done','conclusion']]){
 template=(await api('/dynamic-assets/insert',{template,assetId:pins[index][0],assetRevision:pins[index][1],instanceId,placement:{x:0,y:0,width:1,height:1},transform:{scale:.3,centerX:.5,centerY:.35},intents:[intent]})).template;
}
template.name='中文声音驱动 · 时间与完成提示';
const cases=[
 {id:'input-cff723e5973128fcb40827c9cf585831',title:'安排一天',ranges:[[0,19,'neutral'],[19,27,'emphasis',22,27,'精力最好的时间。'],[27,36,'neutral'],[36,45,'conclusion',36,40,'做完之后']]},
 {id:'input-e01ef91d1e429916a7f317f32ac47da7',title:'协作说明',ranges:[[0,10,'neutral'],[10,23,'emphasis',21,23,'完成时间。'],[23,31,'neutral'],[31,39,'conclusion',34,39,'一起确认结果。']]},
 {id:'input-ac789371639a22936895cbebf224de23',title:'较长协作说明',ranges:[[0,26,'neutral'],[26,51,'emphasis',35,37,'完成时间'],[51,69,'neutral'],[69,91,'conclusion',72,80,'共同确认交付结果，']]},
];
const samples=[],expectations=[];
for(const c of cases){
 const detail=await api('/inputs/'+c.id);assert.equal(detail.job.status,'succeeded');assert.equal(detail.input.mediaKind,'audio');assert.equal(detail.transcript.revision,2);
 const words=detail.transcript.words;assert.equal(words.length,c.ranges.at(-1)[1]);
 const semanticUnits=c.ranges.map(([startWord,endWord,intent,start,end,expected])=>{
  const unit={startWord,endWord,intent,rationale:'Agent-selected semantic partition: emphasis is the time expression; conclusion is completion/confirmation. Existing measured TTS/ASR timing is unchanged; this is not automatic semantic recognition.'};
  if(expected){assert.equal(words.slice(start,end).map(w=>w.text).join(''),expected);unit.keyword={startWord:start,endWord:end};expectations.push({inputId:c.id,instanceId:intent==='emphasis'?'time':'done',text:expected,start:words[start].start,end:words[end-1].end});}
  return unit;
 });
 samples.push({inputId:c.id,transcriptRevision:2,title:c.title,semanticUnits,captionPolicy:{maxCharacters:16,maxPhraseSeconds:4.5,maxCharactersPerSecond:8,pauseBoundarySeconds:.32}});
}
const designs=[{template,baseRevision:0}],manifest={name:template.name,brief:'Three existing measured Chinese TTS samples. Captions cover the full audio; a clock only marks time expressions and a check only marks completion/confirmation. Human/Agent-selected semantics, not automatic recognition. Audio-only square composition; no live-footage adaptation or listening claim.',previewOnly:true,designs,samples,idempotencyKey:'chinese-semantic-icons-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});
await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/expectations.json',JSON.stringify(expectations,null,2));await fs.writeFile(root+'/pinned-styles.json',JSON.stringify(definitions,null,2));
const submitted=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submitted,null,2));
for(const d of definitions)assert.deepEqual((await api('/dynamic-assets/'+d.id)).definition,d);
console.log(JSON.stringify({batchId:submitted.id,samples:samples.length,root}));
