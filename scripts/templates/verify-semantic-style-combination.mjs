import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/semantic-style-combination-2026-09-28';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
assert.ok((await api('/schema')).productionAuthoringInput);
const pinned=[['style-pilot-20260923-caption',3],['style-pilot-20260923-offset',4],['style-study-20260928-growth',1]];
const format=process.env.STYLE_FORMAT??'landscape';
const layouts={landscape:{canvas:{width:1280,height:720,fps:30},videoHeight:.8,caption:{scale:.65,centerX:.5,centerY:.9},emphasis:{scale:.38,centerX:Number(process.env.EMPHASIS_CENTER_X??.73),centerY:.68},growth:{scale:.2,centerX:.87,centerY:.4}},portrait:{canvas:{width:720,height:1280,fps:30},videoHeight:.4,caption:{scale:.85,centerX:.5,centerY:.78},emphasis:{scale:.7,centerX:.5,centerY:.57},growth:{scale:.15,centerX:.5,centerY:.46}},square:{canvas:{width:720,height:720,fps:30},videoHeight:.6,caption:{scale:.7,centerX:.5,centerY:.87},emphasis:{scale:.55,centerX:.5,centerY:.69},growth:{scale:.14,centerX:.86,centerY:.7}}};
const layout=layouts[format];assert.ok(layout,'Unknown STYLE_FORMAT');
if(format==='portrait'&&process.env.COMPACT_PORTRAIT==='1'){layout.videoHeight=.55;layout.emphasis={scale:.7,centerX:.48,centerY:.66};layout.growth={scale:.15,centerX:.86,centerY:.66};layout.caption={scale:.85,centerX:.5,centerY:.85};}
const definitions=[];for(const [id,revision] of pinned){const d=(await api('/dynamic-assets/'+id)).definition;assert.equal(d.revision,revision);definitions.push(d);}
let {template}=await api('/dynamic-assets/application',{assetId:pinned[0][0],assetRevision:3,canvas:layout.canvas,placement:{x:0,y:0,width:1,height:1},transform:layout.caption,captionWidth:.84,videoRegion:{x:0,y:0,width:1,height:layout.videoHeight}});
for(const [index,instanceId,transform] of [[1,'emphasis',layout.emphasis],[2,'growth',layout.growth]]){
 template=(await api('/dynamic-assets/insert',{template,assetId:pinned[index][0],assetRevision:pinned[index][1],instanceId,placement:{x:0,y:0,width:1,height:1},transform,intents:index===2?['metric']:[]})).template;
}
template.name='声音驱动组合 · 字幕、花字与增长提示';
const prior=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/offset-public-baseline-2026-09-28/designs.json','utf8'));
const sample=structuredClone(prior.samples.find(s=>s.inputId==='input-80f248b968faad87d3460b76ec8badd1'));assert.ok(sample);
const input=await api('/inputs/'+sample.inputId);assert.equal(input.transcript.revision,sample.transcriptRevision);
const final=sample.semanticUnits.at(-1);assert.equal(input.transcript.words.slice(final.keyword.startWord,final.keyword.endWord).map(w=>w.text).join(' '),'longer sunlight');
final.intent='metric';final.rationale='Longer sunlight expresses increased duration. Qualitative growth symbol only; bar heights do not encode numerical observations.';
for(const unit of sample.semanticUnits.slice(0,-1))unit.intent='emphasis';
delete sample.captionSpans;
sample.captionPolicy={maxCharacters:42,maxPhraseSeconds:5,maxCharactersPerSecond:10,pauseBoundarySeconds:.32};sample.focalPoint={x:.5,y:.4};
const samples=[sample],designs=[{template,baseRevision:0}];
const manifest={name:template.name,brief:'Three independent style roles on measured English interview audio. Growth layers filter metric intent and should occur only on longer sunlight. The qualitative icon is not a numerical chart. Preview-only; no listening or aesthetic acceptance claim.',previewOnly:true,designs,samples,idempotencyKey:'semantic-style-combination-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex')};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/pinned-styles.json',JSON.stringify(definitions,null,2));
if(process.env.AUTHOR_ONLY==='1'){console.log(JSON.stringify({manifest:root+'/designs.json',prepared:true}));process.exit(0);}
const batch=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));
for(const d of definitions)assert.deepEqual((await api('/dynamic-assets/'+d.id)).definition,d);
console.log(JSON.stringify({batchId:batch.id,root}));
