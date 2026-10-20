import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const oldRoot='/Users/zhengwei/Downloads/sparkle-v5-portrait-2026-09-29';
const root='/Users/zhengwei/Downloads/sparkle-v5-portrait-band-2026-09-29';
const before=JSON.parse(await fs.readFile(oldRoot+'/item.json','utf8')),after=JSON.parse(await fs.readFile(root+'/item.json','utf8'));
assert.equal(after.output.fixtures.length,4);
const audio=path=>execFileSync('/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg',['-v','error','-i',path,'-map','0:a:0','-f','framemd5','-'],{encoding:'utf8',maxBuffer:4e6}).split('\n').filter(l=>l&&!l.startsWith('#'));
const reports=[];
for(let i=0;i<4;i++){
 const a=before.output.fixtures[i],b=after.output.fixtures[i];
 const input=f=>Object.fromEntries(Object.entries(f.request.input).filter(([k])=>k!=='template'));
 assert.deepEqual(input(a),input(b));
 const overlays=f=>{
  const tracks=structuredClone(f.compilation.document.scenes.flatMap(s=>s.tracks.overlay));
  const ids=new Map();
  tracks.forEach((t,ti)=>{ids.set(t.id,`track-${ti}`);t.elements.forEach((e,ei)=>ids.set(e.id,`element-${ti}-${ei}`));});
  const normalize=value=>{
   if(typeof value==='string')return ids.get(value)??value;
   if(Array.isArray(value))return value.map(normalize);
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .filter(([k])=>!(k==='id'&&'time' in value&&'value' in value)&&!['template.requestHash','template.applicationKey'].includes(k))
    .map(([k,v])=>[k,normalize(v)]));
   return value;
  };
  return normalize(tracks);
 };
 assert.equal(JSON.stringify(overlays(a)),JSON.stringify(overlays(b)),'Normalized overlay graph differs');
 const oldAudio=audio(`${oldRoot}/preview-${i}.mp4`),newAudio=audio(`${root}/preview-${i}.mp4`);assert.ok(oldAudio.length);assert.deepEqual(oldAudio,newAudio);
 reports.push({fixture:i,sourceInputEqual:true,compiledOverlaySemanticsEqual:true,audioDecodedFramesEqual:true,audioFrameCount:newAudio.length});
}
await fs.writeFile(root+'/band-verification.json',JSON.stringify({reports,normalization:'Map generated track/element IDs consistently; omit generated keyframe IDs and template request/application hashes. Preserve all values, times, geometry and attachment relationships.',listened:false},null,2));console.log(JSON.stringify(reports));
