// Specific human-readable agent assessment of the inspected revision and artifacts.
// Not an automatic score generator; revise only after inspecting new evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:3000/api/footage/templates';
const root='/Users/zhengwei/Downloads/paper-note-v4-2026-09-28';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
const source=(await api('/dynamic-assets/style-study-20260924-note')).definition;
assert.equal(source.revision,4,'A new revision requires a new visual assessment');
const batchId='production-ccbc67b85c8f4b84b0dae962042c0ce5';
const item=await api('/production/'+batchId+'/items/0');
assert.equal(item.previews.length,3);
for(const preview of item.previews){
 const file=await fs.readFile(`${root}/format-0-${preview.fixture}.mp4`);
 assert.equal(createHash('sha256').update(file).digest('hex'),preview.sha256,'Reviewed local video must match production evidence');
}
const request={application:{assetId:source.id,assetRevision:4,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.85,centerX:0.5,centerY:0.8}},review:{
 templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 阶段性抽帧评审',
 composition:{score:22,rationale:'已查看三片全程 2fps 联系表及最长词稳定帧。此横屏下方应用未见遮脸和越界；中英文长词两行可读。仅同一访谈构图及黑底，没有验证人物运动和字幕组合。'},
 motion:{score:22,rationale:'已逐张查看三片全部 14 处关键词从入场前两帧到退场后两帧的 30fps 连续帧，下半画面覆盖纸签及胶带。未见文字跳位、两行换行抖动、底层与文字脱离或胶带遮字。0.4 秒短词全不透明保持从旧版 0.12 秒增至 0.24 秒，但 good thing 等短语的阅读窗口仍偏短，未试听判断语音节奏。'},
 assets:{score:18,rationale:'暖色纸面、深棕文字、加宽胶带和偏移底层层次比 v2 更清晰；v3 浮雕式字影已移除。中文黑底稳定阶段胶带辨识明确，中英文长词底纸完整。仍是平面纸签表达，未增加真实纸张纹理。'},
 adaptation:{score:14,rationale:'三份输入含中文八字和英文五词长关键词，两行完整。两个英文片段来自同一访谈，中文为黑底音频；竖屏、不同人物构图和复杂背景适配未在此应用评审中证明。'},
 editability:{score:9,rationale:'已保存定义保留独立 headline、note-shadow、paper-tape 图层及原生文字、颜色、动效和文字边界依附。此轮未重新操作每个属性后导出验证，因此不记满分。'},
 evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),
 inspection:'阶段性评审：三片全部 14 个关键词的 30fps 逐帧下半画面联系表（含前后两帧），结合此前全片 2fps 联系表及中英文长词原尺寸帧。只覆盖 revision 4 的 1280×720、scale 0.85、中心 (0.5,0.8) 应用。motion-manifest.json 关联视频哈希与每段检查帧号。',
 limitations:'未试听；非全片连续播放评审。英文为同一访谈场景，中文只有黑底音频。没有用户审美确认，不代表开拍同等质感，也不推广到其他位置、画幅或组合。',
 blockingFindings:['最终适配验收未完成：缺少干净的不同实拍场景；其他画幅和字幕组合是不同应用，未借用其结果。','最终听感验收未完成：尚未试听；短语的短时阅读与声音节奏仍需实播评估。'],listened:false
}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));
const saved=await api('/dynamic-assets/reviews',request);
assert.equal(saved.total,85);assert.equal(saved.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===saved.id);assert.equal(listed.current,true);
assert.deepEqual((await api('/dynamic-assets/'+source.id)).definition,source);
await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));
console.log(JSON.stringify({id:saved.id,total:saved.total,current:listed.current,meetsInternalThreshold:saved.meetsInternalThreshold}));
