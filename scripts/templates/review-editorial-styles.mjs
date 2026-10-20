import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/effect-editorial-styles-2026-09-28';
const batchId=process.argv[2];assert.ok(batchId,'Pass the completed batch ID');
const response=await fetch('http://127.0.0.1:3000/api/footage/templates/production/'+encodeURIComponent(batchId));assert.ok(response.ok);
const batch=await response.json();assert.equal(batch.renderJob.status,'succeeded');
await fs.writeFile(root+'/batch-three-inputs.json',JSON.stringify(batch,null,2));
const results=[];
for(const item of batch.items)for(const preview of item.previews){
 assert.equal(preview.decodeVerified,true);assert.equal(preview.audioQuality.validated,true);
 const stem=`three-${item.index}-${preview.fixture}`;const video=`${root}/${stem}.mp4`;await fs.copyFile(preview.path,video);
 const frames=`${root}/${stem}.jpg`;
 execFileSync('/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg',['-v','error','-y','-i',video,'-vf','fps=2,scale=400:-1,tile=5x6','-frames:v','1',frames]);
 const entrance=`${root}/${stem}-entrance.jpg`;
 execFileSync('/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg',['-v','error','-y','-ss',String([0.6,0.74,0.9][preview.fixture]),'-i',video,'-vf','fps=30,crop=1100:230:90:450,scale=550:115,tile=5x4','-frames:v','1',entrance]);
 results.push({name:item.name,fixture:preview.fixture,video,frames,entrance});
}
await fs.writeFile(root+'/three-input-review-artifacts.json',JSON.stringify({batch:batch.id,results,listened:false},null,2));
console.log(JSON.stringify({batch:batch.id,exports:results.length}));
