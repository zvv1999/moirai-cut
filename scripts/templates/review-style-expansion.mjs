import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const root=process.env.PILOT_OUTPUT??"/Users/zhengwei/Downloads/effect-style-expansion-2026-09-24";
const expectedDesigns=Number(process.env.PILOT_EXPECTED_DESIGNS??3);
assert.ok(Number.isInteger(expectedDesigns)&&expectedDesigns>0);
const batch=JSON.parse(await fs.readFile(`${root}/batch.json`,"utf8"));
assert.equal(batch.renderJob.status,"succeeded");
assert.equal(batch.items.length,expectedDesigns);
const results=[];
for(const item of batch.items) {
  assert.equal(item.previews.length,2);
  for(const preview of item.previews) {
    assert.equal(preview.decodeVerified,true);
    assert.equal(preview.audioQuality.validated,true);
    const output=`${root}/preview-${item.index}-${preview.fixture}.mp4`;
    await fs.copyFile(preview.path,output);
    const entry=`${root}/entrance-${item.index}-${preview.fixture}.jpg`;
    const start=preview.fixture===0?0.6:0.74;
    execFileSync("/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg",["-v","error","-y","-ss",String(start),"-i",output,"-vf","fps=30,crop=900:270:190:410,scale=450:135,tile=5x3","-frames:v","1",entry]);
    results.push({style:item.name,fixture:preview.fixture,output,entry});
  }
}
await fs.writeFile(`${root}/review-artifacts.json`,JSON.stringify({batch:batch.id,results,listened:false},null,2));
console.log(JSON.stringify({batch:batch.id,results,listened:false}));
