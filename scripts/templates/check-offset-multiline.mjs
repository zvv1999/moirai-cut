import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root='/Users/zhengwei/Downloads/offset-multiline-real-20260929',base='http://127.0.0.1:3000/api/footage/templates',ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';
async function get(p){const r=await fetch(base+p);assert.ok(r.ok);return r.json();}
const submission=JSON.parse(await fs.readFile(root+'/submission.json')),batch=await get('/production/'+submission.id);console.log(batch.renderJob.status);if(batch.renderJob.status!=='succeeded')process.exit(2);
const item=await get('/production/'+batch.id+'/items/0'),old=await get('/production/production-074adc6c5e8d0fe8b58cf0af8f300594/items/0');
for(const [k,v]of Object.entries({batch,item,previous:old}))await fs.writeFile(root+'/'+k+'.json',JSON.stringify(v,null,2));
const sha=b=>createHash('sha256').update(b).digest('hex');const pcm=p=>sha(execFileSync(ff,['-v','error','-i',p,'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-'],{maxBuffer:100*1024*1024}));
const clips=f=>f.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));const source=f=>Object.fromEntries(Object.entries(f.request.input).filter(([k])=>k!=='template'));
const records=[];
for(const p of batch.items[0].previews){assert.ok(p.decodeVerified&&p.audioQuality.validated);assert.equal(sha(await fs.readFile(p.path)),p.sha256);const path=root+'/preview-'+p.fixture+'.mp4';await fs.copyFile(p.path,path);
 const current=item.output.fixtures[p.fixture],previous=old.output.fixtures[p.fixture];assert.deepEqual(source(current),source(previous));
 const a=clips(current),b=clips(previous);assert.deepEqual(a.map(e=>[e.params?.['template.elementId'],e.params?.content,e.startTime,e.duration]),b.map(e=>[e.params?.['template.elementId'],e.params?.content,e.startTime,e.duration]));
 assert.equal(pcm(path),pcm('/Users/zhengwei/Downloads/offset-readable-2026-09-28/format-0-'+p.fixture+'.mp4'));
 const events=[];for(const e of a.filter(e=>e.params?.['template.elementId']==='headline')){const index=events.length,t=(e.startTime+e.duration*.5)/120000,image='frame-'+p.fixture+'-'+index+'.png';execFileSync(ff,['-v','error','-y','-ss',String(t),'-i',path,'-frames:v','1',root+'/'+image]);events.push({text:e.params.content,time:t,start:e.startTime/120000,duration:e.duration/120000,image});}
 execFileSync(ff,['-v','error','-y','-i',path,'-vf','fps=2,scale=480:270,tile=4x8','-frames:v','1',root+'/whole-'+p.fixture+'.jpg']);records.push({fixture:p.fixture,path,events,pcmEqual:true,sourceAndTimingEqual:true});
}
assert.deepEqual((await get('/dynamic-assets/style-pilot-20260923-offset')).definition,JSON.parse(await fs.readFile(root+'/asset.json')));
await fs.writeFile(root+'/verification.json',JSON.stringify({records,listened:false,score:null},null,2));console.log('PASS three exports, content, timing, PCM and saved definition');
