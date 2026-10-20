// Specific human-readable agent assessment of the inspected revision and artifacts.
// Not an automatic score generator; revise only after inspecting new evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:3000/api/footage/templates';
const root='/Users/zhengwei/Downloads/quotation-refine-2026-09-28';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
const source=(await api('/dynamic-assets/style-study-20260928-quotation')).definition;
assert.equal(source.revision,5,'A new revision requires a new visual assessment');
const batchId='production-3d46a821ac714de471ae0a0f3ec9fb1f';
const item=await api('/production/'+batchId+'/items/0');
assert.equal(item.previews.length,3);
for(const preview of item.previews){
 const file=await fs.readFile(`${root}/format-0-${preview.fixture}.mp4`);
 assert.equal(createHash('sha256').update(file).digest('hex'),preview.sha256,'Reviewed local video must match production evidence');
}
const request={application:{assetId:source.id,assetRevision:5,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:0.65,centerX:0.5,centerY:0.8}},review:{
 templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 阶段性抽帧评审',
 composition:{score:18,rationale:'三份全幅稳定帧及全片 2fps 联系表显示暖白文字与金色引号对比清楚，长短词可分一至两行。中央应用在 Alex 的 longer sunlight 和 John 的 learned so much 时段覆盖手势，因此构图不得判定通过。'},
 motion:{score:21,rationale:'已查看三片全部 11 处关键词的 30fps 边界联系表，含出现前与消失后两帧；引号保持依附，未见持有阶段换行抖动。入场 .10 秒、退场 .06 秒较旧版减少占时，但 December 的 .36 秒总窗口仍很短，未试听判断节奏。'},
 assets:{score:17,rationale:'原生宋体文字、Georgia 引号、暖白/金色及暗描边形成明确引用层级。v5 扩大文字区并调整字标比例，never got upset 与 longer sunlight 减少不必要换行。表现仍较简单，没有复杂素材层次，不以新增颜色计为独立风格。'},
 adaptation:{score:14,rationale:'此相同应用经过三位受访者、浅背景与深色几何墙的英文实测输入。长短词能容纳，但两位人物的手部冲突说明统一中央位置不能通用。中文与其他画幅另有试映，不借用不同应用的证据提高本记录分数。'},
 editability:{score:9,rationale:'已通过原生 inspect/save 回读 v5，headline、左右引号独立保留，文字绑定与 text_box 依附、颜色及动效可编辑；本轮未逐项操作编辑面板后导出，故不计满分。'},
 evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),
 inspection:'阶段性评审：三份实拍全片 2fps 联系表、最终长词全幅稳定帧，以及全部 11 个关键词的 30fps 下半画面边界联系表。仅针对 v5、1280×720、scale .65、center (.5,.8)。视频哈希与生产项逐一匹配。',
 limitations:'未试听，非连续播放听感评审。三个输入只有两类布景，均为英文。右下位置、中文及竖屏/方屏是其他应用，不代表本中央应用的缺陷已修复。',
 blockingFindings:['中央应用仍遮挡手势：Alex longer sunlight 约 10.9–11.4 秒；John learned so much 约 5.9–6.4 秒。应按输入调整布局后另行验收。','最终听感与短词阅读验收未完成：December 只有 .36 秒总展示窗口，尚未试听。'],listened:false
}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));
const saved=await api('/dynamic-assets/reviews',request);
assert.equal(saved.total,79);assert.equal(saved.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===saved.id);assert.equal(listed.current,true);
assert.deepEqual((await api('/dynamic-assets/'+source.id)).definition,source);
await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));
console.log(JSON.stringify({id:saved.id,total:saved.total,current:listed.current,meetsInternalThreshold:saved.meetsInternalThreshold}));
