import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const root=process.env.PILOT_OUTPUT??'/Users/zhengwei/Downloads/composed-trial-ui-attachments-2026-09-28';
await fs.mkdir(root,{recursive:true});
const library=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const format=process.env.TRIAL_FORMAT??'landscape';
 const ready=async()=>{await page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false');};
 await page.goto(base+'/templates/effects/style-study-20260928-signal/try?revision=1&scale=0.8&centerX=0.5&centerY=0.62&format='+format);await ready();
 for(const id of ['style-pilot-20260923-caption','style-study-20260928-idea']){
  await page.getByRole('combobox',{name:'选择叠加样式',exact:true}).selectOption(id);
  const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert')&&r.request().postDataJSON().assetId===id);
  await page.getByRole('button',{name:'叠加到试映',exact:true}).click();assert.ok((await response).ok());await ready();
 }
 for(const control of ['叠加样式1独立位置与大小','叠加样式1独立字幕行宽']){
  const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert')&&r.request().postDataJSON().assetId==='style-study-20260928-idea');
  await page.getByRole('checkbox',{name:control,exact:true}).check();assert.ok((await response).ok());await ready();
 }
 for(const [label,value] of [['垂直中心','0.9'],['字幕行宽','0.84']]){
  const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert')&&r.request().postDataJSON().assetId==='style-study-20260928-idea');
  await page.getByRole('spinbutton',{name:'叠加样式1'+label,exact:true}).fill(value);assert.ok((await response).ok());await ready();
 }
 await page.getByRole('combobox',{name:'叠加样式2区域',exact:true}).selectOption('custom');await ready();
 for(const [label,value] of [['宽度','0.16'],['左侧','0.08'],['高度','0.28']]){
  const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert')&&r.request().postDataJSON().assetId==='style-study-20260928-idea');
  await page.getByRole('spinbutton',{name:'叠加样式2'+label,exact:true}).fill(value);assert.ok((await response).ok());await ready();
 }
 const styles=JSON.parse(new URL(page.url()).searchParams.get('styles'));
 await page.locator('.tw-trial-extra').nth(1).locator('summary').click();
 for(const [layer,gap] of [['decoration','0.0295'],['idea-disc','0.021']]){
  const id=styles[1].instanceId+'--'+layer;
  const control=page.getByRole('combobox',{name:id+'跟随文字',exact:true});
  const target=await control.locator('option').evaluateAll(options=>options.find(option=>option.value&&!option.value.startsWith('trial-'))?.value);
  assert.ok(target);
  for(const action of [()=>control.selectOption(target),()=>page.getByRole('combobox',{name:id+'依附方向',exact:true}).selectOption('left'),()=>page.getByRole('spinbutton',{name:id+'间距',exact:true}).fill(gap)]){
   const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert')&&r.request().postDataJSON().assetId==='style-study-20260928-idea');
   await action();const result=await response;assert.ok(result.ok(),await result.text());await ready();
  }
 }
 const link=page.url();await page.reload();await ready();
 assert.equal(await page.getByRole('spinbutton',{name:'叠加样式2宽度',exact:true}).inputValue(),'0.16');
 assert.equal(await page.getByRole('spinbutton',{name:'叠加样式1字幕行宽',exact:true}).inputValue(),'0.84');
 await page.getByRole('checkbox',{name:/NIOSH interview excerpt \/ 热爱研究，影响生活/}).click();
 if(process.env.TRIAL_FOCUS_X){
  await page.locator('summary').filter({hasText:'原视频构图'}).click();
  const preview=()=>page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/sample-preview')&&r.request().postDataJSON()?.sample?.focalPoint?.x===Number(process.env.TRIAL_FOCUS_X));
  await page.getByRole('checkbox',{name:/自定义焦点/}).check();
  const changed=preview();await page.getByRole('spinbutton',{name:/焦点 x$/}).fill(process.env.TRIAL_FOCUS_X);
  const response=await changed;assert.ok(response.ok(),await response.text());
 }
 await page.locator('summary').filter({hasText:/^内容重点/}).click();
 for(const summary of await page.getByText('精确范围与段落调整',{exact:true}).all())await summary.click();
 const starts=page.getByRole('combobox',{name:/第\d+段重点起词/});
 const reviewed=[[3,4],[14,16],[19,21]];
 for(let i=0;i<await starts.count();i++){
  const options=await starts.nth(i).locator('option').evaluateAll(options=>options.map(option=>option.value));
  const range=reviewed.find(([start])=>options.includes(String(start)));assert.ok(range,'Unexpected semantic boundary; review before export');
  await starts.nth(i).selectOption(String(range[0]));await page.getByRole('combobox',{name:`第${i+1}段重点止词`,exact:true}).selectOption(String(range[1]));
 }
 const submitted=page.waitForResponse(r=>r.url().endsWith('/production/author'),{timeout:120000});
 await page.getByRole('button',{name:'生成草稿预览 · 1 个成片',exact:true}).click();
 const response=await submitted;assert.ok(response.ok(),await response.text());
 const batch=await response.json(),manifest=response.request().postDataJSON();
 if(process.env.TRIAL_FOCUS_X)assert.equal(manifest.samples[0].focalPoint.x,Number(process.env.TRIAL_FOCUS_X));
 assert.equal(manifest.previewOnly,true);assert.equal(manifest.designs[0].template.elements.length,5);
 assert.equal(manifest.samples[0].transcriptRevision,1);assert.equal(manifest.samples[0].semanticUnits.length,3);
 await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
 await fs.writeFile(root+'/submission.json',JSON.stringify({batch,link},null,2));
 assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),library);
 console.log(JSON.stringify({batchId:batch.id,root,link,submittedElements:5}));
}finally{await browser.close();}
