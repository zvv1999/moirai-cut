import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/Users/zhengwei/Downloads/clock-design-20261007';
const id='style-study-20260929-clock';
const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:3000/api/footage/templates'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const write=(name,data)=>fs.writeFile(root+'/'+name,JSON.stringify(data,null,2));
const read=async name=>JSON.parse(await fs.readFile(root+'/'+name,'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
await fs.mkdir(root,{recursive:true});
const phase=process.argv[2]??'prepare';
if(phase==='prepare'){
 const original=(await api('/dynamic-assets/'+id)).definition;assert.equal(original.revision,4,'Freeze from reviewed r4; inspect an intervening revision rather than overwriting it.');
 await write('before.json',original);await write('schema.json',await api('/dynamic-assets/schema'));
 const d=structuredClone(original),seed=structuredClone(original.layers.find(l=>l.content.element?.id==='rim').content.element),seedStyle=structuredClone(original.styles.find(s=>s.id===seed.styleId));
 d.layers=d.layers.filter(l=>l.content.kind==='group');d.styles=[];
 const timing={enterEnd:.35,enterSeconds:.135,exitStart:.85,exitSeconds:.045};
 const key=(time,value,easing='linear')=>({time,value,easing});
 const motion=(property,keys)=>({property,keys});
 function add(id,description,shape,region,fill,z,motions=[]){const e={...structuredClone(seed),id,description,region,z,styleId:id+'-style',features:{...seed.features,representation:shape},motionTiming:timing,motions};d.layers.push({parentId:'root',content:{kind:'element',element:e}});d.styles.push({...structuredClone(seedStyle),id:e.styleId,description,fill,strokeWidth:0});return e;}
 function ellipse(id,description,x,y,w,h,fill,z){return add(id,description,'ellipse',{x,y,width:w,height:h},fill,z);}
 ellipse('case-depth','深蓝外壳厚度',.138,.153,.724,.724,'#22384A',0);
 ellipse('rim','蓝灰外壳轮廓',.14,.14,.72,.72,'#29475C',1);
 ellipse('rim-highlight','外壳上沿窄高光',.15,.145,.7,.7,'#94ADBA',2);
 ellipse('case-enamel','蓝灰珐琅外壳',.15,.159,.7,.7,'#4F7084',3);
 ellipse('inner-bezel','内圈阴影与面盘分隔',.181,.181,.638,.638,'#29475C',4);
 ellipse('face-bevel','暖白面盘斜边',.19,.19,.62,.62,'#D6D4C3',5);
 ellipse('face','象牙白面盘',.201,.198,.598,.598,'#FFF8E8',6);
 // All twelve marks keep one radial construction, with stronger quarters.
 for(let h=0;h<12;h++){const a=h*Math.PI/6,major=h%3===0,r=major?.247:.251,w=major?.017:.011,len=major?.047:.026;const names={0:'north',3:'east',6:'south',9:'west'};add(major?'mark-'+names[h]:'minute-mark-'+h,`${h}点${major?'主':'细'}刻度`,'rectangle',{x:.5+Math.sin(a)*r-w/2,y:.5-Math.cos(a)*r-len/2,width:w,height:len},major?'#405D70':'#81908D',7,[motion('rotation',[key(0,h*30),key(1,h*30)])]);}
 // Every shaft, rounded tip and highlight uses the same angle curve and pivot.
 // Its center offset R(v)-v compensates element-center rotation geometrically.
 const curve=(from,to,n=24)=>Array.from({length:n+1},(_,i)=>{const u=i/n;return {t:.35*u,a:from+(to-from)*(1-(1-u)**3)};}).concat({t:1,a:to});
 const hourCurve=curve(-152,-140),minuteCurve=curve(-90,0);
 function hand(id,description,shape,region,fill,z,angles){const vx=(region.x+region.width/2-.5)*720,vy=(region.y+region.height/2-.5)*720;const channels=['rotation','x','y'].map(property=>motion(property,angles.map(({t,a})=>{const rad=a*Math.PI/180;return key(t,property==='rotation'?a:property==='x'?vx*Math.cos(rad)-vy*Math.sin(rad)-vx:vx*Math.sin(rad)+vy*Math.cos(rad)-vy);})));return add(id,description,shape,region,fill,z,channels);}
 hand('hour','短时针','rectangle',{x:.5,y:.478,width:.14,height:.044},'#29475C',9,hourCurve);
 hand('hour-tip','短时针圆头','ellipse',{x:.618,y:.478,width:.044,height:.044},'#29475C',9,hourCurve);
 hand('hour-highlight','短时针窄高光','rectangle',{x:.515,y:.483,width:.106,height:.009},'#758C99',10,hourCurve);
 hand('minute','暖铜长分针','rectangle',{x:.5,y:.484,width:.19,height:.032},'#D9823B',11,minuteCurve);
 hand('minute-tip','长分针圆头','ellipse',{x:.674,y:.484,width:.032,height:.032},'#D9823B',11,minuteCurve);
 hand('minute-highlight','长分针窄高光','rectangle',{x:.519,y:.487,width:.149,height:.008},'#F5B86B',12,minuteCurve);
 ellipse('hub','共轴深蓝轴座',.455,.455,.09,.09,'#29475C',13);
 ellipse('hub-pin','暖铜轴心',.477,.477,.046,.046,'#DDA25F',14);
 ellipse('hub-glint','轴心细高光',.482,.48,.014,.014,'#FFE0AB',15);
 d.treatments=[{id:'group-fade-root',operation:{kind:'motion',channels:[motion('opacity',[key(0,0),key(.10,1),key(.8,1),key(1,0)]),motion('scale',[key(0,.93),key(.13,1.018,'ease_out'),key(.2,1,'ease_out'),key(1,1)]),motion('y',[key(0,5),key(.2,0,'ease_out'),key(1,0)])],motionTiming:{enterEnd:.2,enterSeconds:.10,exitStart:.8,exitSeconds:.045}}}];
 d.provenance='Original editable refinement of the existing clock family: layered enamel casing, narrow top bevel, twelve radial marks, paired hand highlights and brass common pivot. Geometry and motion are native editable layers, with no external bitmap. The short quarter-turn is a qualitative time cue, never measured real time, elapsed time, countdown or source-data value. Revision is pending fresh production/visual review; no inherited score.';
 d.usageGuide={purpose:'用于时间、等待、期限或时段相关语义的辅助图标；Agent按原文选择词范围。没有相应语义时不触发。指针是时间感提示，不表示真实时刻、倒计时或量化数据。',invariants:'保留蓝灰外壳、暖白表盘、十二刻度层级、短蓝针与长暖铜针、共同轴心。外壳轮廓和窄高光分离；短针轻微回正、长针轻转，再留稳定段；整个图标同步淡出。',adjustments:'Agent可按画面保护区调整整体位置和等比大小；本轮16:9应用初始scale=0.40、centerX=0.83、centerY=0.25。此坐标仅为本次Application，不是全库默认。保留各指针与高光的共轴补偿，不单独缩放某个针尖。',constraints:'需看清外轮廓、主刻度和双针；本轮预计直径约207px@1280×720，不将该值当全场景保证。实际词时长决定实例；外壳约100ms入场、指针135ms，45ms整组退场。短于本轮0.36s的事件、过密触发、小屏幕和竖屏另行验证。保护人物、讲解图示及原片文字，保持安全边距。',fallback:'优先换位置或放大整体；拥挤时改用较简洁的时间文字/图标或不使用。极短事件先改本次编排，明确生命周期；不得伪造词时间或改原声来延长停留。无时间语义不强放时钟。',coverage:'当前造型升级待重新检验，不继承r4或精细刻度候选分数。本轮计划3个独立实测输入（英文0.36s、中文0.66s/0.92s）及无时间语义负例；实际成片与边界检查保存在clock-design-20261007。未做试听、不承诺20个模板目标已完成。'};
 const inspected=await api('/dynamic-assets/inspect',d);await write('candidate.json',inspected.definition);await write('inspect.json',inspected);
 const cases=[{inputId:'input-80f248b968faad87d3460b76ec8badd1',title:'英文月份 · 短时间提示',unit:[0,7],keyword:[6,7],why:'December is an explicit time-of-year cue; selected by Agent from measured words.'},{inputId:'input-941335914fe590272ed1f8cef9af917a',title:'阅读 · 留出十分钟',unit:[10,16],keyword:[14,16],why:'十分钟 is an explicit duration, not a numeric clock reading.'},{inputId:'input-e01ef91d1e429916a7f317f32ac47da7',title:'协作 · 完成时间',unit:[15,23],keyword:[21,23],why:'完成时间 is a deadline concept; clock remains qualitative.'},{inputId:'input-d7a4d9279a7832764481dcb607bf9f70',title:'负例 · 从太空研究地球',unit:null,keyword:null,why:'No selected time/wait/deadline semantics. Agent leaves keyword absent; this verifies explicit suppression, not automatic semantic detection.'}];
 const samples=[],sources=[];
 for(const c of cases){const source=await api('/inputs/'+c.inputId);await write(c.inputId+'.json',source);const n=source.transcript.words.length;const bounds=c.unit??[0,n];const units=[];if(bounds[0])units.push({startWord:0,endWord:bounds[0],intent:'neutral',rationale:'Context without a selected time cue.'});units.push({startWord:bounds[0],endWord:bounds[1],intent:c.keyword?'emphasis':'neutral',...(c.keyword?{keyword:{startWord:c.keyword[0],endWord:c.keyword[1]}}:{}),rationale:c.why});if(bounds[1]<n)units.push({startWord:bounds[1],endWord:n,intent:'neutral',rationale:'Context without a selected time cue.'});samples.push({inputId:c.inputId,transcriptRevision:source.transcript.revision,title:c.title,semanticUnits:units});const words=c.keyword?source.transcript.words.slice(...c.keyword):[];sources.push({...c,transcriptRevision:source.transcript.revision,start:words[0]?.start??null,end:words.at(-1)?.end??null,wordDuration:words.length?words.at(-1).end-words[0].start:null,words});}
 await write('samples.json',samples);await write('input-evidence.json',sources);
 const app={intents:['emphasis'],assetId:id,assetRevision:4,canvas:{width:1280,height:720,fps:30},placement:{x:0,y:0,width:1,height:1},transform:{scale:.4,centerX:.83,centerY:.25}};await write('baseline-application.json',app);await write('baseline-template.json',(await api('/dynamic-assets/application',app)).template);
 console.log(JSON.stringify({phase,root,leaves:d.layers.length-1,sources:sources.map(s=>({id:s.inputId,duration:s.wordDuration}))}));
}else if(phase==='save'){
 const before=await read('before.json'),candidate=await read('candidate.json');assert.deepEqual((await api('/dynamic-assets/'+id)).definition,before,'Concurrent style change; re-review required.');
 const saved=await api('/dynamic-assets',{definition:candidate,baseRevision:before.revision,idempotencyKey:'clock-design-save-'+hash(candidate)});await write('save-receipt.json',saved);await write('saved.json',saved.definition);
 const app={...await read('baseline-application.json'),assetRevision:saved.definition.revision};await write('application.json',app);await write('template.json',(await api('/dynamic-assets/application',app)).template);console.log(JSON.stringify({phase,revision:saved.definition.revision}));
}else if(phase==='produce'){
 const saved=await read('saved.json');assert.deepEqual((await api('/dynamic-assets/'+id)).definition,saved);const samples=await read('samples.json');for(const s of samples)assert.equal((await api('/inputs/'+s.inputId)).transcript.revision,s.transcriptRevision);
 const template=await read('template.json');const baseline=await read('baseline-template.json');baseline.id='clock-r4-baseline-20261007';
 const designs=[{template,baseRevision:0},{template:baseline,baseRevision:0}];const manifest={name:'时间提示 · 造型层次与短事件验证',brief:'Same clock family r5 and r4 baseline; three measured independent time semantics and one explicit no-time-keyword negative. Retain editable layers/source audio; no score inheritance, no listening claim.',previewOnly:true,designs,samples,idempotencyKey:'clock-design-production-'+hash({designs,samples})};await write('manifest.json',manifest);const batch=await api('/production/author',manifest);await write('submission.json',batch);console.log(JSON.stringify({phase,id:batch.id,root}));
}else throw new Error('Unknown phase '+phase);
