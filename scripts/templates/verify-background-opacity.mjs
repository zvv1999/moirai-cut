import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',before=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect=style-study-20260928-cyan-impact');await page.getByRole('combobox',{name:'当前样式图层',exact:true}).waitFor();await page.getByRole('combobox',{name:'当前样式图层',exact:true}).selectOption('headline');
 await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'外观',exact:true}).click();
 await page.getByRole('checkbox',{name:'文字底色',exact:true}).check();
 const slider=page.getByRole('slider',{name:'底板不透明度',exact:true});await slider.waitFor();assert.equal(await slider.inputValue(),'1');
 const response=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/preview')&&r.request().postDataJSON()?.definition?.styles?.some(s=>s.backgroundOpacity===.4));await slider.fill('0.4');const res=await response;assert.ok(res.ok());const data=await res.json();
 const elements=data.tracks.overlay.flatMap(t=>t.elements);const headline=elements.find(e=>e.params?.['template.elementId']==='headline');assert.equal(headline.params['background.opacity'],.4);assert.equal(headline.params.opacity,1);
 await page.waitForFunction(()=>{const s=document.querySelector('.tw-effect-stage'),c=s?.querySelector('canvas');return c&&c.dataset.renderGeneration===s.dataset.previewGeneration;});
 await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'动效',exact:true}).click();await page.getByRole('navigation',{name:'属性快捷定位',exact:true}).getByRole('button',{name:'外观',exact:true}).click();assert.equal(await slider.inputValue(),'0.4');
 await page.screenshot({path:'/tmp/background-opacity-desktop.png'});await page.setViewportSize({width:390,height:844});await slider.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/background-opacity-mobile.png'});
 await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:'文字底色',exact:true}).isChecked(),false);
 assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),before);assert.deepEqual(errors,[]);
 console.log('PASS native preview background.opacity .4 / element opacity 1; draft retention, undo, responsive control; saved library unchanged');
}finally{await browser.close();}
