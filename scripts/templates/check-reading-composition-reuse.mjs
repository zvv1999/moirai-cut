import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/reading-composition-reuse-2026-09-29';
const read=async n=>JSON.parse(await fs.readFile(`${root}/${n}.json`,'utf8'));
const manifest=await read('designs'),sources=await read('sources'),item=await read('item');
const prior=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/reading-style-composition-2026-09-29/designs.json','utf8'));
const expected=structuredClone(prior.designs);
if(process.env.REFINE_LAYOUT==='1'){const t=expected[0].template,h=t.elements.find(e=>e.id==='page-heading');h.region={x:.08,y:.055,width:.84,height:.15};t.styles.find(s=>s.id===h.styleId).maxLines=2;assert.deepEqual(manifest.samples[1].layoutPhrases,[{wordSpan:{startWord:13,endWord:15}}]);}
assert.deepEqual(manifest.designs,expected,'Only the declared shared layout changes are allowed');
const checks=[];
for(const [i,fixture] of item.output.fixtures.entries()){
 const source=sources[i],sample=manifest.samples[i],words=source.transcript.words;
 assert.deepEqual(fixture.request.input.words,words);assert.equal(fixture.request.input.durationSeconds,source.input.durationSeconds);
 const elements=fixture.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements)),ids=new Set(elements.map(e=>e.params?.['template.elementId']));
 const get=id=>elements.filter(e=>e.params?.['template.elementId']===id).sort((a,b)=>a.startTime-b.startTime);
 const interval=(e,a,b)=>{assert.ok(Math.abs(e.startTime/120000-a)<1/120000);assert.ok(Math.abs((e.startTime+e.duration)/120000-b)<1/120000);};
 for(const id of ['page-background','page-heading','study--decoration']){assert.equal(get(id).length,1);interval(get(id)[0],0,source.input.durationSeconds);}
 assert.equal(get('page-heading')[0].params.content,sample.title);
 for(const [prefix,intents] of [['time--',['metric']],['note--',['call_to_action','conclusion']]]){
  const cues=sample.semanticUnits.filter(s=>intents.includes(s.intent)&&s.keyword);
  for(const id of [...ids].filter(id=>id?.startsWith(prefix))){const es=get(id);assert.equal(es.length,cues.length);for(const [j,cue] of cues.entries())interval(es[j],words[cue.keyword.startWord].start,words[cue.keyword.endWord-1].end);}
 }
 const captions=get('headline');assert.equal(captions.map(e=>e.params.content).join(''),words.map(w=>w.text).join(''));
 checks.push({fixture:i,title:sample.title,duration:source.input.durationSeconds,captions:captions.length,clockCues:get('time--face').length,noteCues:get('note--headline').length,illustrationInstances:1});
}
assert.equal(checks.length,3);const result={sameComposition:true,measuredWordsUnchanged:true,checks,listened:false,score:null};await fs.writeFile(root+'/reuse-verification.json',JSON.stringify(result,null,2));console.log(result);
