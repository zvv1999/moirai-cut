import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/reading-style-composition-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
assert.ok((await api('/schema')).productionAuthoringInput);
const pins=[['style-study-20260924-serif',3],['style-study-20260928-learning',1],['style-study-20260929-clock',1],['style-study-20260924-note',5]];
const definitions=[];for(const [id,revision] of pins){const d=(await api('/dynamic-assets/'+id)).definition;assert.equal(d.revision,revision);definitions.push(d);}
const application={assetId:pins[0][0],assetRevision:3,canvas:{width:720,height:960,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.7,centerX:.5,centerY:.86},captionWidth:.84};
let {template}=await api('/dynamic-assets/application',application);
for(const [index,instanceId,transform,intents] of [[1,'study',{scale:.85,centerX:.5,centerY:.43},[]],[2,'time',{scale:.14,centerX:.5,centerY:.69},['metric']],[3,'note',{scale:.5,centerX:.5,centerY:.69},['call_to_action','conclusion']]]){
 template=(await api('/dynamic-assets/insert',{template,assetId:pins[index][0],assetRevision:pins[index][1],instanceId,placement:{x:0,y:0,width:1,height:1},transform,intents})).template;
}
const art=template.elements.find(e=>e.resourceId&&e.id.includes('study'));assert.ok(art);
art.binding='literal';art.timing={anchor:'video_start',maxSeconds:600,minSeconds:.1,offsetSeconds:0};
const growth=(await api('/dynamic-assets/style-study-20260928-growth')).projection;
const bg=structuredClone(growth.elements[0]);Object.assign(bg,{id:'page-background',binding:'literal',literal:'背景',description:'深靛底色',styleId:'page-background-style',region:{x:0,y:0,width:1,height:1},z:-100,motions:[],timing:{anchor:'video_start',maxSeconds:600,minSeconds:.1,offsetSeconds:0}});bg.features.representation='rectangle';
template.elements.unshift(bg);template.styles.push({...growth.styles[0],id:bg.styleId,fill:'#202333'});
const heading=structuredClone(template.elements.find(e=>e.id==='headline'));assert.ok(heading);
Object.assign(heading,{id:'page-heading',binding:'title',styleId:'page-heading-style',region:{x:.08,y:.08,width:.84,height:.1},z:20,motions:[],timing:{anchor:'video_start',maxSeconds:600,minSeconds:.1,offsetSeconds:0}});
template.elements.push(heading);template.styles.push({...template.styles.find(s=>s.id===template.elements.find(e=>e.id==='headline').styleId),id:heading.styleId,fontSize:48,fill:'#F4E3BC',strokeWidth:0,maxLines:1});
template.name='每天读一点 · 插画与语义提示';
const inputId='input-941335914fe590272ed1f8cef9af917a',detail=await api('/inputs/'+inputId);assert.equal(detail.transcript.revision,4);
const ranges=[[0,10,'neutral'],[10,16,'metric',14,16,'十分钟，'],[16,24,'neutral'],[24,30,'call_to_action',26,30,'写下一句话，'],[30,38,'conclusion',32,38,'真正打动你的地方。']];
const semanticUnits=ranges.map(([startWord,endWord,intent,start,end,text])=>{const unit={startWord,endWord,intent,rationale:'Agent-authored reading guidance: metric duration, writing action, and concluding insight. Measured word times remain unchanged.'};if(text){assert.equal(detail.transcript.words.slice(start,end).map(w=>w.text).join(''),text);unit.keyword={startWord:start,endWord:end};}return unit;});
const samples=[{inputId,transcriptRevision:4,title:'每天读一点',semanticUnits,captionSpans:ranges.map(([startWord,endWord])=>({startWord,endWord})),captionPolicy:{maxCharacters:18,maxPhraseSeconds:4.5,maxCharactersPerSecond:10,pauseBoundarySeconds:.32}}];
const designs=[{template,baseRevision:0}],manifest={name:template.name,brief:'Independent Songti captions, study illustration, duration icon and paper emphasis. Illustration/title/background span audio; time and note cues follow measured semantic keyword spans. Single-input design trial, not formal aesthetic acceptance. Illustration is MIT IRA Design, not AI generated.',previewOnly:true,designs,samples,idempotencyKey:'reading-style-composition-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});for(const [name,data] of Object.entries({designs:manifest,application,'pinned-styles':definitions,'source-input':detail}))await fs.writeFile(`${root}/${name}.json`,JSON.stringify(data,null,2));
const submitted=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submitted,null,2));for(const d of definitions)assert.deepEqual((await api('/dynamic-assets/'+d.id)).definition,d);
console.log(JSON.stringify({batchId:submitted.id,root}));
