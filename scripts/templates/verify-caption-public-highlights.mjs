import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/caption-public-scenes-2026-09-28',base='http://127.0.0.1:3000/api/footage/templates';
async function read(path){const r=await fetch(base+path);assert.ok(r.ok);return r.json();}
const manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8')),submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const itemIndex=Number(process.env.REVIEW_ITEM_INDEX??0);assert.ok(Number.isInteger(itemIndex)&&itemIndex>=0);
const prefix=itemIndex===0?'':`item-${itemIndex}-`;
const crop=process.env.REVIEW_CROP==='lower_half'?'crop=iw:ih/2:0:ih/2':'crop=iw:ih/4:0:3*ih/4';
const item=await read('/production/'+submission.id+'/items/'+itemIndex);
const ffmpeg='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg',records=[];
for(const fixture of item.output.fixtures){
 const input=await read('/inputs/'+manifest.samples[fixture.index].inputId),words=input.transcript.words;
 const elements=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements)).filter(e=>e.params?.['template.elementId']==='headline');
 const evidence=item.previews.find(p=>p.fixture===fixture.index),video=root+(process.env.REVIEW_VIDEO_PREFIX ? `/${process.env.REVIEW_VIDEO_PREFIX}${fixture.index}.mp4` : `/format-${itemIndex}-${fixture.index}.mp4`);
 assert.equal(createHash('sha256').update(await fs.readFile(video)).digest('hex'),evidence.sha256);
 let index=0;const frames=[];
 for(const element of elements){
  if(process.env.ASSERT_FULL_OPACITY){assert.equal(element.params.opacity,1);assert.equal(element.animations.opacity,undefined);}
  const timing=JSON.parse(element.params['text.wordTimings']);
  assert.equal(timing.content,element.params.content);assert.equal(element.params['text.highlightEnabled'],true);
  for(const window of timing.windows){
   const word=words[index++];assert.ok(word);
   assert.equal(timing.content.slice(window.start,window.end),word.text);
   assert.ok(Math.abs((element.startTime+window.startTime)/120000-word.start)<1/120000);
   assert.ok(Math.abs((element.startTime+window.endTime)/120000-word.end)<1/120000);
   const midpoint=(word.start+word.end)/2;
   frames.push(Math.floor(midpoint*30));
  }
 }
 assert.equal(index,words.length,'Every transcribed word must have an exact highlight window');
 const select=[...new Set(frames)].map(n=>`eq(n\\,${n})`).join('+');
 execFileSync(ffmpeg,['-v','error','-y','-i',video,'-vf',`select=${select},${crop},scale=480:-1,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='%{pts}':fontsize=13:fontcolor=white:box=1:boxcolor=black:x=5:y=5,tile=4x${Math.ceil(new Set(frames).size/4)}`,'-frames:v','1',root+`/${prefix}highlight-${fixture.index}.jpg`]);
 records.push({fixture:fixture.index,wordCount:index,sha256:evidence.sha256,frames});
}
await fs.writeFile(root+'/'+prefix+'highlight-verification.json',JSON.stringify({passed:true,listened:false,records},null,2));
console.log(JSON.stringify({passed:true,words:records.reduce((n,r)=>n+r.wordCount,0)}));
