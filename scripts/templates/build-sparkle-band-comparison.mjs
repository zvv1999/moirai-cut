import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root='/Users/zhengwei/Downloads/sparkle-v5-portrait-band-2026-09-29';
const previous='../sparkle-v5-portrait-2026-09-29';
const verification=JSON.parse(await fs.readFile(`${root}/band-verification.json`,'utf8'));
assert.equal(verification.reports.length,4);
assert.ok(verification.reports.every(r=>r.sourceInputEqual&&r.compiledOverlaySemanticsEqual&&r.audioDecodedFramesEqual));
const trial=new URL('http://127.0.0.1:3000/templates/effects/style-pilot-20260923-sparkle-follow/try');
trial.search=new URLSearchParams({revision:'5',format:'portrait',scale:'0.75',centerX:'0.5',centerY:'0.87',videoX:'0',videoY:'0',videoWidth:'1',videoHeight:'0.78'}).toString();
const names=['Deborah · 人物访谈','Alex · 太阳背景','John · 深色背景','中文 · 纯音频排版'];
const sections=await Promise.all(names.map(async(name,i)=>{
  await fs.access(`${root}/preview-${i}.mp4`);
  await fs.access(`${root}/${previous}/preview-${i}.mp4`);
  return `<section><h2>${name}</h2><div class="pair"><figure><figcaption>原布局：花字直接叠在画面上</figcaption><video controls preload="metadata" src="${previous}/preview-${i}.mp4"></video></figure><figure><figcaption>分区布局：画面占上方 78%，下方留给花字</figcaption><video controls preload="metadata" src="preview-${i}.mp4"></video></figure></div></section>`;
}));
await fs.writeFile(`${root}/comparison.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>同一样式，两种应用布局</title><style>body{margin:24px auto;padding:0 18px;max-width:1000px;background:#172126;color:#eee;font:16px/1.6 system-ui}a{color:#b5d9ff}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0}video{width:100%;max-height:650px;background:#000}section{margin:32px 0}figcaption{margin-bottom:8px}@media(max-width:600px){.pair{grid-template-columns:1fr}}</style><h1>同一样式，两种应用布局</h1><p>星光弹字 r5 保持不变：文字、图标、动效、关键词时间完全一致。只缩小原视频区域，观察花字与人物的关系。</p><p>分区布局在已检查的关键词画面中避免压住人物和手势，但人物画面更小，黑色留白更明显。它是一种可选布局，不是所有视频的默认答案。中文样例是纯音频，仅用于排版检查。</p><p><a href="${trial.toString().replaceAll('&','&amp;')}">在工作台试用分区布局</a> · <a href="review.html">查看取帧证据</a> · <a href="band-verification.json">查看数据比较</a></p><p>四组源输入、叠加层内容及动效一致；音频解码帧哈希一致。未试听，未新增审美评分。</p>${sections.join('')}</html>`);
console.log(`${root}/comparison.html`);
