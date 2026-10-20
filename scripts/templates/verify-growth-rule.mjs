import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/growth-rule-20260929',base='http://127.0.0.1:3000/api/footage/templates';
const definition=JSON.parse(await fs.readFile(root+'/saved.json'));
const collect=es=>es.flatMap(e=>[e,...collect(e.renderGroup?.tracks.flatMap(t=>t.elements)??[])]);
const reports=[];
for(const durationSeconds of [.125,.45,1.4,4]){
 const r=await fetch(base+'/dynamic-assets/preview',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify({definition,inputs:{},durationSeconds,example:{text:'增长',keyword:'增长'}})});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));
 const es=collect(data.tracks.overlay.flatMap(t=>t.elements)),group=es.find(e=>e.renderGroup),leaves=es.filter(e=>e.params['template.elementId']);assert.equal(leaves.length,8);
 const envelope=group.animations.opacity.keys;const fadeSeconds=(envelope.at(-1).time-envelope.findLast(k=>k.value===1).time)/120000;assert.equal(envelope.at(-1).value,0);
 if(group.duration/120000>=.24)assert.ok(Math.abs(fadeSeconds-.06)<1e-5);
 for(let i=0;i<3;i++){
  const body=leaves.find(e=>e.params['template.elementId']==='bar-'+i),cap=leaves.find(e=>e.params['template.elementId']==='bar-'+i+'-cap');
  const ys=body.animations['transform.positionY'].keys,scales=body.animations['transform.scaleY'].keys,caps=cap.animations['transform.positionY'].keys;
  assert.equal(ys.length,scales.length);assert.equal(ys.length,caps.length);
  for(let k=0;k<ys.length;k++){
   assert.equal(ys[k].time,scales[k].time);assert.equal(ys[k].time,caps[k].time);
   assert.ok(Math.abs(ys[k].value+360*scales[k].value-169.2)<1e-6,'Body bottom drifts');
   assert.ok(Math.abs(caps[k].value-(ys[k].value-360*scales[k].value))<1e-6,'Cap detaches from body');
  }
 }
 for(const e of leaves){assert.ok(!e.animations.opacity);assert.equal(e.startTime,group.startTime);assert.equal(e.duration,group.duration);}
 reports.push({durationSeconds,eventSeconds:group.duration/120000,fadeSeconds,allBarsShareBaseline:true,capBodyJoinedAtKeys:true});
}
const live=await(await fetch(base+'/dynamic-assets/'+definition.id)).json();assert.deepEqual(live.definition,definition);
await fs.writeFile(root+'/rule-verification.json',JSON.stringify({passed:true,reports,syntheticTiming:true},null,2));console.log('PASS baseline and cap continuity, duration adaptation and one group fade');
