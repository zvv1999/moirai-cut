import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const root="/Users/zhengwei/Downloads/effect-caption-reflow-2026-09-24";
const batch=JSON.parse(await fs.readFile(`${root}/batch.json`,"utf8"));
const previous=JSON.parse(await fs.readFile("/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23/batch.json","utf8"));
assert.equal(batch.renderJob.status,"succeeded");
assert.equal(batch.items.length,1);
const results=[];
for(const preview of batch.items[0].previews) {
  assert.equal(preview.decodeVerified,true);
  assert.equal(preview.audioQuality.validated,true);
  const old=previous.items.find(i=>i.index===0).previews.find(p=>p.fixture===preview.fixture);
  assert.ok(old);
  const video=`${root}/preview-${preview.fixture}.mp4`;
  await fs.copyFile(preview.path,video);
  for(const time of preview.fixture===0?[0.9,3.0,6.5]:[1.0,5.4,9.8]) {
    const output=`${root}/compare-${preview.fixture}-${time}.png`;
    execFileSync("/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg",["-v","error","-y","-ss",String(time),"-i",old.path,"-ss",String(time),"-i",video,"-filter_complex","[0:v]crop=1280:240:0:440,scale=960:180[a];[1:v]crop=1280:240:0:440,scale=960:180[b];[a][b]hstack=inputs=2","-frames:v","1",output]);
    results.push({fixture:preview.fixture,time,output});
  }
}
console.log(JSON.stringify({batch:batch.id,comparison:"old left; wider caption application right",results}));
