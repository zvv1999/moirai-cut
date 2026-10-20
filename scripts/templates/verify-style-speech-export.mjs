import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const root='/Users/zhengwei/Downloads/style-speech-export-2026-09-28';
await fs.mkdir(root,{recursive:true});
if(!process.env.RESUME_BATCH){
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates/effects/style-study-20260928-cyan-impact/try?revision=1');
 await page.locator('label.tp-choice').filter({hasText:'样式试映闭环验证'}).getByRole('checkbox').click();
 await page.getByText('内容重点 · 1 段',{exact:true}).click();
 await page.getByText('精确范围与段落调整',{exact:true}).click();
 await page.getByLabel('第1段重点起词',{exact:true}).selectOption('1');
 const rendered=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.request().postDataJSON()?.sample.semanticUnits[0].keyword?.endWord===3&&r.ok());
 await page.getByLabel('第1段重点止词',{exact:true}).selectOption('3');
 const realtime=await(await rendered).json();
 await fs.writeFile(root+'/realtime-preview.json',JSON.stringify(realtime,null,2));
 const submitted=page.waitForResponse(r=>r.url().endsWith('/production/author')&&r.ok());
 await page.getByRole('button',{name:'生成草稿预览 · 1 个成片',exact:true}).click();
 const submission=await(await submitted).json();
 await fs.writeFile(root+'/submission.json',JSON.stringify(submission,null,2));console.log('BATCH',submission.id);
 await page.getByText('草稿预览完成 · 未保存到模板库',{exact:true}).waitFor({timeout:240000});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
}
const submission=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
if(process.env.RESUME_BATCH)assert.equal(submission.id,process.env.RESUME_BATCH);
const realtime=JSON.parse(await fs.readFile(root+'/realtime-preview.json','utf8'));
const batch=await(await fetch(base+'/api/footage/templates/production/'+submission.id)).json();
const item=await(await fetch(base+'/api/footage/templates/production/'+submission.id+'/items/0')).json();
assert.equal(item.status,'published');
const exported=item.output.fixtures[0].compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements));
const shown=realtime.tracks.overlay.flatMap(t=>t.elements);
const keyword=e=>e.params?.['template.elementId']==='headline';
const a=shown.filter(keyword),b=exported.filter(keyword);assert.equal(a.length,1);assert.equal(b.length,1);
for(const field of ['startTime','duration'])assert.equal(b[0][field],a[0][field]);
assert.equal(b[0].params.content,a[0].params.content);
const evidence=batch.items[0].previews[0];assert.equal(evidence.decodeVerified,true);assert.equal(evidence.audioQuality.validated,true);
const response=await fetch(base+'/api/footage/templates/production/'+submission.id+'/items/0/previews/0');assert.ok(response.ok);
const bytes=Buffer.from(await response.arrayBuffer());const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,evidence.sha256);
await fs.writeFile(root+'/preview.mp4',bytes);
await fs.writeFile(root+'/item.json',JSON.stringify(item,null,2));
await fs.writeFile(root+'/verification.json',JSON.stringify({batchId:submission.id,evidence,sha256,keyword:{text:a[0].params.content,startTime:a[0].startTime,duration:a[0].duration}},null,2));
console.log('PASS preview/export keyword content and timing; decoded video/audio; downloaded hash matches registered evidence',submission.id);
