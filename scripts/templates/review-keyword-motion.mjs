import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/paper-note-v4-2026-09-28';
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const base='http://127.0.0.1:3000/api/footage/templates';
async function read(path){const r=await fetch(base+path);assert.ok(r.ok);return r.json();}
const itemIndex=Number(process.env.REVIEW_ITEM_INDEX??0);
const elementId=process.env.REVIEW_ELEMENT_ID??'headline';
const fullFrame=process.env.REVIEW_FULL_FRAME==='1';
const crop=process.env.REVIEW_CROP?JSON.parse(process.env.REVIEW_CROP):null;
assert.ok(!crop||(Array.isArray(crop)&&crop.length===4&&crop.every(Number.isInteger)&&crop[0]>0&&crop[1]>0&&crop[2]>=0&&crop[3]>=0),'REVIEW_CROP must be [width,height,x,y] in pixels');
const frameFilter=crop?`crop=${crop.join(':')},scale=400:-1`:fullFrame?'scale=480:-1':'crop=iw:ih/2:0:ih/2,scale=320:-1';
assert.ok(Number.isInteger(itemIndex)&&itemIndex>=0);
const prefix=itemIndex===0?'':`item-${itemIndex}-`;
const batch=await read('/production/'+submission.id),item=await read('/production/'+submission.id+'/items/'+itemIndex);
assert.ok(batch.items.some(i=>i.index===itemIndex));
assert.equal(batch.renderJob.status,'succeeded');
const ffmpeg='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';
const frames=[];
for(const fixture of item.output.fixtures){
 const evidence=batch.items.find(i=>i.index===itemIndex).previews.find(p=>p.fixture===fixture.index);
 const bytes=await fs.readFile(evidence.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.sha256);
 const keywords=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements)).filter(e=>e.params?.['template.elementId']===elementId);
 assert.ok(keywords.length>0,`No ${elementId} instances in fixture ${fixture.index}; motion review would be empty`);
 for(const [index,e] of keywords.entries()){
  const start=e.startTime/120000,end=(e.startTime+e.duration)/120000;
  const first=Math.max(0,Math.floor(start*30)-2),last=Math.ceil(end*30)+2;
  const path=`${root}/${prefix}motion-${fixture.index}-${index}.jpg`;
  execFileSync(ffmpeg,['-v','error','-y','-i',evidence.path,'-vf',`select=between(n\\,${first}\\,${last}),${frameFilter},drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='%{pts}':fontsize=12:fontcolor=white:box=1:boxcolor=black:x=5:y=5,tile=6x${Math.ceil((last-first+1)/6)}`,'-frames:v','1',path]);
  frames.push({fixture:fixture.index,index,elementId,text:e.params.content,start,end,firstFrame:first,lastFrame:last,path,videoSha256:evidence.sha256,crop:crop?{pixels:crop,note:'explicit inspection crop; not full composition'}:fullFrame?'full frame':'lower half; not full composition'});
 }
}
assert.ok(frames.length>0,'No motion frames extracted');
await fs.writeFile(root+'/'+prefix+'motion-manifest.json',JSON.stringify({batchId:batch.id,elementId,fps:30,frames,listened:false},null,2));
console.log(JSON.stringify(frames.map(f=>({fixture:f.fixture,text:f.text,path:f.path}))));
