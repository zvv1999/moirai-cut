import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
const root=process.env.PILOT_OUTPUT??"/Users/zhengwei/Downloads/effect-combined-pilot-2026-09-23";
const batch=JSON.parse(await fs.readFile(`${root}/batch.json`,"utf8"));
const manifest=JSON.parse(await fs.readFile(`${root}/designs.json`,"utf8"));
const ffmpeg="/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg";
const sample=manifest.samples[1];
const input=await(await fetch(`http://127.0.0.1:3000/api/footage/templates/inputs/${sample.inputId}`)).json();
assert.equal(input.transcript.revision,sample.transcriptRevision);
const windows=sample.semanticUnits.map(u=>({start:input.transcript.words[u.keyword.startWord].start,end:input.transcript.words[u.keyword.endWord-1].end}));
const evidence=[];
for(const item of batch.items){
  for(const preview of item.previews){
    assert.ok(preview.decodeVerified&&preview.audioQuality.validated);
    await fs.copyFile(preview.path,`${root}/preview-${item.index}-${preview.fixture}.mp4`);
    execFileSync(ffmpeg,["-v","error","-y","-ss",preview.fixture===0?"0.55":"0.65","-i",preview.path,"-t","1.2","-vf","fps=10,scale=480:-1,tile=4x3","-frames:v","1",`${root}/boundary-${item.index}-${preview.fixture}.jpg`]);
    if(preview.fixture!==1)continue;
    // Audio-only Chinese fixture has no source-video green pixels to confuse the mask.
    const pixels=execFileSync(ffmpeg,["-v","error","-i",preview.path,"-vf","fps=30,scale=320:180","-f","rawvideo","-pix_fmt","rgb24","-"],{maxBuffer:128*1024*1024});
    const frameBytes=320*180*3,visible=[];
    for(let frame=0;frame<pixels.length/frameBytes;frame++){
      let count=0;for(let i=frame*frameBytes;i<(frame+1)*frameBytes;i+=3)if(pixels[i]>160&&pixels[i]<245&&pixels[i+1]>190&&pixels[i+1]>pixels[i]+10&&pixels[i+2]<150)count++;
      if(count>15)visible.push(frame/30);
    }
    for(const time of visible)assert.ok(windows.some(w=>time>=w.start-1/30&&time<=w.end+1/30),`Background outside word event at ${time}`);
    for(const window of windows)assert.ok(visible.some(t=>t>=window.start&&t<=window.end),`Missing background in ${JSON.stringify(window)}`);
    evidence.push({design:item.name,fixture:preview.fixture,frames:pixels.length/frameBytes,visibleFrames:visible.length,windows,greenMask:"r 160-245, g >190 and >r+10, b <150, >15 pixels at 320x180; excludes yellow caption highlight",result:"all backgrounds inside measured keyword windows; each keyword visible"});
  }
}
await fs.writeFile(`${root}/timing-audit.json`,JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
