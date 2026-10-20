import fs from'node:fs/promises';import assert from'node:assert/strict';
const source='/Users/zhengwei/Downloads/style-delivery-audit-20260930.json',root='/Users/zhengwei/Downloads/style-acceptance-board-20260930';await fs.mkdir(root,{recursive:true});const audit=JSON.parse(await fs.readFile(source));const response=await fetch('http://127.0.0.1:3000/api/footage/templates/dynamic-assets/reviews');assert.ok(response.ok);const reviews=(await response.json()).reviews;
// Explicit curation of related entries, not an inferred distinct-style quality count.
const groups=[
 ['行动清单',['style-study-20260930-checklist-split-roles','style-study-20260930-checklist-sidebar-large','style-study-20260930-checklist-sidebar','style-study-20260929-checklist-headline','style-study-20260929-checklist'],'r2已做中英六份复测；底字幕手势遮挡、实拍正例多样性未完成。'],
 ['灵感灯泡',['style-study-20260929-bulb-headline','style-study-20260929-bulb','style-study-20260928-idea'],'有不同词长与依附实验；需给当前保存应用登记完整视觉评审。'],
 ['便签纸面',['style-study-20260929-note-caption','style-study-20260929-note-paper','style-study-20260924-note'],'先核查r5实拍与短词动效证据；r4历史85分不继承。'],
 ['增长柱形',['style-study-20260929-growth-headline','style-study-20260929-bold-growth','style-study-20260928-growth'],'图示与花字组合是同一设计方向；核查当前版本的跨内容与动效证据。'],
 ['地球科普',['style-study-20260929-globe'],'核查球体辨识、图示语义与复杂背景；未登记当前有效评审。'],
 ['清晰字幕',['style-caption-inline-soft-panel-candidate-20260929','style-caption-inline-fine-candidate-20260929','style-caption-inline-cyan-candidate-20260929','style-caption-compact-candidate-20260929','style-pilot-20260923-caption'],'句内重点、底板、描边变体暂不算独立风格；以全文阅读和字幕节奏验收。'],
 ['时间时钟',['style-clock-detail-candidate-20260929','style-study-20260929-clock'],'核查钟面清晰度、短事件辨识、语义触发。'],
 ['完成勾选',['style-study-20260929-completion'],'核查勾选成形过程及短事件，不能以图标个数代替模板数。'],
 ['青色强调',['style-cyan-accent-candidate-20260929','style-cyan-translucent-candidate-20260929','style-study-20260928-cyan-impact','live-cyan-caption-20260919'],'现有效应用84–86分；优先解决太阳图视觉竞争与短词窗口，同族变体不重复计数。'],
 ['双圈强调',['style-study-20260928-rings'],'核查圈与文字/画面目标的关系、短事件与不同背景。'],
 ['方向箭头',['style-study-20260928-arrow'],'核查方向语义、目标依附与遮挡，避免无目标装饰。'],
 ['彩纸庆祝',['style-study-20260928-celebrate'],'核查事件密度、粒子遮脸、退出残留与语义适用。'],
 ['学习插画',['style-study-20260928-learning'],'优先核查原创插画质量和语义适用，尚无当前应用评审。'],
 ['信息侧标',['style-study-20260928-signal'],'核查r3当前保存应用，不继承旧版渲染结果。'],
 ['观点引号',['style-study-20260928-quotation'],'现有效应用79分；手势遮挡与极短词阅读未通过。'],
 ['星光强调',['style-study-20260928-measured-sparkle','style-pilot-20260923-sparkle-follow'],'先核查r5最新证据；历史87分不迁移，星光与文字依附变体同组。'],
 ['宋体讲述',['style-study-20260924-serif'],'核查宋体小字号、细笔画与复杂背景可读性。'],
 ['消散重影',['style-study-20260924-echo'],'核查r4透明度和重影退场，不引用旧r3的82分。'],
 ['奶油底签',['style-pilot-20260923-adaptive'],'核查r6测量边界、长词与底签几何匹配。'],
 ['珊瑚侧标',['style-pilot-20260923-marker'],'核查r5左对齐、长词和标记与实际文本边界。'],
 ['双层花字',['style-pilot-20260923-offset','dynamic-905625bd-59aa-4338-9c11-6e6cc8e95660'],'优先核查r7整体透明度与多行实拍；测试记录不作独立风格。'],
];
const all=groups.flatMap(g=>g[1]);assert.equal(new Set(all).size,all.length);assert.deepEqual([...all].sort(),audit.styles.map(s=>s.id).sort());
const families=groups.map(([name,ids,next])=>({name,classification:'curated_design_direction_not_accepted_distinct_template',next,entries:ids.map(id=>{const s=audit.styles.find(x=>x.id===id);return{...s,currentApplicationReviews:s.currentApplicationReviews.map(v=>{const r=reviews.find(x=>x.id===v.id);assert.ok(r?.current&&r.evidenceCurrent);return{...v,blockingFindings:r.submission.review.blockingFindings};})};})}));
const report={observedAt:audit.observedAt,activeEntries:audit.activeStyleEntryCount,curatedDirections:families.length,verifiedCurrentApplicationReviews:audit.styleReviewAudit.currentEvidenceRecords,acceptedStyleApplications:audit.styleReviewAudit.qualifiedApplications,goal:20,goalMet:false,legacyTechnicalTemplates:audit.reviewedTemplateCount,priority:['青色强调','双层花字','便签纸面'],families};await fs.writeFile(root+'/board.json',JSON.stringify(report,null,2));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=families.map(f=>`<article><h2>${esc(f.name)} <small>${f.entries.length}个条目</small></h2><p>${esc(f.next)}</p><ul>${f.entries.map(e=>`<li><a href="http://127.0.0.1:3000/templates?effect=${encodeURIComponent(e.id)}">${esc(e.name)} · r${e.revision}</a><br><span>${e.currentApplicationReviews.length?e.currentApplicationReviews.map(r=>`${r.score}/100（该应用，${r.meetsInternalThreshold?'内部达标':'需完善'}）`).join('；'):'当前版本无有效应用评审'}</span>${e.currentApplicationReviews.map(r=>`<details><summary>该应用证据与阻断项</summary><p>${esc(r.application.canvas.width)}×${esc(r.application.canvas.height)}；${r.files.length}份哈希已核验；${r.listened?'已标记试听':'未试听'}</p><ul>${r.blockingFindings.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></details>`).join('')}</li>`).join('')}</ul></article>`).join('');
await fs.writeFile(root+'/index.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>样式质量验收看板</title><style>body{max-width:1400px;margin:auto;padding:28px;background:#101820;color:#e9eef3;font:16px/1.6 system-ui}a{color:#89ddd2}h1{font-size:28px}h2{font-size:20px}small,span{color:#acbcc9;font-size:14px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:18px}article{border:1px solid #324352;padding:18px;border-radius:12px;background:#182531}ul{padding-left:20px}li{margin:12px 0}.notice{padding:20px;background:#283748;border-radius:12px;margin-bottom:24px}button{padding:10px 16px;cursor:pointer}</style><h1>20套高质量模板 · 当前验收看板</h1><div class="notice"><b>有效独立样式应用达到90分：${report.acceptedStyleApplications}。目标尚未达成。</b><p>${report.activeEntries}个活动条目归入${report.curatedDirections}个策划方向；分组只用于整理，不证明每组已构成独立高质量模板。${report.verifiedCurrentApplicationReviews}份当前应用评审、${audit.styleReviewAudit.verifiedStylePreviewCount}份成片哈希已核验。旧目录${report.legacyTechnicalTemplates}条技术合格模板不计入本目标。</p><p>优先推进：青色强调 → 双层花字 → 便签纸面。依据：已有应用评审或最新修复证据；仍需实际视觉验收。清单变体暂缓扩增。</p><small>快照时间 ${esc(report.observedAt)}。不是实时状态；样式更新后须重新核验。</small></div><div class="cards">${cards}</div></html>`);console.log({entries:report.activeEntries,directions:report.curatedDirections,currentReviews:report.verifiedCurrentApplicationReviews,qualified:report.acceptedStyleApplications,root});
