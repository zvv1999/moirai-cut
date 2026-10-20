import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const root='/Users/zhengwei/Downloads/style-preview-examples-20260929',base='http://127.0.0.1:3000',id='style-caption-compact-candidate-20260929';
await fs.mkdir(root,{recursive:true});
const read=async()=>(await(await fetch(base+'/api/footage/templates/dynamic-assets/'+id)).json()).definition;
const before=await read();const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect='+id);
 const preview=page.getByRole('region',{name:'效果预览',exact:true});
 const group=page.getByRole('group',{name:'快速试文案',exact:true});await group.waitFor();
 const picker=page.getByRole('combobox',{name:'当前样式图层',exact:true});await picker.selectOption('headline');
 await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'外观',exact:true}).click();
 const size=page.getByRole('spinbutton',{name:'字号',exact:true});await size.fill('45.8');
 await page.getByText('正在更新效果…',{exact:true}).waitFor({state:'hidden',timeout:60000});
 await preview.locator('summary').filter({hasText:'示例文案'}).click();
 await preview.getByRole('button',{name:'预览同排',exact:true}).click();
 await preview.getByRole('button',{name:'清除预览同排',exact:true}).waitFor();
 const records=[];
 for(const label of ['长中文','长英文','短句']){
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/preview')&&r.request().method()==='POST'&&r.request().postDataJSON()?.example?.text===({长中文:'每天留一点时间，把真正重要的事情讲清楚，让每一次表达都更有力量。',长英文:'Here are the things you need to do to move forward with confidence.',短句:'让重点表达更清楚'})[label]);
  await group.getByRole('button',{name:label,exact:true}).click();
  const response=await responsePromise;assert.ok(response.ok());const request=response.request().postDataJSON();
  assert.equal(request.definition.styles.find(s=>s.id==='headline-style').fontSize,45.8);
  assert.deepEqual(request.example.layoutPhrases,[]);assert.equal(request.example.keywordOccurrence,0);
  await page.getByText('正在更新效果…',{exact:true}).waitFor({state:'hidden',timeout:60000});
  assert.equal(await group.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await size.inputValue(),'45.8');
  assert.deepEqual((await page.getByRole('alert').allTextContents()).filter(text=>text.trim()),[]);assert.equal(await preview.getByRole('button',{name:'清除预览同排',exact:true}).count(),0);
  await preview.locator('summary').filter({hasText:'示例文案'}).evaluate(el=>{el.parentElement.open=false;});await page.screenshot({path:root+'/'+label+'.png'});
  records.push({label,example:request.example,status:response.status()});
 }
 await page.setViewportSize({width:390,height:844});await group.scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/mobile.png'});
 await page.reload();await picker.selectOption('headline');await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'外观',exact:true}).click();assert.equal(await size.inputValue(),'44.8');
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,records,draftPreserved:true,reloadRestoresSaved:true,libraryUnchanged:true,mobileNoOverflow:true,pageErrors:errors},null,2));
 console.log('Three examples render with draft preserved; saved style unchanged; mobile verified.');
}finally{await browser.close()}
