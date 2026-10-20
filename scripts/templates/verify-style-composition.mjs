import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const read=async path=>{const r=await fetch(base+'/api/footage/templates'+path);assert.ok(r.ok);return r.json();};
const before=await read(''),assetsBefore=await read('/dynamic-assets');
const template=before.templates[0];assert.ok(template);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(base+'/templates/compositions?template='+encodeURIComponent(template.id));
await p.getByRole('textbox',{name:'模板名称',exact:true}).waitFor();
await p.getByRole('navigation',{name:'工作视图'}).getByRole('button',{name:'添加素材',exact:true}).click();
const field=p.getByRole('textbox',{name:'效果名称',exact:true});await field.waitFor();const original=await field.inputValue();await field.fill(original+' test unsaved');
await p.getByRole('button',{name:'保存修改',exact:true}).waitFor();
assert.equal(await p.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
await p.getByRole('navigation',{name:'工作视图'}).getByRole('button',{name:'编辑模板',exact:true}).click();
await p.getByText('请先在样式素材中保存或还原修改，并等待当前操作完成。',{exact:true}).waitFor();assert.equal(await field.inputValue(),original+' test unsaved');
await p.getByRole('link',{name:'样式素材',exact:true}).click();assert.ok(p.url().includes('/compositions'));
await p.getByRole('button',{name:'撤销未保存修改',exact:true}).click();await p.waitForFunction(v=>document.querySelector('input[aria-label="效果名称"]')?.value===v,original);
const response=p.waitForResponse(r=>r.url().endsWith('/dynamic-assets/insert'));
await p.getByRole('button',{name:'插入当前模板',exact:true}).click();const r=await response;assert.ok(r.ok(),await r.text());const inserted=await r.json();
assert.ok(inserted.template.elements.length>template.elements.length);
const selectedId=Object.values(inserted.instance.layerMap)[0];const element=inserted.template.elements.find(e=>e.id===selectedId);assert.ok(element);
const elementField=p.getByRole('textbox',{name:'元素名称',exact:true});await elementField.waitFor();assert.equal(await elementField.inputValue(),element.description);
await p.getByRole('button',{name:/^保存\s*\*$/}).waitFor();assert.equal(await p.getByRole('button',{name:/^保存\s*\*$/}).isEnabled(),true);
assert.deepEqual(await read(''),before);assert.deepEqual(await read('/dynamic-assets'),assetsBefore);assert.deepEqual(errors,[]);
console.log('PASS unsaved style blocks panel navigation, page links and parent save; reset releases; native insert opens selected layer; both libraries unchanged');
}finally{await browser.close();}
