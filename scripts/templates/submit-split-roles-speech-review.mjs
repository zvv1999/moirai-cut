// Evidence-based provisional assessment; never generate a passing score from technical checks.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const root='/Users/zhengwei/Downloads/checklist-split-speech-20260930',base='http://127.0.0.1:3000/api/footage/templates';const read=p=>fs.readFile(p,'utf8').then(JSON.parse);
async function api(p,b){const r=await fetch(base+p,b?{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify(b)}:undefined),v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;}
const definition=await read(root+'/definition.json'),application=await read(root+'/application.json'),batch=await read(root+'/submission.json'),item=await api('/production/'+batch.id+'/items/0');assert.deepEqual((await api('/dynamic-assets/'+definition.id)).definition,definition);assert.equal(item.previews.length,3);
for(const p of item.previews)assert.equal(createHash('sha256').update(await fs.readFile(root+'/'+p.fixture+'.mp4')).digest('hex'),p.sha256);
const request={application,review:{templateId:item.templateId,templateRevision:item.templateRevision,batchId:batch.id,item:0,reviewer:'Codex · 中文词长阶段性抽帧评审',
composition:{score:20,rationale:'三组全幅代表帧可区分底部正文与侧栏重点，均左对齐且未裁切。长词为三个可以完成的/小步骤，7字与3字不均衡；黑底缺少画面主体，不能证明完整构图成熟。'},
motion:{score:20,rationale:'已查看三段关键词事件的30fps联系表及稳定帧，清单依附文字上沿、事件后退出，正文稳定。完成仅0.32秒，未通过实时播放确认短时辨识与语音节奏，不能给满分。'},
assets:{score:17,rationale:'20个原生图形组成的清单有纸面、靛蓝页眉与薄荷勾选层次，暖黄重点与暖白正文可区分。清单尺寸偏小、图示表现较基础，仍需提升风格辨识。'},
adaptation:{score:14,rationale:'同一1280×720应用覆盖2字、4字和10字重点，实测字号44px不缩字，正文36px，1/1/2行关键词，无溢出。仅三份黑底音频，不支持复杂实拍、竖屏或不同摆放的适配声明。'},
editability:{score:9,rationale:'同一保存版本22层已通过工作台选择、填充回读、刷新和手机宽度检查，生产模板与原生保存应用重新投影一致。本轮未逐项修改每个高级属性后再导出，保留一分。'},
evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),inspection:'三份中文音频输入的全幅关键词中点、三段完整关键词事件30fps联系表（长图缩放检查，未作逐像素判定）、真实Chrome字体测量和源PCM比较。仅此保存版本及1280×720默认应用。',limitations:'未试听、未实时连续观看。黑底为音频输入试样；实拍遮挡不在本次三份证据内。阶段性内部评分，不代表用户认可或开拍同等质感。',blockingFindings:['0.32秒短词尚缺实时阅读及声音节奏验收。','长词7/3换行不均衡，清单视觉辨识仍需改善。','缺少同应用更多实拍正例与复杂背景验证。'],listened:false}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));const saved=await api('/dynamic-assets/reviews',request);assert.equal(saved.total,80);assert.equal(saved.meetsInternalThreshold,false);const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===saved.id);assert.ok(listed.current&&listed.evidenceCurrent);await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));console.log({total:saved.total,current:listed.current,evidenceCurrent:listed.evidenceCurrent,meetsInternalThreshold:saved.meetsInternalThreshold});
