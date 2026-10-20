import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/caption-region-ui-2026-09-28';
const inputId='input-80f248b968faad87d3460b76ec8badd1';
const library=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates/effects/style-pilot-20260923-caption/try?revision=3&scale=0.65&centerX=0.5&centerY=0.9&captionWidth=0.84');
 await page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false');
 const framed=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/application')&&r.request().postDataJSON()?.videoRegion?.height===0.8);
 await page.getByRole('checkbox',{name:'自定原视频区域',exact:true}).check();assert.ok((await framed).ok());
 await Promise.all([
 page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample?.inputId===inputId),
 page.locator('label.tp-choice').filter({hasText:'NASA Alex · 深色服装与太阳背景'}).getByRole('checkbox').click(),
 ]).catch(async error=>{console.error(await page.locator('[role="alert"]').allTextContents());throw error;});
 await page.locator('summary').filter({hasText:'原视频构图'}).click();
 await page.getByRole('checkbox',{name:/自定义焦点/}).check();
 const focused=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample?.focalPoint?.y===0.4);
 await page.getByRole('spinbutton',{name:/焦点 y$/}).fill('0.4');
 let previewResponse=await focused;
 if(process.env.CAPTION_CHARACTERS){
  await page.locator('summary').filter({hasText:/^字幕分段/}).click();
  await page.getByText('重新生成分段',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'每句字数上限',exact:true}).fill(process.env.CAPTION_CHARACTERS);
  await page.getByRole('spinbutton',{name:'每句时长上限（秒）',exact:true}).fill('5');
  const regenerated=page.waitForResponse(r=>r.url().endsWith('/plan')&&r.request().postDataJSON()?.captionPolicy?.maxCharacters===Number(process.env.CAPTION_CHARACTERS));
  const updated=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample?.captionSpans?.length>0);
  await page.getByRole('button',{name:'按设置重新分段',exact:true}).click();
  const planResponse=await regenerated;assert.ok(planResponse.ok(),await planResponse.text());
  const plan=await planResponse.json();
  previewResponse=await updated;
  assert.deepEqual(previewResponse.request().postDataJSON().sample.captionSpans,plan.captions.map(c=>c.wordSpan));
  assert.equal(previewResponse.request().postDataJSON().template.segmentation.maxCharacters,16,'Segmentation settings must not mutate the style application');
  assert.equal(previewResponse.request().postDataJSON().sample.captionPolicy.maxCharacters,Number(process.env.CAPTION_CHARACTERS));
  await fs.writeFile(root+'/regenerated-plan.json',JSON.stringify(plan,null,2));
 }
 const preview=await previewResponse.json(),previewRequest=previewResponse.request().postDataJSON();
 assert.deepEqual(previewRequest.template.layouts[0].videoRegion,{x:0,y:0,width:1,height:0.8});
 await page.waitForFunction(()=>document.querySelector('section[aria-label="效果预览"]')?.getAttribute('aria-busy')==='false'&&document.querySelector('.tw-effect-preview')?.textContent.includes('14.0 秒'));
 await page.getByRole('slider',{name:'效果预览进度',exact:true}).fill('10.9');
 await page.waitForFunction(()=>{const stage=document.querySelector('.tw-effect-stage'),canvas=stage?.querySelector('canvas');return canvas&&canvas.dataset.renderGeneration===stage.dataset.previewGeneration&&canvas.dataset.renderTime==='10.9'&&canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4!==3&&v>80);});
 await page.getByRole('region',{name:'效果预览',exact:true}).screenshot({path:root+'/page-preview.png'});
 if(!process.env.CAPTION_PREVIEW_ONLY){
 const submitted=page.waitForResponse(r=>r.url().endsWith('/production/author'),{timeout:120000});
 await page.getByRole('button',{name:'生成草稿预览 · 1 个成片',exact:true}).click();
 const result=await submitted;assert.ok(result.ok(),await result.text());
 const manifest=result.request().postDataJSON(),batch=await result.json();
 assert.equal(manifest.previewOnly,true);assert.equal(manifest.samples.length,1);
 assert.deepEqual(manifest.designs[0].template,previewRequest.template);
 assert.deepEqual(manifest.samples[0].captionSpans,previewRequest.sample.captionSpans);
 assert.deepEqual(manifest.samples[0].captionPolicy,previewRequest.sample.captionPolicy);
 assert.deepEqual(manifest.samples[0].focalPoint,{x:0.5,y:0.4});assert.equal(manifest.samples[0].inputId,inputId);
 assert.equal(manifest.samples[0].transcriptRevision,1);
 await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));await fs.writeFile(root+'/submission.json',JSON.stringify(batch,null,2));
 await fs.writeFile(root+'/page-preview.json',JSON.stringify({preview,request:previewRequest,link:page.url()},null,2));
 assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),library);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({batchId:batch.id,root,passed:'real UI preview and production use the same template, source region and focal point; library unchanged'}));
  }else{
 if(process.env.CAPTION_CHARACTERS){
  const savedSpans=previewRequest.sample.captionSpans;
  await page.getByRole('button',{name:'保存试映内容',exact:true}).click();
  await page.reload();
  const restored=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample?.captionSpans?.length>0);
  await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();
  assert.deepEqual((await restored).request().postDataJSON().sample.captionSpans,savedSpans);
  await page.locator('summary').filter({hasText:/^字幕分段/}).click();
  await page.getByText('重新生成分段',{exact:true}).click();
  assert.equal(await page.getByRole('spinbutton',{name:'每句字数上限',exact:true}).inputValue(),process.env.CAPTION_CHARACTERS);
  await page.getByRole('spinbutton',{name:'每句字数上限',exact:true}).fill('61');
  const rejected=page.waitForResponse(r=>r.url().endsWith('/plan')&&r.request().postDataJSON()?.captionPolicy?.maxCharacters===61);
  await page.getByRole('button',{name:'按设置重新分段',exact:true}).click();assert.equal((await rejected).ok(),false);
  assert.equal(await page.locator('.tp-sample-content').filter({has:page.locator('summary').filter({hasText:/^字幕分段/})}).locator('fieldset').count(),savedSpans.length);
 }
 assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),library);assert.deepEqual(errors,[]);console.log('PASS loaded real preview; saved spans and segmentation policy restore together; invalid settings preserve spans; no production submitted');
 }
}finally{await browser.close();}
