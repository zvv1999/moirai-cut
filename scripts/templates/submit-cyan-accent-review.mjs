// Evidence-scoped assessment, not an automated aesthetic score.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/cyan-accent-saved-20260929';
const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const read=async name=>JSON.parse(await fs.readFile(root+'/'+name,'utf8'));
const application=await read('application.json'),style=await read('style.json'),{id:batchId}=await read('submission.json');
assert.deepEqual((await api('/dynamic-assets/'+style.id)).definition,style);const item=await api('/production/'+batchId+'/items/0');assert.equal(item.previews.length,3);
for(const p of item.previews)assert.equal(createHash('sha256').update(await fs.readFile(root+`/preview-0-${p.fixture}.mp4`)).digest('hex'),p.sha256);
const assessment={
  "composition": {
    "score": 22,
    "rationale": "三份全片2fps全幅及最长词代表帧已查看。左侧布局在所查两份采访中避开脸和主要手势，字体层级较一致；太阳图与青色文字仍争夺注意力。中文黑底左置是验证输入，不构成完整成片构图。"
  },
  "motion": {
    "score": 22,
    "rationale": "全部15个关键词30fps连续裁切已逐一查看，双笔触及深色衬层随文字弹入与退场，所查未见脱离、跳行或残留。短词December/done well显示窗口较短，尚未试听和实时播放评价。"
  },
  "assets": {
    "score": 16,
    "rationale": "去除矩形底板后标签感减少；描边、硬阴影和深色衬层支撑明暗背景辨识。双矩形装饰表达仍简单、笔触偏硬，尚不足以证明开拍参考质感或独立高完成度设计。"
  },
  "adaptation": {
    "score": 17,
    "rationale": "同一保存v1应用覆盖中文声音与两位英文采访、15个长短关键词，多行布局稳定且实测时序不变。固定左置依赖空白区域，未验证人物在左侧、其他画幅和极长文案。"
  },
  "editability": {
    "score": 9,
    "rationale": "保存样式v1与原生Application对应，五个元素在工作台均可选中；字号草稿跨图层保持，刷新恢复保存值，手机宽度无溢出。衬层与白笔触为独立形状，联动编辑便利性仍可提升。"
  }
};
const request={application,review:{templateId:item.templateId,templateRevision:item.templateRevision,batchId,item:0,reviewer:'Codex · 双笔触逐事件视觉评审',...assessment,evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),inspection:'保存样式v1，1280×720全幅Application。三份全片2fps全幅、三张最长词全幅及全部15事件30fps连续裁切640×420 at0,60。',limitations:'未试听或实时播放评价。连续帧为局部裁切，全幅为2fps抽样；中文为黑底纯声音输入。此评价只对应本Application及三个视频哈希，不能推广到任意人物位置、画幅或文案。',blockingFindings:['双笔触造型偏简单，太阳图复杂背景仍与文字争夺注意力，需进一步设计打磨。','短词阅读节奏和听感尚未完成试听验收。'],listened:false}};
await fs.writeFile(root+'/style-review-request.json',JSON.stringify(request,null,2));
const receipt=await api('/dynamic-assets/reviews',request);assert.equal(receipt.total,86);assert.equal(receipt.meetsInternalThreshold,false);
const listed=(await api('/dynamic-assets/reviews')).reviews.find(r=>r.id===receipt.id);assert.ok(listed.current&&listed.evidenceCurrent);
await fs.writeFile(root+'/style-review-receipt.json',JSON.stringify(listed,null,2));console.log(JSON.stringify({id:receipt.id,total:86,current:listed.current,evidenceCurrent:listed.evidenceCurrent}));
