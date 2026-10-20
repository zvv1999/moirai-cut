import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/warm-label-20260929',base='http://127.0.0.1:3000/api/footage/templates';
await fs.mkdir(root,{recursive:true});
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const raw=await r.text();assert.ok(r.ok,raw);return JSON.parse(raw);}
const id='style-study-20260928-measured-sparkle',current=(await api('/dynamic-assets/'+id)).definition;
let before;try{before=JSON.parse(await fs.readFile(root+'/before.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;assert.equal(current.revision,2);before=current;await fs.writeFile(root+'/before.json',JSON.stringify(before,null,2));}
const expected=structuredClone(before);
Object.assign(expected.styles.find(s=>s.id==='headline-style'),{textAlign:'left',maxLines:2});
for(const l of expected.layers){if(l.content.kind!=='element')continue;l.content.element.motionTiming.enterSeconds=.1;l.content.element.motionTiming.exitSeconds=.06;}
const inspected=(await api('/dynamic-assets/inspect',expected)).definition;assert.deepEqual(inspected,expected);
const timing=[];
for(const durationSeconds of [.5,1.8,2,20]){
 const projections=[];
 for(const [label,definition]of [['before',before],['after',expected]]){
  const preview=await api('/dynamic-assets/preview',{definition,inputs:{},durationSeconds});
  await fs.writeFile(`${root}/${label}-${durationSeconds}-preview.json`,JSON.stringify(preview,null,2));
  const e=preview.tracks.overlay.flatMap(t=>t.elements).find(e=>e.params?.['template.elementId']==='headline');
  const keys=e.animations.opacity.keys,opaque=keys.filter(k=>k.value===1);assert.ok(opaque.length>=1);
  projections.push({start:e.startTime,duration:e.duration,holdSeconds:(opaque.at(-1).time-opaque[0].time)/120000});
 }
 assert.equal(projections[0].start,projections[1].start);assert.equal(projections[0].duration,projections[1].duration);
 assert.ok(projections[1].holdSeconds>=projections[0].holdSeconds);
 if(durationSeconds===1.8){assert.ok(Math.abs(projections[0].holdSeconds-.06)<1e-5);assert.ok(Math.abs(projections[1].holdSeconds-.2)<1e-5);}
 timing.push({durationSeconds,before:projections[0],after:projections[1]});
}
let saved=current;const final=structuredClone(expected);final.revision=3;
if(JSON.stringify(current)!==JSON.stringify(final)){assert.deepEqual(current,before);saved=(await api('/dynamic-assets',{definition:expected,baseRevision:2,idempotencyKey:'warm-label-left-short-hold-20260929'})).definition;}
assert.deepEqual(saved,final);assert.deepEqual((await api('/dynamic-assets/'+id)).definition,final);
await fs.writeFile(root+'/after.json',JSON.stringify(final,null,2));await fs.writeFile(root+'/timing-verification.json',JSON.stringify({passed:true,timing,changes:['headline left alignment','headline maxLines 2','all three layers enter .10 / exit .06 seconds']},null,2));console.log('Saved warm label r3; fixed event times, longer clear hold');
