import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/checklist-decoration-20260929';
const cases=[{name:'行动清单 · 短词',text:'完成，然后继续。',keyword:'完成',rate:180},{name:'行动清单 · 常速建议',text:'现在就开始行动。',keyword:'开始行动',rate:180},{name:'行动清单 · 长步骤',text:'把目标拆成三个可以完成的小步骤。',keyword:'三个可以完成的小步骤',rate:150}];
for(const [i,c]of cases.entries()){
 const file=root+'/speech-'+i+'.json';try{await fs.access(file);console.log('reuse',i);continue;}catch{}
 const r=await fetch('http://127.0.0.1:3000/api/footage/templates/tts/generate',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify({name:c.name,text:c.text,voiceId:'com.apple.voice.compact.zh-CN.Tingting',speakingRate:c.rate})});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));await fs.writeFile(file,JSON.stringify({case:c,result:d},null,2));console.log(i,JSON.stringify(d));
}
