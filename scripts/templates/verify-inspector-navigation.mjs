import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',before=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/templates?effect=style-pilot-20260923-offset');const nav=page.getByRole('navigation',{name:'属性快捷定位',exact:true});await nav.waitFor();
for(const [name,section] of [['外观','appearance'],['布局','layout'],['动效','motion'],['应用规则','rules'],['图层','layers']]){
 await nav.getByRole('button',{name,exact:true}).click();const target=page.locator(`[data-style-section="${section}"]`);
 assert.equal(await nav.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true');
 for(const other of ['layers','appearance','layout','motion','rules'].filter(v=>v!==section))assert.equal(await page.locator(`[data-style-section="${other}"]`).isVisible(),false,other+' hidden while '+section+' active');
 assert.ok(await target.evaluate(el=>{const p=el.closest('.tw-effect-inspector'),r=el.getBoundingClientRect(),b=p.getBoundingClientRect(),n=p.querySelector('.tw-inspector-navigation').getBoundingClientRect();return r.top>=n.bottom-2&&r.top<b.bottom;}),name+' target visible below sticky navigation');
 if(section==='rules')assert.equal(await target.getAttribute('open'),'');
}
await nav.getByRole('button',{name:'外观',exact:true}).click();const font=page.getByLabel('字体名称',{exact:true});const old=await font.inputValue();await font.fill(old+' ');assert.equal(await page.getByRole('button',{name:'← 返回用途选择',exact:true}).isDisabled(),true);await nav.getByRole('button',{name:'动效',exact:true}).click();await nav.getByRole('button',{name:'外观',exact:true}).click();assert.equal(await font.inputValue(),old+' ');await page.getByRole('button',{name:'撤销未保存修改',exact:true}).click();
const layerPicker=page.getByRole('combobox',{name:'当前样式图层',exact:true});const originalLayer=await layerPicker.inputValue();
await layerPicker.selectOption('root');await page.waitForFunction(()=>document.querySelector('.tw-inspector-navigation button[aria-pressed="true"]')?.textContent==='布局');
assert.equal(await nav.getByRole('button',{name:'外观',exact:true}).isDisabled(),true);
assert.equal(await nav.getByRole('button',{name:'动效',exact:true}).isDisabled(),true);
await layerPicker.selectOption(originalLayer);await nav.getByRole('button',{name:'外观',exact:true}).click();
await page.waitForFunction(()=>{const stage=document.querySelector('.tw-effect-stage'),canvas=stage?.querySelector('canvas');return canvas&&canvas.dataset.renderGeneration===stage.dataset.previewGeneration;});
await page.screenshot({path:'/tmp/inspector-navigation-desktop.png'});
await page.setViewportSize({width:390,height:844});await nav.getByRole('button',{name:'动效',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const m=await page.locator('[data-style-section="motion"]').boundingBox();assert.ok(m.y>=0&&m.y<844);await page.screenshot({path:'/tmp/inspector-navigation-mobile.png'});assert.deepEqual(errors,[]);assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),before);console.log('PASS all sections reachable, rules open, edits preserved, return protection and mobile navigation; library unchanged');
}finally{await browser.close();}
