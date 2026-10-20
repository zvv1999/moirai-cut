// Human-readable evidence-specific assessment; never an automatic aesthetic grader.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/adaptive-reading-real-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const application=JSON.parse(await fs.readFile(root+'/application.json','utf8'));
assert.equal(application.assetRevision,4);assert.equal((await api('/dynamic-assets/'+application.assetId)).definition.revision,4);
const batchId=JSON.parse(await fs.readFile(root+'/submission.json','utf8')).id;
const item=await api('/production/'+batchId+'/items/0');assert.equal(item.previews.length,4);
for(const p of item.previews)assert.equal(createHash('sha256').update(await fs.readFile(root+`/preview-${p.fixture}.mp4`)).digest('hex'),p.sha256);
const request={application,review:{templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 阶段性视觉评审',
 composition:{score:21,rationale:'四份样例全部16个关键词中点全幅帧已查看。左上布局未遮人物面部或手势，但Alex太阳背景和John展板被部分覆盖，长词底板面积较大、接近人物区域。固定位置不代表自动避让。'},
 motion:{score:21,rationale:'全部16个关键词从事件前两帧到后两帧的30fps左上裁切联系表已查看。文字底板同步、短词没有透明度变暗、没有换行跳动。90ms横移很克制，但直接出现与消失仍生硬，未实时试听判断语音节奏。'},
 assets:{score:17,rationale:'深墨文字与奶油背景清晰，原生背景跟随文字尺寸，无栅格放大问题；阅读标记与星光回弹、珊瑚侧标用途有区别。方形底板及单一字重的视觉层次仍简单。'},
 adaptation:{score:16,rationale:'三个不同人物实拍及中文纯音频，16个长短词完整显示，最长英文和中文可以两行。中文纯音频不能证明中文人物场景适配，未验收当前版竖屏。独立长句合成预览曾拆开最重要，内容同排提示可修正但本次成片不含该提示，不能继承为自动断句通过。'},
 editability:{score:9,rationale:'保存版保留可编辑文字、背景padding、两行预算和原生横移动效；已在当前版真实样式预览验证词范围排版并确认库不变。本轮未逐项重新修改保存所有样式属性。'},
 evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),
 inspection:'仅评审r4横屏1280×720、scale .65、center .22/.18。16个关键词中点全幅帧及全部事件前后30fps连续裁切，crop 600×270 at 0,0；motion-manifest记录视频哈希。',
 limitations:'未试听或整片实时播放。纯音频中文仅为排版证据。此为内部阶段性主观视觉评分，不代表用户审美认可、开拍同等质量或其他应用布局。',
 blockingFindings:['长词底板与背景信息竞争，需要进一步收紧排版和选择适合画面的布局。','直接进退场仍生硬，完整听感及当前版竖屏适配未完成。'],listened:false}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));
const saved=await api('/dynamic-assets/reviews',request);assert.equal(saved.total,84);assert.equal(saved.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===saved.id);assert.ok(listed.current&&listed.evidenceCurrent);
await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));console.log(JSON.stringify({total:saved.total,current:listed.current,evidenceCurrent:listed.evidenceCurrent,meetsInternalThreshold:saved.meetsInternalThreshold}));
