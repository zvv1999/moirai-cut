import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

// Run review-editorial-styles first to retain the native batch and copied MP4s.
// Decorations can sit outside the caption band, so inspect the entire frame.
const root=process.env.PILOT_OUTPUT;
assert.ok(root,'Set PILOT_OUTPUT to the reviewed batch directory');
const batch=JSON.parse(await fs.readFile(path.join(root,'batch-three-inputs.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'designs.json'),'utf8'));
assert.equal(batch.renderJob.status,'succeeded');
const ffmpeg=process.env.FFMPEG_BIN??'/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=process.env.REVIEW_TITLE??'装饰样式试映';
const description=process.env.REVIEW_DESCRIPTION??'同一样式应用到不同声音的实测关键词时间。重复触发用于适配测试，不代表语义推荐。这些是独立装饰候选，未叠加完整字幕；导出通过不等于审美验收。中文样例为音频黑底，英文样例来自同一采访场景。';
const cards=[];
for(const item of batch.items)for(const preview of item.previews){
 const sample=manifest.samples[preview.fixture];
 const response=await fetch(`http://127.0.0.1:3000/api/footage/templates/inputs/${encodeURIComponent(sample.inputId)}`);
 assert.ok(response.ok);
 const input=await response.json();
 assert.equal(input.transcript.revision,sample.transcriptRevision,'Transcript changed; retain pinned evidence before re-review');
 const keyword=sample.semanticUnits.find(unit=>unit.keyword)?.keyword;
 assert.ok(keyword,'No measured keyword event available');
 const word=input.transcript.words[keyword.startWord];
 assert.ok(Number.isFinite(word.start),'Missing measured word time');
 const stem=`three-${item.index}-${preview.fixture}`;
 execFileSync(ffmpeg,['-v','error','-y','-ss',String(Math.max(0,word.start-1/30)),'-i',path.join(root,stem+'.mp4'),'-vf','fps=30,scale=480:270,tile=5x4','-frames:v','1',path.join(root,stem+'-full-entrance.jpg')]);
 cards.push(`<article><h2>${escape(item.name)} · 样例 ${preview.fixture+1}</h2><video controls preload="metadata" src="${stem}.mp4"></video><details><summary>全画幅连续入场帧（30fps）</summary><img src="${stem}-full-entrance.jpg"></details><details><summary>全片抽帧（2fps）</summary><img src="${stem}.jpg"></details></article>`);
}
await fs.writeFile(path.join(root,'review.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px system-ui;background:#15191f;color:#e7ebf0;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{background:#242b35;padding:16px;border-radius:12px}h2{font-size:18px}video,img{width:100%}summary{cursor:pointer;margin:12px 0}p{max-width:900px;line-height:1.7}</style><h1>${escape(title)}</h1><p>${escape(description)}</p><main>${cards.join('')}</main></html>`);
console.log(JSON.stringify({review:path.join(root,'review.html'),previews:cards.length}));
