import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root='/Users/zhengwei/Downloads/bulb-decoration-20260929';
const cases=[{name:'灵感动图 · 快速短词',text:'灵感，来自认真观察。',keyword:'灵感',rate:230},{name:'灵感动图 · 常速观点',text:'换个角度，就有新的思路。',keyword:'新的思路',rate:180},{name:'灵感动图 · 慢速解释',text:'把复杂的问题拆成可以行动的小步骤。',keyword:'可以行动的小步骤',rate:140}];
for(const [i,c]of cases.entries()){
 const file=root+'/speech-'+i+'.json';try{await fs.access(file);console.log('reuse',i);continue;}catch{}
 const r=await fetch('http://127.0.0.1:3000/api/footage/templates/tts/generate',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'moirai-footage'},body:JSON.stringify({name:c.name,text:c.text,voiceId:'com.apple.voice.compact.zh-CN.Tingting',speakingRate:c.rate})});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));await fs.writeFile(file,JSON.stringify({case:c,result:d},null,2));console.log(i,JSON.stringify(d));
}
