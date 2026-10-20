import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='/Users/zhengwei/Downloads/study-guidance-published-2026-09-29',base='http://127.0.0.1:3000';
const read=async path=>{const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok);return r.json();};
const manifest=JSON.parse(await fs.readFile(root+'/designs.json','utf8')),sub=JSON.parse(await fs.readFile(root+'/submission.json','utf8'));
const batch=await read('/production/'+sub.id);if(batch.renderJob.status!=='succeeded'){console.log(batch.renderJob);process.exit(2);}
const item=await read('/production/'+sub.id+'/items/0'),library=await read(''),saved=library.templates.find(t=>t.id===manifest.designs[0].template.id),previews=await read('/previews'),preview=previews.previews[saved.id];
assert.equal(saved.revision,3);assert.deepEqual({...saved,revision:2},manifest.designs[0].template);assert.equal(preview.revision,saved.revision);assert.equal(preview.batchId,sub.id);assert.equal(preview.qualityReview,null);assert.equal(item.aestheticQualityVerified,false);
const before=JSON.parse(await fs.readFile(root+'/library-before.json','utf8'));for(const t of before.templates.filter(t=>t.id!==saved.id))assert.deepEqual(library.templates.find(x=>x.id===t.id),t);
const old=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/reading-composition-refined-2026-09-29/item.json','utf8'));
const cues=f=>f.compilation.document.scenes.flatMap(s=>s.tracks.overlay.flatMap(t=>t.elements.map(e=>[e.params?.['template.elementId'],e.params?.content??null,e.startTime,e.duration])));
for(const [i,f] of item.output.fixtures.entries()){assert.deepEqual(cues(f),cues(old.output.fixtures[i]));assert.deepEqual(f.request.input.words,old.output.fixtures[i].request.input.words);}
for(const p of item.previews){assert.ok(p.decodeVerified&&p.audioQuality.validated);assert.equal(createHash('sha256').update(await fs.readFile(p.path)).digest('hex'),p.sha256);}
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/templates/compositions?template='+saved.id);
const video=page.getByLabel('模板成片播放',{exact:true});await video.waitFor();assert.equal(await video.getAttribute('src'),preview.mediaUrl);await page.getByText('已保存版本 v3 · 样例素材 · 待质量审片',{exact:true}).waitFor();
await video.evaluate(async v=>{v.muted=true;await v.play();});await page.waitForFunction(()=>document.querySelector('video[aria-label="模板成片播放"]')?.currentTime>.15);await video.evaluate(v=>v.pause());await page.screenshot({path:root+'/desktop-preview.png'});
await page.setViewportSize({width:390,height:844});await video.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile-preview.png'});
assert.deepEqual(errors,[]);assert.deepEqual(await read(''),library);await fs.writeFile(root+'/publication-verification.json',JSON.stringify({templateId:saved.id,revision:saved.revision,batchId:sub.id,exports:item.previews.length,currentVersionPreview:true,unchangedContentAndTiming:true,otherTemplatesUnchanged:true,mutedBrowserPlayback:true,mobileNoOverflow:true,pageErrors:errors,listened:false,score:null},null,2));console.log('PASS current library preview, three exports, timing preservation and muted UI playback');
}finally{await browser.close();}
