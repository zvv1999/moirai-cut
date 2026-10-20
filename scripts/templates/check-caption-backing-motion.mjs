import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/caption-backing-motion-20260929';
const old=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/caption-saved-20260929/item.json','utf8'));
const current=JSON.parse(await fs.readFile(root+'/item.json','utf8'));
const elements=f=>f.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements)).filter(e=>e.params?.['template.elementId']==='headline');
const normalize=e=>({startTime:e.startTime,duration:e.duration,params:Object.fromEntries(Object.entries(e.params).filter(([k])=>!['template.applicationKey','template.requestHash'].includes(k))),animations:Object.fromEntries(Object.entries(e.animations).filter(([k])=>k!=='background.opacity').map(([k,v])=>[k,{...v,keys:v.keys.map(({id,...rest})=>rest)}]))});
let count=0;for(let i=0;i<current.output.fixtures.length;i++){const a=elements(old.output.fixtures[i]),b=elements(current.output.fixtures[i]);assert.equal(a.length,b.length);for(let j=0;j<a.length;j++){
assert.deepEqual(normalize(b[j]),normalize(a[j]));assert.equal(b[j].params.opacity,1);assert.equal(b[j].animations.opacity,undefined);
const keys=b[j].animations['background.opacity'].keys;assert.equal(keys[1].time,16800);assert.equal(keys.at(-2).time,b[j].duration-12000);assert.equal(keys.at(-1).time,b[j].duration);assert.equal(keys[0].value,0);assert.equal(keys[1].value,.62);assert.equal(keys.at(-2).value,.62);assert.equal(keys.at(-1).value,0);count++;
}}
await fs.writeFile(root+'/timing-comparison.json',JSON.stringify({passed:true,captionCount:count,allNonBackgroundMotionAndParametersPreserved:true,fullOpacity:true,enterSeconds:.14,exitSeconds:.1,holdBackgroundOpacity:.62},null,2));console.log(JSON.stringify({passed:true,captionCount:count}));
