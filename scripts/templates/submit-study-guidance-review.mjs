// Evidence-specific subjective review. No automatic aesthetic scoring.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/study-guidance-published-2026-09-29';
async function api(path,body){const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const batchId=JSON.parse(await fs.readFile(root+'/submission.json','utf8')).id,item=await api('/production/'+batchId+'/items/0');assert.equal(item.templateRevision,3);assert.equal(item.previews.length,3);
for(const p of item.previews)assert.equal(createHash('sha256').update(await fs.readFile(p.path)).digest('hex'),p.sha256);
const request={templateId:item.templateId,templateRevision:3,batchId,item:0,reviewer:'Codex · 当前组合阶段性视觉评审',
 composition:{score:21,rationale:'三份720×960全片2fps联系表与已检查全幅代表帧中，标题、插画、提示和字幕分区清楚，没有观察到互遮。长标题两行、最重要同排已改善。纸签和字幕金色关键词重复强调同一内容，长句时上下两个阅读中心竞争；无提示段中部留白较大。'},
 motion:{score:21,rationale:'全部六次纸签和三次时钟从事件前两帧到后两帧的30fps连续裁切已查看，文字/底纸/胶带同步，时钟部件稳定，未见跳行。提示随实测词时间触发。纸签70ms入场和30ms退出较急，长协作段单一插画长期保持、变化不足；未试听或全片实时观片，不能评定声音节奏。'},
 assets:{score:16,rationale:'IRA Design MIT居家学习插画来源明确，透明边缘干净，奶油纸签与金色宋体形成一致配色，原生时钟可编辑。单人沙发电脑情境适合居家学习，对多人协作说明匹配偏泛；细节层次与主题专属性不足。'},
 adaptation:{score:16,rationale:'同一模板用于10.48/13.05/26秒三种中文内容，21个字幕完整保留，长标题/长重点词能换行。最重要同排依靠内容侧提示，不能宣称自动语义断行；所有输入同语种/同类TTS、同一画幅，尚未覆盖快慢语速及其他画幅。'},
 editability:{score:9,rationale:'18个原生元素均可在真实工作台选中，绑定/角色/时机回读一致，手机快速跳转与选择器保留未保存草稿。模板、独立样式与声音输入分离；图标11个零件仍逐项展开，作为整体修改的上手成本较高。'},
 evidence:item.previews.map(p=>({fixture:p.fixture,sha256:p.sha256})),
 inspection:'仅评审composition-study-guidance-20260929 v3及本批次三份720×960成片。全片2fps全幅联系表；六次纸签、三次时钟全部事件前后30fps连续图，crop 540×330 at 90,550。全幅检查与裁切检查用途分开，裁切不证明全部字幕边界。已有当前版原生时序/完整解码像素一致性证据、18元素UI验证与静音浏览器播放。',
 limitations:'内部阶段性主观视觉评审；未试听、未整片实时观片，不代表用户认可或开拍质量。适用于确切三份输入/布局，不迁移至独立样式或任意组合。',
 blockingFindings:['纸签与字幕重复强调，需调整信息层级，减少上下双重阅读焦点。','长协作段主题插画匹配偏泛且视觉变化不足，需要更合适的素材或分段编排。','尚缺快慢语速/其他画幅适配及完整听感验证。'],listened:false};
await fs.writeFile(root+'/quality-review-request.json',JSON.stringify(request,null,2));const receipt=await api('/reviews',request);assert.equal(receipt.total,83);assert.equal(receipt.meetsInternalThreshold,false);
const previews=await api('/previews');assert.equal(previews.previews[item.templateId].qualityReview.total,83);assert.equal(previews.previews[item.templateId].revision,3);
await fs.writeFile(root+'/quality-review-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({total:receipt.total,meetsInternalThreshold:receipt.meetsInternalThreshold,revision:3}));
