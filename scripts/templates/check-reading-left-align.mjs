import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=process.env.READING_REVIEW_ROOT??'/Users/zhengwei/Downloads/reading-left-align-real-20260929',base='http://127.0.0.1:3000/api/footage/templates',ffmpeg='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';
const rows=JSON.parse(await fs.readFile(root+'/manifest.json')),reports=[];
const digest=b=>createHash('sha256').update(b).digest('hex');
const pcm=p=>digest(execFileSync(ffmpeg,['-v','error','-i',p,'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-'],{maxBuffer:100*1024*1024}));
const clips=f=>f.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
const normalize=v=>typeof v==='number'&&v===0?0:Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='id').map(([k,v])=>[k,normalize(v)])):v;
for(const row of rows){
 const b=await(await fetch(base+'/production/'+row.batchId)).json();assert.equal(b.renderJob.status,'succeeded',row.key+' still rendering');await fs.writeFile(row.root+'/batch.json',JSON.stringify(b,null,2));
 const item=await(await fetch(base+'/production/'+row.batchId+'/items/0')).json();await fs.writeFile(row.root+'/item.json',JSON.stringify(item,null,2));
 const previous=JSON.parse(await fs.readFile(row.source+'/item.json')),previews=[];
 for(const p of b.items[0].previews){
  assert.ok(p.decodeVerified&&p.audioQuality.validated);const bytes=await fs.readFile(p.path);assert.equal(digest(bytes),p.sha256);const video=row.root+'/preview-'+p.fixture+'.mp4';await fs.writeFile(video,bytes);
  const sourceFixture=row.fixtureMap?.[p.fixture]??p.fixture;const current=item.output.fixtures[p.fixture],old=previous.output.fixtures[sourceFixture];const source=f=>Object.fromEntries(Object.entries(f.request.input).filter(([k])=>k!=='template'));assert.deepEqual(source(current),source(old));
  const actualClips=clips(current),oldClips=clips(old);assert.equal(actualClips.length,oldClips.length);
  const events=[];for(const [i,e] of actualClips.entries()){
   for(const k of ['startTime','duration','type'])assert.deepEqual(e[k],oldClips[i][k]);assert.equal(e.params?.content,oldClips[i].params?.content);const actualMotion=normalize(e.animations),oldMotion=normalize(oldClips[i].animations);
   for(const channel of ['transform.positionX','transform.positionY']){
    const keys=actualMotion?.[channel]?.keys,oldKeys=oldMotion?.[channel]?.keys;
    if(keys&&oldKeys){assert.equal(keys.length,oldKeys.length);const delta=keys[0].value-oldKeys[0].value;
     for(let k=0;k<keys.length;k++){assert.ok(Math.abs((keys[k].value-oldKeys[k].value)-delta)<1e-7,'Alignment must only translate positional motion, not alter its trajectory');keys[k].value=oldKeys[k].value;}
    }
   }
   assert.deepEqual(actualMotion,oldMotion);
   if(e.params?.['template.elementId']==='headline'){
    assert.equal(e.params.textAlign,'left');const t=(e.startTime+e.duration*.5)/120000;
    const image='frame-'+p.fixture+'-'+events.length+'.png';execFileSync(ffmpeg,['-v','error','-y','-ss',String(t),'-i',video,'-frames:v','1',row.root+'/'+image]);
    events.push({text:e.params.content,start:e.startTime/120000,duration:e.duration/120000,time:t,image});
   }
  }
  const oldVideo=row.source+'/preview-'+sourceFixture+'.mp4';assert.equal(pcm(video),pcm(oldVideo));previews.push({fixture:p.fixture,sourceFixture,video,events,pcmEqual:true,sourceAndTimingEqual:true});
 }
 reports.push({...row,previews});console.log('PASS '+row.key+' '+previews.length+' exports');
}
await fs.writeFile(root+'/verification.json',JSON.stringify({reports,listened:false,score:null},null,2));
