import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root='/Users/zhengwei/Downloads/clock-lifecycle-20261007';
const id='style-study-20260929-clock';
const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const write=(name,data)=>fs.writeFile(root+'/'+name,JSON.stringify(data,null,2));
const read=async name=>JSON.parse(await fs.readFile(root+'/'+name,'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
await fs.mkdir(root,{recursive:true});
const phase=process.argv[2]??'prepare';
if(phase==='prepare'){
  const current=(await api('/dynamic-assets/'+id)).definition;
  assert.equal(current.revision,5,'Do not overwrite a later revision.');
  const before=await read('before.json');assert.deepEqual(current,before);
  const candidate=structuredClone(before);candidate.minDisplaySeconds=.65;
  candidate.provenance+=' Revision 6 retains the exact r5 editable design and fixed animation phases. A native minimum visual hold of 0.65 seconds addresses short keyword flashes without modifying aligned word times. This remains the same clock family; new application evidence and scores are required.';
  candidate.usageGuide.adjustments='Agent按实际画面调整整体位置和等比大小；本次可覆盖最短展示时长minDisplaySeconds（0.1–3秒），未覆盖继承样式0.65秒。图层局部策略优先于应用，应用优先于样式；无值才沿用宿主节奏。各针、圆头和高光保持共轴补偿。坐标、输出比例和选中的词范围属于本次Application/输入，不保存为全库默认。';
  candidate.usageGuide.constraints='时间提示默认争取至少0.65秒展示，其中约100ms外壳入场、135ms指针运动、45ms整组退场，正常可留约0.47秒稳定段。下一个关键词、输入结束、maxSeconds或明确endAnchor仍优先截止，极密事件不保证达到最短值。保护人物、字幕和讲解图示；需看清外壳、主刻度及双针，实际输出尺寸另验。不得把定性指针动作解释为真实时刻或倒计时。';
  candidate.usageGuide.fallback='画面拥挤先换位置或换整体尺度，仍无法清楚辨认则换简洁图标或不用。连续时间词属于同一语义时，Agent可合并本次关键词范围为一次提示，减少反复入退场；不改原转写词时间。密集边界无法保留稳定段时，抑制次要提示或换构图，不能越过明确结束边界硬延长。';
  candidate.usageGuide.coverage='r6基于r5短关键词稳定段不足的真实发现增加原生展示规则；造型不变。当前版本等待新实际导出与逐帧复查，不继承r5的86分。计划回归既有三个实测正例及负例，增加密集实测语音、新背景、竖屏和较小尺度；实际覆盖与失败保留在clock-lifecycle-20261007。未试听、不声称20款已达标。';
  const inspected=await api('/dynamic-assets/inspect',candidate);await write('candidate.json',inspected.definition);await write('inspect.json',inspected);
  console.log(JSON.stringify({phase,minDisplaySeconds:inspected.definition.minDisplaySeconds,leaves:inspected.definition.layers.filter(l=>l.content.kind==='element').length}));
}else if(phase==='save'){
  const before=await read('before.json'),candidate=await read('candidate.json');assert.deepEqual((await api('/dynamic-assets/'+id)).definition,before);
  const result=await api('/dynamic-assets',{definition:candidate,baseRevision:before.revision,idempotencyKey:'clock-lifecycle-save-'+hash(candidate)});await write('save-receipt.json',result);await write('saved.json',result.definition);
  console.log(JSON.stringify({phase,revision:result.definition.revision}));
}else if(phase==='produce'){
  const name=process.argv[3];assert.ok(['main','dense','portrait','tiny'].includes(name));
  const saved=await read('saved.json');assert.deepEqual((await api('/dynamic-assets/'+id)).definition,saved);
  const samples=await read(name+'-samples.json');
  for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
  const application=await read(name+'-application.json');const projected=await api('/dynamic-assets/application',application);await write(name+'-template.json',projected.template);
  const designs=[{template:projected.template,baseRevision:0}];
  const manifest={name:'时间提示 · 最短展示与泛化 · '+name,brief:'Saved r6, exact native Application and measured speech. Visual hold extends only within existing boundaries; Agent chooses semantic ranges. Frame-based inspection, no score inheritance, no listening claim.',previewOnly:true,designs,samples,idempotencyKey:'clock-lifecycle-'+name+'-'+hash({designs,samples})};
  await write(name+'-manifest.json',manifest);const batch=await api('/production/author',manifest);await write(name+'-submission.json',batch);console.log(JSON.stringify({phase,name,id:batch.id}));
}else throw new Error('Unknown phase '+phase);
