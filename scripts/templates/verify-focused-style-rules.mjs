import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const url='http://127.0.0.1:3000',before=await(await fetch(url+'/api/footage/templates/dynamic-assets')).json();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url+'/templates?effect=style-pilot-20260923-offset');
const picker=page.getByRole('combobox',{name:'当前样式图层',exact:true}),nav=page.getByRole('navigation',{name:'属性快捷定位',exact:true});await picker.waitFor();
const ids=await picker.locator('option').evaluateAll(es=>es.filter(e=>!e.textContent.includes('（容器）')).map(e=>e.value));assert.ok(ids.length>=2);
await picker.selectOption(ids[0]);await nav.getByRole('button',{name:'应用规则',exact:true}).click();
const anchor=page.getByRole('combobox',{name:'出现时机',exact:true});assert.equal(await anchor.count(),1);const old=await anchor.inputValue(),next=old==='keyword_start'?'semantic_start':'keyword_start';await anchor.selectOption(next);
await picker.selectOption(ids[1]);assert.equal(await anchor.count(),1);await picker.selectOption(ids[0]);assert.equal(await anchor.inputValue(),next);
await picker.selectOption('root');await nav.getByRole('button',{name:'应用规则',exact:true}).click();assert.equal(await anchor.count(),0);await page.getByText('当前选择的是容器。位置与尺寸请在“布局”中编辑；选择文字或素材图层后，可配置它的出现时机。',{exact:true}).waitFor();
await nav.getByRole('button',{name:'布局',exact:true}).click();await page.getByLabel('横向位置 %',{exact:true}).waitFor();
await picker.selectOption(ids[0]);await nav.getByRole('button',{name:'应用规则',exact:true}).click();await page.screenshot({path:'/tmp/focused-rules-desktop.png'});
await page.setViewportSize({width:390,height:844});await nav.getByRole('button',{name:'应用规则',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/focused-rules-mobile.png'});
await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();await picker.selectOption(ids[0]);assert.equal(await anchor.inputValue(),old);
assert.deepEqual(errors,[]);assert.deepEqual(await(await fetch(url+'/api/footage/templates/dynamic-assets')).json(),before);console.log('PASS one active layer timing form, independent draft retention, container layout reachable, undo, mobile overflow, library unchanged');
}finally{await browser.close();}
