// Evidence-specific assessment, not an automatic score generator.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/sparkle-refine-left-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const application=JSON.parse(await fs.readFile(root+'/application.json','utf8'));
assert.equal(application.assetRevision,4);
const source=(await api('/dynamic-assets/'+application.assetId)).definition;assert.equal(source.revision,4);
const batchId=JSON.parse(await fs.readFile(root+'/submission.json','utf8')).id;
const item=await api('/production/'+batchId+'/items/0');assert.equal(item.previews.length,3);
for(const p of item.previews){assert.equal(createHash('sha256').update(await fs.readFile(root+`/preview-${p.fixture}.mp4`)).digest('hex'),p.sha256);}
const request={application,review:{templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 阶段性抽帧评审',
 composition:{score:22,rationale:'已查看三个不同人物场景全部11个关键词中点全幅画面。左上应用避开人物脸部和手势；右上失败版未混入证据。NASA Alex的文字覆盖太阳背景一部分，虽可读仍有背景竞争；固定位置不代表自动避让。'},
 motion:{score:22,rationale:'逐张检查11个关键词从前两帧到后两帧的30fps连续联系表，裁切600×260位于左上。文字回弹、星光旋转和淡出未见碰字、换行跳动或依附脱离。短词December保持时间有限，未试听或实时播放判断整体语音节奏。'},
 assets:{score:17,rationale:'淡紫描边文字和金色线条星光与原荧光底板已明显区分；共用已有Lucide许可资源，文字和星光保持独立。浅墙上金色图标对比偏弱，当前花字层次仍较简单。'},
 adaptation:{score:17,rationale:'三种人物、浅墙/太阳/深色展板，英文单词及最长四词短语完整显示，最长短语两行没有裁切。中文长短词仅有单独合成预览，不借用为此应用的中文声音验收；竖屏未证明。'},
 editability:{score:9,rationale:'保存版保留原生文字样式、两条独立元素、星光资源槽、文字边界依附与各自动效轨道。此轮以原生保存和导出验证，没有重新逐项操作属性面板。'},
 evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),
 inspection:'仅评审r4在1280×720、scale .65、center .22/.18的应用。全部11个关键词的中点全幅帧，加全部关键词从前两帧到后两帧的30fps左上连续帧；motion-manifest.json记录帧号、文字与视频SHA256。',
 limitations:'未试听，非整片实时播放审美验收。中文合成短长词属于独立预览证据，未计作此应用的中文原声适配。没有用户审美确认，也不等同开拍质感或其他画幅/摆放/组合。',
 blockingFindings:['浅墙上的金色线条星光对比仍偏弱，应继续优化装饰可辨识性。','最终听感、中文原声与更多画幅验收未完成。'],listened:false}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));
const saved=await api('/dynamic-assets/reviews',request);assert.equal(saved.total,87);assert.equal(saved.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===saved.id);assert.ok(listed.current&&listed.evidenceCurrent);
await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));
console.log(JSON.stringify({total:saved.total,current:listed.current,evidenceCurrent:listed.evidenceCurrent,meetsInternalThreshold:saved.meetsInternalThreshold}));
