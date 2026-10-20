import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/style-format-adaptation-2026-09-28';
const submitted=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const batch=await(await fetch('http://127.0.0.1:3000/api/footage/templates/production/'+submitted.id)).json();
assert.equal(batch.renderJob.status,'succeeded');
await fs.writeFile(root+'/batch.json',JSON.stringify(batch,null,2));
const manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8'));
const ffmpeg='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';
const result=[];
for(const item of batch.items)for(const preview of item.previews){
 assert.equal(preview.decodeVerified,true);assert.equal(preview.audioQuality.validated,true);
 const stem=`format-${item.index}-${preview.fixture}`,video=root+'/'+stem+'.mp4';await fs.copyFile(preview.path,video);
 const input=await(await fetch('http://127.0.0.1:3000/api/footage/templates/inputs/'+manifest.samples[preview.fixture].inputId)).json();
 const sample=manifest.samples[preview.fixture],words=input.transcript.words;
 const keyword=sample.semanticUnits.at(-1)?.keyword??sample.captionSpans?.at(-1)??sample.semanticUnits.at(-1);
 assert.ok(keyword,"No annotated span available for representative frame");
 const start=words[keyword.startWord].start,end=words[keyword.endWord-1].end,time=(start+end)/2;
 execFileSync(ffmpeg,['-v','error','-y','-ss',String(time),'-i',video,'-frames:v','1',root+'/'+stem+'-long.jpg']);
 const seconds=words.at(-1).end,rows=Math.ceil(Math.ceil(seconds*2)/5);
 execFileSync(ffmpeg,['-v','error','-y','-i',video,'-vf',`fps=2,scale=240:-1,tile=5x${rows}`,'-frames:v','1',root+'/'+stem+'-sheet.jpg']);
 result.push({stem,name:item.name,fixture:preview.fixture,time,video,decodeVerified:true,audioStreamValidated:true});
}
await fs.writeFile(root+'/review.json',JSON.stringify({batchId:batch.id,listened:false,results:result},null,2));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=escape(process.env.REVIEW_TITLE??batch.name??'样式试映检查');
await fs.writeFile(root+'/review.html','<!doctype html><meta charset="utf-8"><title>'+title+'</title><style>body{background:#111;color:#eee;font:16px system-ui;margin:32px}section{display:inline-block;width:30%;vertical-align:top;margin:1%}video,img{width:100%}</style><h1>'+title+'</h1><p>候选版：检查长词、边界与构图；未做正式审美验收。</p>'+result.map(r=>`<section><h2>${escape(r.name)} · 输入 ${r.fixture+1}</h2><video controls src="${r.stem}.mp4"></video><img src="${r.stem}-long.jpg"></section>`).join(''));
console.log(JSON.stringify({batchId:batch.id,exports:result.length,root}));
