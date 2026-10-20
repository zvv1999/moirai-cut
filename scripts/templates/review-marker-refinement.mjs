import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/marker-refine-r4-2026-09-29',base='http://127.0.0.1:3000/api/footage/templates';
const elementId=process.env.REVIEW_ELEMENT_ID??'headline';
const manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8'));
const reviewName=manifest.name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const batch=await(await fetch(base+'/production/'+submission.id)).json();
if(batch.renderJob.status!=='succeeded'){console.log(JSON.stringify(batch.renderJob));process.exit(2);}
const item=await(await fetch(base+'/production/'+submission.id+'/items/0')).json();
await fs.writeFile(root+'/batch.json',JSON.stringify(batch,null,2));await fs.writeFile(root+'/item.json',JSON.stringify(item,null,2));
const application=JSON.parse(await fs.readFile(root+'/application.json','utf8'));
const cropHeight=Math.min(240,application.canvas.height);
const region=manifest.designs[0].template.elements.find(element=>element.id===elementId)?.region;
const centerY=application.transform?.centerY ?? (region ? region.y+region.height/2 : undefined);
assert.ok(Number.isFinite(centerY),'Cannot locate the inspection element vertically');
const cropY=Math.max(0,Math.min(application.canvas.height-cropHeight,Math.round(centerY*application.canvas.height-cropHeight/2)));
const ffmpeg='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg',results=[];
for(const p of batch.items[0].previews){
 assert.ok(p.decodeVerified&&p.audioQuality.validated);
 const video=`${root}/preview-${p.fixture}.mp4`;await fs.copyFile(p.path,video);
 const fixture=item.output.fixtures[p.fixture];
 const elements=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
 const captions=elements.filter(e=>e.params?.['template.elementId']===elementId);assert.ok(captions.length);
 const times=captions.map(e=>({text:e.params.content,start:e.startTime/120000,duration:e.duration/120000,time:(e.startTime+e.duration*.5)/120000}));
 for(const [i,e] of times.entries())execFileSync(ffmpeg,['-v','error','-y','-ss',String(e.time),'-i',video,'-frames:v','1',`${root}/frame-${p.fixture}-${i}.png`]);
 const first=times[0];
 execFileSync(ffmpeg,['-v','error','-y','-ss',String(Math.max(0,first.start-.033)),'-i',video,'-vf',`fps=30,crop=${application.canvas.width}:${cropHeight}:0:${cropY},scale=640:120,tile=5x4`,'-frames:v','1',`${root}/motion-${p.fixture}.jpg`]);
 results.push({fixture:p.fixture,video,times});
}
await fs.writeFile(root+'/inspection.json',JSON.stringify({batchId:batch.id,results,listened:false,score:null},null,2));
await fs.writeFile(root+'/review.html',`<!doctype html><meta charset="utf-8"><title>${reviewName}</title><style>body{background:#172126;color:white;font:16px system-ui;margin:30px}video,img{max-width:100%;width:800px}section{margin-bottom:40px}</style><h1>${reviewName}</h1><p>真实测量词时间；独立预览工程。未试听、未正式评分。</p>${results.map(r=>`<section><h2>样例 ${r.fixture+1}</h2><video controls src="preview-${r.fixture}.mp4"></video><h3>首事件连续帧</h3><img src="motion-${r.fixture}.jpg">${r.times.map((e,i)=>`<p>${e.time.toFixed(2)} 秒</p><img src="frame-${r.fixture}-${i}.png">`).join('')}</section>`).join('')}`);
console.log(JSON.stringify({batchId:batch.id,exports:results.length,root}));
