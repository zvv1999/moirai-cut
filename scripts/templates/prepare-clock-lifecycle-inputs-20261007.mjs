import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/clock-lifecycle-20261007';
const previous='/Users/zhengwei/Downloads/clock-design-20261007';
const write=(n,d)=>fs.writeFile(root+'/'+n,JSON.stringify(d,null,2));
const read=async n=>JSON.parse(await fs.readFile(root+'/'+n,'utf8'));
const api=async p=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+p);assert.ok(r.ok);return r.json();};
const evidence=[];
async function sample(inputId,title,ranges){
  const source=await api('/inputs/'+inputId);assert.ok(source.transcript);await write(inputId+'.json',source);
  const semanticUnits=[];let cursor=0;
  for(const [start,end,ks,ke,rationale] of ranges){
    if(cursor<start)semanticUnits.push({startWord:cursor,endWord:start,intent:'neutral',rationale:'No selected time emphasis in this context.'});
    semanticUnits.push({startWord:start,endWord:end,intent:'emphasis',keyword:{startWord:ks,endWord:ke},rationale});cursor=end;
  }
  if(cursor<source.transcript.words.length)semanticUnits.push({startWord:cursor,endWord:source.transcript.words.length,intent:'neutral',rationale:'No selected time emphasis in this context.'});
  const result={inputId,transcriptRevision:source.transcript.revision,title,semanticUnits};
  evidence.push({title,inputId,transcriptRevision:source.transcript.revision,media:source.input,events:ranges.map(([a,b,ks,ke,why])=>{const w=source.transcript.words.slice(ks,ke);return{wordSpan:[ks,ke],text:w.map(x=>x.text).join(' '),start:w[0].start,end:w.at(-1).end,why};})});
  return result;
}
const saved=await read('saved.json');assert.equal(saved.revision,6);
const existing=JSON.parse(await fs.readFile(previous+'/samples.json','utf8'));
for(const s of existing){const source=await api('/inputs/'+s.inputId);assert.equal(source.transcript.revision,s.transcriptRevision);await write(s.inputId+'.json',source);evidence.push({title:s.title,inputId:s.inputId,transcriptRevision:s.transcriptRevision,media:source.input,events:s.semanticUnits.filter(u=>u.keyword).map(u=>{const w=source.transcript.words.slice(u.keyword.startWord,u.keyword.endWord);return{wordSpan:[u.keyword.startWord,u.keyword.endWord],text:w.map(x=>x.text).join(' '),start:w[0].start,end:w.at(-1).end,why:u.rationale};})});}
const sudha=await sample('input-dff14c0aff0caae1c4c621fdec94cb54','明亮植物背景 · good time',[[2,14,7,9,'Good time with family is time spent together; qualitative time cue, not a countdown. New excerpt aligned locally from its own audio.']]);
const dense=await sample('input-ede294d905db437cda89766c4626dcd5','连续时间词 · 合并一次提示',[[0,5,0,5,'今天/明天/后天 form one connected temporal list. Agent merges the keyword span into one cue to avoid repeated animation, retaining measured words.']]);
const schedule=await sample('input-cff723e5973128fcb40827c9cf585831','安排今天 · 合适的时间',[[19,27,26,27,'时间 is the slot chosen for an important task; explicit scheduling semantics.']]);
await write('main-samples.json',[...existing,sudha,dense,schedule]);
const boundary=await sample('input-ede294d905db437cda89766c4626dcd5','边界测试 · 连续三次提示',[[0,1,0,1,'Boundary stress test: today, separate from next measured keyword.'],[1,3,1,3,'Boundary stress test: tomorrow, separate from next measured keyword.'],[3,5,3,5,'Boundary stress test: day after tomorrow. This repetitive candidate is not the preferred Agent arrangement.']]);
await write('dense-samples.json',[boundary]);
const warm=await sample('input-78c44ead8594fa3c15d54b6c539702f4','暖房竖屏 · 今天',[[48,62,48,49,'今天 anchors the introductory discussion in the present day. Preserve existing burned-in text, full 544×960 source frame and face.']]);
const podium=await sample('input-243f5008f62ad955f94e4ced4b429e73','竖屏负例 · 专业与信任',[]);
await write('portrait-samples.json',[warm,existing[1],podium]);
const base={assetId:saved.id,assetRevision:saved.revision,intents:['emphasis'],canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.4,centerX:.875,centerY:.25}};
await write('main-application.json',base);await write('dense-application.json',base);
await write('portrait-application.json',{...base,canvas:{width:544,height:960,fps:30},transform:{scale:.3,centerX:.82,centerY:.18},blurredBackground:true});
await write('input-evidence.json',evidence);
await write('adaptation.json',{styleId:saved.id,revision:6,unchangedDesign:'Same 28-leaf r5 artwork and fixed entrance/exit phases. Only reusable minimum display rule and its usage guide changed.',main:{application:'main-application.json',adjustment:'Center 0.83→0.875 stays outside the right edge of Sudha’s hair while retaining separation from Alex and the Sun diagram; source 16:9 framing unchanged.',sources:'7 independent inputs: existing 3 positives + negative, new bright-background English time excerpt, locally synthesized dense Chinese list grouped as one event, and a held-out local Chinese scheduling cue.'},portrait:{application:'portrait-application.json',adjustment:'Keep original 544×960 output for warm-room source; contained foreground for the 3:4 podium negative prevents face crop. Smaller 0.30 scale yields about118px clock diameter; upper-right .82,.18 protects face and the source’s center/lower captions.',scope:'One warm-room positive, one Chinese audio positive, one no-time-keyword podium negative. Do not inherit landscape score.'},dense:{application:'dense-application.json',adjustment:'Raw three-event arrangement is retained as a boundary/repetition stress test. Agent’s selected arrangement in main merges the related keyword span; no word time or saved style changes.',scope:'One input, insufficient for a formal standalone quality score. Do not call repeated triggering an aesthetic success merely because no overlap occurs.'},listened:false,continuousPlaybackViewed:false});
console.log(JSON.stringify({main:7,portrait:3,dense:1,revision:saved.revision}));
