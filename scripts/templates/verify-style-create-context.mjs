import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/style-create-context-20260929';await fs.mkdir(root,{recursive:true});
const read=async()=>await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();const before=await read();
const decoration=before.assets.find(a=>a.purposes?.length===1&&a.purposes[0]==='decoration'&&!before.library.some(l=>l.assetId===a.id&&l.archived));assert.ok(decoration);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect=style-caption-compact-candidate-20260929');
 const purpose=page.getByRole('combobox',{name:'新建样式用途',exact:true});await page.getByRole('button',{name:'新建动态字幕',exact:true}).waitFor();assert.equal(await purpose.inputValue(),'caption');
 await purpose.selectOption('keyword');await page.getByRole('button',{name:'新建重点词',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'当前样式图层',exact:true}).selectOption('headline');
 await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'外观',exact:true}).click();
 await page.getByRole('spinbutton',{name:'字号',exact:true}).fill('45.8');assert.equal(await purpose.inputValue(),'keyword');assert.ok(await purpose.isDisabled());
 await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();assert.equal(await purpose.inputValue(),'keyword');
 await page.locator('.tw-style-open').filter({hasText:decoration.name}).click();await page.getByRole('button',{name:'新建装饰素材',exact:true}).waitFor();assert.equal(await purpose.inputValue(),'decoration');
 await page.getByRole('group',{name:'筛选样式用途',exact:true}).getByRole('button',{name:'动态字幕',exact:true}).click();assert.equal(await purpose.inputValue(),'caption');
 await page.getByRole('group',{name:'筛选样式用途',exact:true}).getByRole('button',{name:'全部',exact:true}).click();assert.equal(await purpose.inputValue(),'caption');
 await page.reload();await page.getByRole('button',{name:'新建装饰素材',exact:true}).waitFor();assert.equal(await purpose.inputValue(),'decoration');
 await page.getByText('正在更新效果…',{exact:true}).waitFor({state:'hidden',timeout:60000});await page.screenshot({path:root+'/desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await purpose.scrollIntoViewIfNeeded();await page.screenshot({path:root+'/mobile.png'});
 assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/verification.json',JSON.stringify({passed:true,deepLinkCaption:true,explicitChoiceSurvivesEditAndUndo:true,selectionDecoration:true,categoryCaption:true,allPreservesChoice:true,reloadUsesSelectedPurpose:true,mobileNoOverflow:true,libraryUnchanged:true,pageErrors:errors},null,2));
 console.log('Deep link, selection, explicit choice, category, reload and mobile verified; library unchanged.');
}finally{await browser.close()}
