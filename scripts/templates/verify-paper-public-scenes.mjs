import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/paper-public-scenes-2026-09-28',source='/Users/zhengwei/Downloads/style-public-scenes-2026-09-28';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const assetId=process.env.STYLE_ASSET_ID??'style-study-20260924-note';
const revision=Number(process.env.STYLE_REVISION??4);
const saved=(await api('/dynamic-assets/'+assetId)).definition;assert.equal(saved.revision,revision);
const application={assetId:saved.id,assetRevision:revision,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:Number(process.env.PAPER_SCALE??.85),centerX:Number(process.env.PAPER_CENTER_X??.5),centerY:Number(process.env.STYLE_CENTER_Y??.8)},...(process.env.STYLE_CAPTION_WIDTH?{captionWidth:Number(process.env.STYLE_CAPTION_WIDTH)}:{}),...(process.env.STYLE_VIDEO_REGION?{videoRegion:JSON.parse(process.env.STYLE_VIDEO_REGION)}:{})};
const {template}=await api('/dynamic-assets/application',application);
const ranges={
 '58140709':[[0,9,6,9,'around the house.'],[9,20,18,20,"brother's calculator,"],[20,26,21,24,'never got upset']],
 '137076990':[[0,7,6,7,'December.'],[7,18,9,11,'June solstice,'],[18,27,19,21,'northern hemisphere'],[27,37,32,34,'longer sunlight']],
 '144276172':[[0,4,2,4,'home planet.'],[4,9,6,9,'learned so much.'],[9,27,18,21,'study the Earth'],[27,34,30,34,'vantage point from space.']]
};
const allReceipts=JSON.parse(await fs.readFile(source+'/input-receipts.json','utf8'));
const selectedPage=process.env.PAPER_SOURCE_PAGE;
const receipts=selectedPage?allReceipts.filter(r=>String(r.pageId)===selectedPage):allReceipts,samples=[];
assert.ok(receipts.length,'PAPER_SOURCE_PAGE must match an imported public scene');
for(const r of receipts){
 const detail=await api('/inputs/'+r.input.id);assert.equal(detail.job.status,'succeeded');assert.equal(detail.transcript.revision,1);
 const semanticUnits=ranges[r.pageId].map(([startWord,endWord,start,end,expected])=>{
  assert.equal(detail.transcript.words.slice(start,end).map(w=>w.text).join(' '),expected);
  return {startWord,endWord,intent:'emphasis',keyword:{startWord:start,endWord:end},rationale:'Author-selected emphasis from local ASR transcript for visual adaptation testing; original measured word timing retained.'};
 });
 samples.push({inputId:r.input.id,transcriptRevision:detail.transcript.revision,title:r.name,semanticUnits,captionSpans:semanticUnits.map(({startWord,endWord})=>({startWord,endWord}))});
}
const designs=[{template,baseRevision:0}];
const manifest={idempotencyKey:'paper-public-scenes-'+createHash('sha256').update(JSON.stringify({designs,samples})).digest('hex'),name:saved.name+' · 新人物与深浅背景检查',brief:'Selected public-domain interview excerpts with provenance. NIOSH uses same set as prior input but different speaker; NASA has dark geometric set. Original audio and local ASR timings retained. No listening or aesthetic acceptance claimed.',previewOnly:true,designs,samples};
await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
await fs.writeFile(root+'/application.json',JSON.stringify(application,null,2));
const submitted=await api('/production/author',manifest);await fs.writeFile(root+'/submission.json',JSON.stringify(submitted,null,2));
assert.deepEqual((await api('/dynamic-assets/'+saved.id)).definition,saved);console.log(JSON.stringify({batchId:submitted.id,samples:samples.length,root}));
