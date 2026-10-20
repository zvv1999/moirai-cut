import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
const root="/Users/zhengwei/Downloads/effect-weight-export-2026-09-24";
const batchId=process.env.PILOT_BATCH;
if(!batchId)throw Error("PILOT_BATCH is required");
const response=await fetch(`http://127.0.0.1:3000/api/footage/templates/production/${batchId}`);
assert.ok(response.ok);
const batch=await response.json();
assert.equal(batch.renderJob.status,"succeeded");
const audit=[];
for(const item of batch.items){
  const expected=String([400,800][item.index]);
  assert.equal(item.previews.length,2);
  for(const preview of item.previews){
    assert.equal(preview.decodeVerified,true);
    assert.equal(preview.audioQuality.validated,true);
    const projectId=item.fixtureProjects.find(p=>p.fixture===preview.fixture).projectId;
    const project=JSON.parse(await fs.readFile(`/Users/zhengwei/OpenCutProjects/${projectId}/project.json`,"utf8"));
    const texts=project.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements)).filter(e=>e.type==="text");
    assert.ok(texts.length);
    assert.ok(texts.every(e=>e.params.fontWeight===expected));
    const path=`${root}/preview-${item.index}-${preview.fixture}.mp4`;
    await fs.copyFile(preview.path,path);
    execFileSync("/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg",["-v","error","-y","-ss",preview.fixture===0?"0.9":"1.0","-i",path,"-frames:v","1",`${root}/weight-${expected}-${preview.fixture}.png`]);
    audit.push({weight:expected,fixture:preview.fixture,projectId,textInstances:texts.length,decodeVerified:true,audioSignalVerified:true,path});
  }
}
assert.equal(audit.length,4);
await fs.writeFile(`${root}/batch.json`,JSON.stringify(batch,null,2));
await fs.writeFile(`${root}/audit.json`,JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit));
