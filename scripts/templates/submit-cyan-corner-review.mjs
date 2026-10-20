// A scoped visual assessment, not a score calculated from passing tests.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root='/Users/zhengwei/Downloads/cyan-corner-review-20260929';
const source='/Users/zhengwei/Downloads/cyan-natural-real-2026-09-29';
const base='http://127.0.0.1:3000/api/footage/templates';
async function api(path,body){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});
 const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;
}
const application=JSON.parse(await fs.readFile(source+'/application.json'));
const definition=(await api('/dynamic-assets/'+application.assetId)).definition;
assert.equal(definition.revision,application.assetRevision);
assert.equal(definition.revision,2,'A changed style requires another visual review.');
const panel=JSON.parse(await fs.readFile(root+'/panel-verification.json'));
assert.ok(panel.passed&&panel.revision===2);
const motion=JSON.parse(await fs.readFile(source+'/motion-manifest.json'));
assert.equal(motion.frames.length,16);
const batchId=motion.batchId;
const batch=await api('/production/'+batchId);assert.equal(batch.renderJob.status,'succeeded');
const item=await api('/production/'+batchId+'/items/0');assert.equal(item.previews.length,4);
for(const preview of item.previews){
 assert.ok(preview.decodeVerified&&preview.audioQuality.validated);
 for(const path of [preview.path,source+`/preview-${preview.fixture}.mp4`]){
  assert.equal(createHash('sha256').update(await fs.readFile(path)).digest('hex'),preview.sha256);
 }
 const events=motion.frames.filter(e=>e.fixture===preview.fixture);
 assert.ok(events.length>=3);
 for(const event of events){assert.equal(event.videoSha256,preview.sha256);await fs.access(event.path);}
}
const request={application,review:{
 templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 青色弹字左上应用阶段评审',
 composition:{score:21,rationale:'查看四份全幅代表帧和全部强调时段左上区域。三位人物面部未被文字覆盖；浅墙与深背景清楚。Alex太阳图案与青色文字争夺视觉注意，不把统一左上位置视为通用最佳位置。'},
 motion:{score:22,rationale:'查看全部16处关键词的30fps完整边界联系表，含出现前与消失后。90ms等比弹入、40ms淡出，持有段未见跳行或裁切、退出无残留。December仅0.36秒，尚未通过实际速度观看及听感验收。'},
 assets:{score:17,rationale:'自然比例粗体、青色填充与暗描边构成清楚的轻量强调，中文字形与英文长词均可辨识。单层弹字有明确用途，但视觉层次较简单；不以配色差异代替独立设计丰富度。'},
 adaptation:{score:17,rationale:'同一1280×720、scale .75、center .22/.18应用覆盖三份英文实拍与一份中文音频，16处长短词可显示一至两行。中文没有实拍背景，太阳背景上的视觉竞争尚待调整；不继承其他画幅或应用结论。'},
 editability:{score:9,rationale:'当前库r2与原生生产证据匹配。实际工作台两次加载核对文字对齐、最多两行、入场.09秒及退场.04秒，390px页面无横向溢出，前后库定义不变。本轮未做修改参数后再保存导出的操作，不计满分。'},
 evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),
 inspection:'四份全幅代表帧，全部16处强调的30fps连续边界联系表（裁切600×270，左上原点）。联系表视频SHA与当前生产项及磁盘视频全部一致。工作台属性及刷新回读另有panel-verification.json。',
 limitations:'逐帧联系表检查，不等于实时连续观片或试听。未验证中文实拍、手机端成片阅读体验及其他应用。阶段性内部主观评分，不代表参考视频1:1或用户审美认可。',
 blockingFindings:['Alex太阳背景与文字竞争注意力，应按实际画面比较更安静的摆放区域。','December等极短事件的实际速度观看与听感验收尚未完成。'],
 listened:false
}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));
const receipt=await api('/dynamic-assets/reviews',request);
assert.equal(receipt.total,86);assert.equal(receipt.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===receipt.id);
assert.ok(listed.current&&listed.evidenceCurrent);
assert.deepEqual((await api('/dynamic-assets/'+definition.id)).definition,definition);
await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));
console.log(JSON.stringify({id:listed.id,total:listed.total,current:listed.current,evidenceCurrent:listed.evidenceCurrent,meetsInternalThreshold:listed.meetsInternalThreshold}));
