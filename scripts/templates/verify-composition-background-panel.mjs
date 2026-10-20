import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';const read=async()=>await(await fetch(base+'/api/footage/templates')).json();const before=await read();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(base+'/templates/compositions?template=composition-study-guidance-20260929');await p.getByRole('textbox',{name:'模板名称',exact:true}).waitFor();await p.getByRole('navigation',{name:'工作视图'}).getByRole('button',{name:'编辑模板',exact:true}).click();await p.getByRole('button',{name:'编辑所选元素',exact:true}).click();const picker=p.getByRole('combobox',{name:'当前模板元素',exact:true});await picker.selectOption('headline');
const group=p.getByRole('group',{name:'文字底板',exact:true});await group.getByRole('checkbox',{name:'启用文字底板',exact:true}).check();const alpha=group.getByRole('slider',{name:'底板不透明度',exact:true});await alpha.fill('0.35');await group.getByLabel('底板横向留白',{exact:true}).fill('18');await group.getByLabel('底板纵向留白',{exact:true}).fill('9');
await picker.selectOption('page-heading');await picker.selectOption('headline');assert.equal(await alpha.inputValue(),'0.35');assert.equal(await group.getByLabel('底板横向留白',{exact:true}).inputValue(),'18');assert.equal(await group.getByLabel('底板纵向留白',{exact:true}).inputValue(),'9');
await group.getByRole('checkbox',{name:'启用文字底板',exact:true}).uncheck();await group.getByRole('checkbox',{name:'启用文字底板',exact:true}).check();assert.equal(await alpha.inputValue(),'0.35');
await group.scrollIntoViewIfNeeded();await p.screenshot({path:'/tmp/composition-background-desktop.png'});await p.setViewportSize({width:390,height:844});await group.scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'/tmp/composition-background-mobile.png'});
assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);console.log('PASS composition controls, layer-switch draft retention, toggle retention and mobile; library unchanged');
}finally{await browser.close();}
