import fs from "node:fs/promises";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const root="/Users/zhengwei/Downloads/effect-offset-refine-2026-09-24";
const batch=JSON.parse(await fs.readFile(`${root}/batch.json`,"utf8"));
const old=JSON.parse(await fs.readFile("/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23/batch.json","utf8"));
assert.equal(batch.renderJob.status,"succeeded");
for(const preview of batch.items[0].previews){
  const previous=old.items.find(i=>i.index===1).previews.find(p=>p.fixture===preview.fixture);
  assert.equal(preview.decodeVerified,true);assert.equal(preview.audioQuality.validated,true);
  const path=`${root}/preview-${preview.fixture}.mp4`;
  await fs.copyFile(preview.path,path);
  const time=preview.fixture===0?"0.9":"1.0";
  execFileSync("/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg",["-v","error","-y","-ss",time,"-i",previous.path,"-ss",time,"-i",path,"-filter_complex","[0:v]crop=800:260:240:420[a];[1:v]crop=800:260:240:420[b];[a][b]hstack=inputs=2","-frames:v","1",`${root}/before-after-${preview.fixture}.png`]);
}
console.log(JSON.stringify({batch:batch.id,previews:batch.items[0].previews.length,comparison:"old left, revised right",root}));
