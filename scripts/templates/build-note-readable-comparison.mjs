import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root='/Users/zhengwei/Downloads/note-readable-real-2026-09-29';
const previous='../note-baseline-real-2026-09-29';
const verification=JSON.parse(await fs.readFile(`${root}/readability-verification.json`,'utf8'));
assert.equal(verification.reports.length,4);
assert.ok(verification.reports.every(r=>r.sourceInputEqual&&r.eventContentAndTimingEqual));
const trial=new URL('http://127.0.0.1:3000/templates/effects/style-study-20260924-note/try');
trial.search=new URLSearchParams({revision:'5',format:'landscape',scale:'0.5',centerX:'0.22',centerY:'0.18'}).toString();
const names=['Deborah · 人物访谈','Alex · 太阳背景','John · 深色背景','中文 · 纯音频排版'];
const sections=await Promise.all(names.map(async(name,i)=>{
  await fs.access(`${root}/preview-${i}.mp4`);
  await fs.access(`${root}/${previous}/preview-${i}.mp4`);
  return `<section><h2>${name}</h2><div class="pair"><figure><figcaption>r4：整组淡入，较宽纸边</figcaption><video controls preload="metadata" src="${previous}/preview-${i}.mp4"></video></figure><figure><figcaption>r5：出现即清晰，纸边更紧凑</figcaption><video controls preload="metadata" src="preview-${i}.mp4"></video></figure></div></section>`;
}));
await fs.writeFile(`${root}/comparison.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>纸签批注：短词可读性优化</title><style>body{margin:24px auto;padding:0 18px;max-width:1000px;background:#172126;color:#eee;font:16px/1.6 system-ui}a{color:#b5d9ff}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0}video{width:100%;max-height:650px;background:#000}section{margin:32px 0}figcaption{margin-bottom:8px}@media(max-width:600px){.pair{grid-template-columns:1fr}}</style><h1>纸签批注：短词可读性优化</h1><p>同样四份声音、同样横屏位置：字号上限不变，收紧内边距，让自动适配后的长词更饱满，入场改为70ms旋转归位且不再淡入，退出缩短到30ms。16个关键词及三层元素的内容和声音时间不变。</p><p>左为旧版，右为新版。中文样例为纯音频；人物构图适配需检查实拍样例，固定左上位置不代表自动避让背景。减少内边距会影响自动适配字号，长词底纸不一定更小。</p><p><a href="${trial.toString().replaceAll('&','&amp;')}">在工作台试用新版</a> · <a href="review.html">查看取帧证据</a> · <a href="readability-verification.json">查看数据比较</a></p><p>四组源输入、16处关键词内容与时间一致，动效已修改。未试听，未新增审美评分。</p>${sections.join('')}</html>`);
console.log(`${root}/comparison.html`);
