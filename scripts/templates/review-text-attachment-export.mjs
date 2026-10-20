import fs from "node:fs/promises";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const root="/Users/zhengwei/Downloads/text-attachment-export-2026-09-28";
const batchId=process.env.PILOT_BATCH??"production-ea5c77d101214b537135e95d1489ec34";
const response=await fetch(`http://127.0.0.1:3000/api/footage/templates/production/${batchId}`);
assert.equal(response.ok,true);const batch=await response.json();assert.equal(batch.renderJob.status,"succeeded");
await fs.writeFile(`${root}/batch.json`,JSON.stringify(batch,null,2));
const ffmpeg="/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg",results=[];
for(const preview of batch.items[0].previews) {
  assert.equal(preview.decodeVerified,true);assert.equal(preview.audioQuality.validated,true);
  const video=`${root}/preview-${preview.fixture}.mp4`;await fs.copyFile(preview.path,video);
  execFileSync(ffmpeg,["-v","error","-y","-i",video,"-vf","fps=2,scale=360:360,tile=4x6","-frames:v","1",`${root}/sequence-${preview.fixture}.jpg`]);
  const times=preview.fixture===0?[0.8,4.2,6.45]:[1.1,3.75,5.45,7.75,9.5];
  for(const time of times) {
    const raw=execFileSync(ffmpeg,["-v","error","-ss",String(time),"-i",video,"-frames:v","1","-pix_fmt","rgb24","-f","rawvideo","pipe:1"],{maxBuffer:4*1024*1024});
    assert.equal(raw.length,720*720*3);
    let greenRight=-1,redLeft=720,greenCount=0,redCount=0;
    for(let y=280;y<440;y++)for(let x=0;x<720;x++) {
      const i=(y*720+x)*3,r=raw[i],g=raw[i+1],b=raw[i+2];
      if(g>180&&r<50&&b<50){greenRight=Math.max(greenRight,x);greenCount++;}
      if(r>180&&g<50&&b<50){redLeft=Math.min(redLeft,x);redCount++;}
    }
    const gap=redLeft-greenRight-1;
    results.push({fixture:preview.fixture,time,greenRight,redLeft,gap,greenCount,redCount});
    assert.ok(greenCount>100&&redCount>100,JSON.stringify(results.at(-1)));
    assert.ok(Math.abs(gap-14.4)<=3,JSON.stringify(results.at(-1)));
  }
}
await fs.writeFile(`${root}/spacing-review.json`,JSON.stringify({batchId,results,listened:false},null,2));
console.log(JSON.stringify({batchId,results,listened:false}));
