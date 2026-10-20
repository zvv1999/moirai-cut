import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const records=[];
try{
 for(const [inputId,language] of [['input-80f248b968faad87d3460b76ec8badd1','English'],['input-941335914fe590272ed1f8cef9af917a','Chinese']]){
  const response=await fetch(base+'/api/footage/templates/inputs/'+inputId);assert.ok(response.ok);const input=await response.json();
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/templates/effects/style-pilot-20260923-caption/try?revision=3');
  const ready=page.waitForResponse(r=>r.url().endsWith('/sample-preview')&&r.ok()&&r.request().postDataJSON()?.sample?.inputId===inputId);
  await page.locator('label.tp-choice').filter({hasText:input.input.name}).getByRole('checkbox').click();await ready;
  await page.locator('summary').filter({hasText:/^字幕分段/}).click();
  const nextText=()=>page.waitForResponse(r=>r.url().endsWith('/plan')&&r.ok()&&r.request().postDataJSON()?.captionSpans?.length>0);
  const initial=nextText();await page.getByRole('combobox',{name:'字幕分段方式',exact:true}).selectOption('custom');
  const captions=(await(await initial).json()).captions;
  async function textMatches(expected){await page.waitForFunction(text=>document.querySelector('[aria-label="第1句字幕正文"]')?.textContent===text,expected);}
  await textMatches(captions[0].text);
  if(language==='English')assert.ok(captions[0].text.includes(' '));
  const span=captions[0].wordSpan;assert.ok(span.endWord-span.startWord>1);
  await page.getByRole('combobox',{name:'第1句拆分位置',exact:true}).selectOption(String(span.startWord+1));
  const splitText=nextText();await page.getByRole('button',{name:'拆分第1句',exact:true}).click();const split=(await(await splitText).json()).captions;await textMatches(split[0].text);assert.equal(split.length,captions.length+1);
  const mergedText=nextText();await page.getByRole('button',{name:'合并第1句与下一句',exact:true}).click();const merged=(await(await mergedText).json()).captions;await textMatches(merged[0].text);assert.deepEqual(merged.map(c=>c.text),captions.map(c=>c.text));
  await page.getByRole('button',{name:'保存试映内容',exact:true}).click();await page.reload();
  const restoredText=nextText();await page.getByRole('button',{name:'恢复试映内容',exact:true}).click();await restoredText;
  await page.locator('summary').filter({hasText:/^字幕分段/}).click();await textMatches(captions[0].text);
  if(language==='English'){
   await page.route('**/api/footage/templates/plan',async route=>{
    if(route.request().postDataJSON()?.captionSpans?.length){await route.fulfill({status:503,json:{error:'read-text-test-unavailable'}});return;}
    await route.continue();
   });
   await page.getByRole('combobox',{name:'第1句拆分位置',exact:true}).selectOption(String(span.startWord+1));
   await page.getByRole('button',{name:'拆分第1句',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'字幕正文读取失败'}).waitFor();
   assert.equal(await page.getByLabel('第1句字幕正文',{exact:true}).textContent(),'正文暂不可用');
   assert.equal(await page.getByRole('button',{name:/^拆分第\d+句$/}).count(),captions.length+1);
   await page.unroute('**/api/footage/templates/plan');
   const recovery=nextText();await page.getByRole('button',{name:'合并第1句与下一句',exact:true}).click();await recovery;await textMatches(captions[0].text);
  }
  const panel=page.locator('details.tp-sample-content').filter({has:page.locator('summary').filter({hasText:/^字幕分段/})});
  await panel.screenshot({path:`/tmp/caption-panel-${language}.png`});assert.deepEqual(errors,[]);
  records.push({inputId,language,texts:captions.map(c=>c.text),passed:true});await page.close();
 }
 await fs.writeFile('/tmp/caption-panel-verification.json',JSON.stringify(records,null,2));console.log('PASS English/Chinese canonical text, split, merge and saved content restoration');
}finally{await browser.close();}
