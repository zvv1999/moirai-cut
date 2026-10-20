import fs from "node:fs/promises";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const root="/Users/zhengwei/Downloads/text-attachment-motion-export-2026-09-28";
const batchId=process.env.PILOT_BATCH??"production-5f3b88691a0d22ad13ed168f1591f1b8";
const response=await fetch(`http://127.0.0.1:3000/api/footage/templates/production/${batchId}`);
assert.equal(response.ok,true);const batch=await response.json();assert.equal(batch.renderJob.status,"succeeded");
await fs.writeFile(`${root}/batch.json`,JSON.stringify(batch,null,2));
const ffmpeg="/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg",results=[];
function sample(element,path,t){const keys=element.animations?.[path]?.keys??[];if(!keys.length)return Number(element.params[path]??(path.includes("scale")?1:0));if(t<=keys[0].time)return keys[0].value;for(let i=1;i<keys.length;i++)if(t<=keys[i].time){assert.equal(keys[i-1].segmentToNext,"linear");const f=(t-keys[i-1].time)/(keys[i].time-keys[i-1].time);return keys[i-1].value+(keys[i].value-keys[i-1].value)*f;}return keys.at(-1).value;}
for(const preview of batch.items[0].previews) {
  assert.equal(preview.decodeVerified,true);assert.equal(preview.audioQuality.validated,true);
  const video=`${root}/preview-${preview.fixture}.mp4`;await fs.copyFile(preview.path,video);
  execFileSync(ffmpeg,["-v","error","-y","-i",video,"-vf","fps=4,scale=240:240,tile=6x8","-frames:v","1",`${root}/sequence-${preview.fixture}.jpg`]);
  const projectId=batch.items[0].fixtureProjects.find(p=>p.fixture===preview.fixture).projectId;
  const project=JSON.parse(await fs.readFile(`/Users/zhengwei/OpenCutProjects/${projectId}/project.json`,"utf8"));
  const clips=project.scenes[0].tracks.overlay.flatMap(t=>t.elements);
  const children=clips.filter(e=>e.textAttachment);assert.ok(children.length>=3);
  for(const child of children){const parent=clips.find(e=>e.id===child.textAttachment.parent.elementId);assert.ok(parent);
    for(const fraction of [0.1,0.5,0.9]) {
      const tick=Math.ceil((child.startTime+child.duration*fraction)/4000)*4000,time=tick/120000;
      assert.ok(tick<child.startTime+child.duration);
      const angle=sample(parent,"transform.rotate",tick-parent.startTime)*Math.PI/180;
      const scale=sample(parent,"transform.scaleX",tick-parent.startTime);
      const raw=execFileSync(ffmpeg,["-v","error","-ss",String(time),"-i",video,"-frames:v","1","-pix_fmt","rgb24","-f","rawvideo","pipe:1"],{maxBuffer:4*1024*1024});assert.equal(raw.length,720*720*3);
      let greenRight=-Infinity,redLeft=Infinity,greenCount=0,redCount=0;
      for(let y=220;y<480;y++)for(let x=100;x<650;x++){const i=(y*720+x)*3,r=raw[i],g=raw[i+1],b=raw[i+2],axis=x*Math.cos(angle)+y*Math.sin(angle);if(g>180&&r<50&&b<50){greenRight=Math.max(greenRight,axis);greenCount++;}if(r>180&&g<50&&b<50){redLeft=Math.min(redLeft,axis);redCount++;}}
      const gap=redLeft-greenRight-1,expected=14.4*scale;
      const result={fixture:preview.fixture,time,angle:angle*180/Math.PI,gap,expected,greenCount,redCount};results.push(result);
      assert.ok(greenCount>100&&redCount>100,JSON.stringify(result));assert.ok(Math.abs(gap-expected)<=4,JSON.stringify(result));
    }
  }
}
await fs.writeFile(`${root}/spacing-review.json`,JSON.stringify({batchId,results,listened:false},null,2));
console.log(JSON.stringify({batchId,frames:results.length,maxError:Math.max(...results.map(r=>Math.abs(r.gap-r.expected))),listened:false}));
