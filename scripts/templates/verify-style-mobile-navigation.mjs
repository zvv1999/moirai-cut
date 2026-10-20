import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(r.ok);return r.json();};
const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:390,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/templates?effect=style-study-20260928-cyan-impact');
 const chosen=page.locator('.tw-style-open').filter({hasText:'口播强调 · 青色弹字'});
 await chosen.click();
 await page.waitForFunction(()=>{const c=document.querySelector('canvas[aria-label="效果实时画面"]');return c&&getComputedStyle(c).visibility!=='hidden';},{},{timeout:60000});
 const canvas=page.getByLabel('效果实时画面',{exact:true});
 const bounds=await canvas.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=900,'Full canvas visible after mobile selection');
 await page.screenshot({path:'/tmp/style-mobile-navigation.png'});
 await page.getByRole('button',{name:'返回样式列表',exact:false}).click();
 const list=await page.getByRole('navigation',{name:'效果素材列表'}).boundingBox();assert.ok(list.y>=0&&list.y<50,'Back returns to library');
 await page.getByLabel('效果名称',{exact:true}).fill('未保存测试');
 await chosen.click();
 await page.getByRole('alert').filter({hasText:'请先保存当前效果的修改'}).waitFor();
 assert.equal(await page.getByLabel('效果名称',{exact:true}).inputValue(),'未保存测试');
 await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();
 await page.setViewportSize({width:1280,height:900});
 assert.equal(await page.getByRole('button',{name:'返回样式列表',exact:false}).isVisible(),false);
 assert.deepEqual(errors,[]);assert.deepEqual(await read(),before);
 console.log('mobile selection reveals full canvas; back returns to list; dirty edits protected; desktop back hidden; library unchanged');
} finally {await browser.close();}
