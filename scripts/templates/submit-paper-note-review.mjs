// Specific human-readable agent assessment of the inspected revision and artifacts.
// Not an automatic score generator; revise only after inspecting new evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:3000/api/footage/templates';
const root='/Users/zhengwei/Downloads/paper-note-refinement-2026-09-28';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
const source=(await api('/dynamic-assets/style-study-20260924-note')).definition;
assert.equal(source.revision,2,'A new revision requires a new visual assessment');
const batchId='production-75a6f9e1b2fb4e5e73874d6dc82b1449';
const item=await api('/production/'+batchId+'/items/0');
assert.equal(item.previews.length,3);
for(const preview of item.previews){
 const file=await fs.readFile(`${root}/format-0-${preview.fixture}.mp4`);
 assert.equal(createHash('sha256').update(file).digest('hex'),preview.sha256,'Reviewed local video must match production evidence');
}
const request={application:{assetId:source.id,assetRevision:2,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.85,centerX:0.5,centerY:0.8}},review:{
 templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 阶段性抽帧评审',
 composition:{score:22,rationale:'已查看三片全程 2fps 联系表及最长词稳定帧。此横屏下方应用未见遮脸和越界；中英文长词两行可读。仅同一访谈构图及黑底，没有验证人物运动和字幕组合。'},
 motion:{score:20,rationale:'查看三片首个关键词的连续入场帧：文字、偏移底层与胶带整体浮入，局部旋转可见。0.4 秒短词中入退场占比较高；未完成全片所有边界逐帧检查，也未试听判断听感节奏。'},
 assets:{score:17,rationale:'暖色纸面、棕色偏移衬底和透明胶带组成可辨识的便签；胶带与底层的层次在小尺寸下偏弱，当前以平面形状表达，没有明显纸张质感。'},
 adaptation:{score:14,rationale:'三份输入含中文八字和英文五词长关键词，两行完整。两个英文片段来自同一访谈，中文为黑底音频；竖屏、不同人物构图和复杂背景适配未在此应用评审中证明。'},
 editability:{score:9,rationale:'已保存定义保留独立 headline、note-shadow、paper-tape 图层及原生文字、颜色、动效和文字边界依附。此轮未重新操作每个属性后导出验证，因此不记满分。'},
 evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),
 inspection:'阶段性评审：三片全程 2fps 联系表，三片首个关键词入场连续帧，以及此前中英文最长关键词稳定帧。只覆盖此 revision 2 的 1280×720、scale 0.85、中心 (0.5,0.8) 应用。',
 limitations:'未试听；非全片连续播放评审。英文为同一访谈场景，中文只有黑底音频。没有用户审美确认，不代表开拍同等质感，也不推广到其他位置、画幅或组合。',
 blockingFindings:['最终适配验收未完成：缺少不同实拍构图、竖屏及字幕组合成片证据。','最终动效与听感验收未完成：只检查部分连续边界，尚未试听。'],listened:false
}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));
const saved=await api('/dynamic-assets/reviews',request);
assert.equal(saved.total,82);assert.equal(saved.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===saved.id);assert.equal(listed.current,true);
assert.deepEqual((await api('/dynamic-assets/'+source.id)).definition,source);
await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));
console.log(JSON.stringify({id:saved.id,total:saved.total,current:listed.current,meetsInternalThreshold:saved.meetsInternalThreshold}));
