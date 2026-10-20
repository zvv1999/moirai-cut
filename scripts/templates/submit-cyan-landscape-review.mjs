// Evidence-scoped assessment, not an automated aesthetic score.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/cyan-landscape-refined-20260929';
const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const read=async name=>JSON.parse(await fs.readFile(root+'/'+name,'utf8'));
const application=await read('application.json'),style=await read('style.json'),{id:batchId}=await read('submission.json');
assert.deepEqual((await api('/dynamic-assets/'+style.id)).definition,style);const item=await api('/production/'+batchId+'/items/0');assert.equal(item.previews.length,3);
for(const p of item.previews)assert.equal(createHash('sha256').update(await fs.readFile(root+`/preview-0-${p.fixture}.mp4`)).digest('hex'),p.sha256);
const request={application,review:{templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 阶段性逐事件画面评审',
composition:{score:20,rationale:'三份全片2fps全幅联系表及最长词代表帧已查看，横屏放大后辨识度提升，所查未遮脸或越界。但固定中央下方位置与两位人物的手势重叠；导师采访的花纹衣服也增加阅读背景干扰。'},
motion:{score:22,rationale:'全部15个关键词事件已查看30fps前后连续裁切，入场缩放、稳定显示和淡出未见跳行或残留，三份词时序校验通过。短词December及done well稳定窗口较短，尚未试听或实时全片判断阅读节奏。'},
assets:{score:17,rationale:'青色文字、深描边和压窄比例形成清楚的强调字样式，长中文及英文能分两行。视觉层次较简单，复杂衣服背景下仍依赖较粗描边，没有证据证明参考视频1:1质感。'},
adaptation:{score:16,rationale:'同一横屏应用覆盖中文声音、两位英文采访人物及长短关键词，15实例时序保持。两个实拍输入仍发生手势冲突；中文黑底只验证文字表现，其他画幅的不同应用不计入此评分。'},
editability:{score:9,rationale:'保存r2与应用前后快照一致，原生文字、描边和缩放动效保持可编辑，参数由独立Application投影。此轮未逐项修改编辑器属性再导出，不计满分。'},
evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),inspection:'三份全片2fps全幅联系表、最长词全幅以及全部15个关键词30fps事件前后连续裁切（900×260 at190,410）。仅适用r2横屏1280×720、scale1.45、center(.5,.76)及所登记三份视频。',limitations:'未试听、未实时全片播放评审；全幅每秒两帧，动效裁切不包含脸部。一个中文声音黑底与两个英文实拍，不能证明任意背景、任意长度或画幅适配。',blockingFindings:['中央下方固定位置仍与采访人物手势重叠，花纹衣服增加阅读干扰，需按内容选择布局。','短词阅读节奏和听感尚未完成试听验收。'],listened:false}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));const receipt=await api('/dynamic-assets/reviews',request);assert.equal(receipt.total,84);assert.equal(receipt.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===receipt.id);assert.ok(listed.current&&listed.evidenceCurrent);await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));console.log(JSON.stringify({id:receipt.id,total:84,current:true,evidenceCurrent:true}));
