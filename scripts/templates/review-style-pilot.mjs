import fs from "node:fs/promises";
import {execFileSync} from "node:child_process";
const root=process.env.PILOT_OUTPUT??"/Users/zhengwei/Downloads/effect-style-pilot-2026-09-23";
const batchId=process.env.PILOT_BATCH??"production-a4accdf71389ce5f226b810ffe59ba79";
const response=await fetch(`http://127.0.0.1:3000/api/footage/templates/production/${batchId}`);
if(!response.ok)throw new Error(`Batch read failed: ${response.status}`);
const batch=await response.json();
if(batch.renderJob.status!=="succeeded")throw new Error(`Render is ${batch.renderJob.status}`);
await fs.mkdir(root,{recursive:true});
await fs.writeFile(`${root}/batch.json`,JSON.stringify(batch,null,2));
for(const item of batch.items){
  for(const preview of item.previews){
    const output=`${root}/render-${item.index}-${preview.fixture}.jpg`;
    execFileSync(process.env.FFMPEG??"/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg",["-v","error","-y","-i",preview.path,"-vf","fps=2,scale=480:-1,tile=4x6","-frames:v","1",output]);
    console.log(JSON.stringify({name:item.name,fixture:preview.fixture,output,video:preview.path}));
  }
}
