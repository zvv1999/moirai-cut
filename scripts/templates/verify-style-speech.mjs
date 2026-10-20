import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let generations=0,failRead=true;let synthesis;
 page.on('request',r=>{if(r.url().endsWith('/tts/generate'))generations++;});
 await page.route('**/templates/inputs/*',async route=>{
  if(route.request().method()==='GET'&&failRead){failRead=false;await route.fulfill({status:503,json:{error:'验证：暂时无法读取配音'}});return;}
  await route.continue();
 });
 await page.goto(base+'/templates/effects/style-study-20260928-cyan-impact/try?revision=1');
 await page.getByText('生成配音',{exact:true}).click();
 await page.getByLabel('配音名称',{exact:true}).fill('样式试映闭环验证');
 await page.getByLabel('配音原文',{exact:true}).fill('让重点更加清晰，让表达更有力量。');
 const response=page.waitForResponse(r=>r.url().endsWith('/tts/generate'));
 await page.getByRole('button',{name:'生成并转写',exact:true}).click();
 synthesis=await (await response).json();assert.ok(synthesis.synthesis.input.id);
 await page.getByRole('alert').filter({hasText:'验证：暂时无法读取配音'}).waitFor();
 // Reload with a pending native input; the same receipt must resume without TTS.
 await page.reload();
 await page.getByText('声音已加入当前试映。请检查转写，并标注要强调的重点词。',{exact:true}).waitFor({timeout:240000});
 assert.equal(generations,1,'Reading retry must not synthesize again');
 await page.getByRole('alert').filter({hasText:'当前声音尚未触发可显示的样式元素'}).waitFor();
 await page.getByText('内容重点 · 1 段',{exact:true}).click();
 await page.getByText('精确范围与段落调整',{exact:true}).click();
 await page.getByLabel('第1段重点起词',{exact:true}).selectOption('1');
 const rendered=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.request().postDataJSON()?.sample.semanticUnits[0].keyword?.endWord===3&&r.ok());
 await page.getByLabel('第1段重点止词',{exact:true}).selectOption('3');
 const preview=await (await rendered).json();
 await page.waitForFunction(()=>{const c=document.querySelector('canvas[aria-label="效果实时画面"]');return c&&getComputedStyle(c).visibility==='visible';});
 const detail=await(await fetch(base+'/api/footage/templates/inputs/'+synthesis.synthesis.input.id)).json();
 const elements=preview.tracks.overlay.flatMap(t=>t.elements);
 const headline=elements.find(e=>e.params?.content===detail.transcript.words.slice(1,3).map(w=>w.text).join(''));
 assert.ok(headline,'Selected keyword rendered');
 assert.equal(headline.startTime,Math.round(detail.transcript.words[1].start*120000));
 assert.equal(headline.duration,Math.round((detail.transcript.words[2].end-detail.transcript.words[1].start)*120000));
 await page.getByText('生成配音',{exact:true}).click();
 await page.getByLabel('配音名称',{exact:true}).fill('样式试映闭环验证');
 await page.getByLabel('配音原文',{exact:true}).fill('让重点更加清晰，让表达更有力量。');
 // Native synthesis dedup must retain current in-form keyword annotations.
 const second=page.waitForResponse(r=>r.url().endsWith('/tts/generate'));
 await page.getByRole('button',{name:'生成并转写',exact:true}).click();
 const duplicate=await(await second).json();assert.equal(duplicate.synthesis.input.id,synthesis.synthesis.input.id);assert.equal(duplicate.deduplicated,true);
 await page.getByText('声音已加入当前试映。请检查转写，并标注要强调的重点词。',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'1');
 assert.equal(await page.getByLabel('第1段重点止词',{exact:true}).inputValue(),'3');
 // Fault-injected terminal transcription failure: retry reuses the input,
 // while native ASR is not intentionally broken or restarted for this UI test.
 let failed=true,retries=0;
 await page.unroute('**/templates/inputs/*');
 await page.route('**/templates/inputs/**',async route=>{
  if(route.request().method()==='POST'&&route.request().url().endsWith('/transcribe')){
   retries++;failed=false;await route.fulfill({status:200,json:{}});return;
  }
  if(route.request().method()==='GET'){
   const response=await route.fetch();const current=await response.json();
   if(failed)current.job={...current.job,status:'failed',error:'验证：转写失败'};
   await route.fulfill({response,json:current});return;
  }
  await route.continue();
 });
 await page.getByRole('button',{name:'生成并转写',exact:true}).click();
 await page.getByRole('button',{name:'重新转写这份声音',exact:true}).waitFor();
 await page.getByRole('button',{name:'重新转写这份声音',exact:true}).click();
 await page.getByText('声音已加入当前试映。请检查转写，并标注要强调的重点词。',{exact:true}).waitFor();
 assert.equal(retries,1);assert.equal(generations,3,'Transcription retry never invokes TTS');
 failed=true;
 await page.getByRole('button',{name:'生成并转写',exact:true}).click();
 await page.getByRole('button',{name:'稍后处理，保留声音',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'生成并转写',exact:true}).isEnabled(),true);
 assert.equal(await page.getByLabel('第1段重点起词',{exact:true}).inputValue(),'1');
 assert.deepEqual(errors,[]);
 await fs.writeFile('/tmp/style-speech-verification.json',JSON.stringify({inputId:detail.input.id,job:detail.job,transcriptRevision:detail.transcript.revision,keyword:headline,generations,deduplicated:duplicate.deduplicated},null,2));
 await page.screenshot({path:'/tmp/style-speech-verification.png',fullPage:true});
 console.log('PASS: real TTS, read failure recovery without regeneration, auto selection, keyword timing, preview rendering, dedup preserves annotations');
}finally{await browser.close();}
