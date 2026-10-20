import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000';
const assetId=process.env.STYLE_ASSET_ID??'style-study-20260928-signal';
const read=async()=>{const r=await fetch(base+'/api/footage/templates/dynamic-assets');assert.ok(r.ok);return r.json();};
const before=await read();
const asset=before.assets.find(a=>a.id===assetId);assert.ok(asset);
const textLayers=asset.layers.filter(l=>l.content.element?.features.representation==='text').map(l=>l.content.element);
assert.ok(textLayers.length>0);
for(const layer of textLayers)assert.equal(asset.styles.find(s=>s.id===layer.styleId)?.maxLines,2);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(base+'/templates?effect='+encodeURIComponent(assetId));
 const lines=page.getByRole('spinbutton',{name:'最多行数',exact:true});await lines.waitFor();
 assert.equal(await lines.inputValue(),'2');
 for(const layer of textLayers){
  await page.getByRole('button',{name:layer.description+' · 文字',exact:true}).click();
  assert.equal(await lines.inputValue(),'2');
 }
 await page.reload();await lines.waitFor();assert.equal(await lines.inputValue(),'2');
 const application=page.waitForResponse(r=>r.url().endsWith('/dynamic-assets/application')&&r.request().postDataJSON()?.assetRevision===asset.revision&&r.request().postDataJSON()?.assetId===assetId);
 await page.getByRole('link',{name:'用声音试效果',exact:true}).click();
 const response=await application;assert.ok(response.ok(),await response.text());
 const applied=(await response.json()).template;
 for(const layer of textLayers)assert.equal(applied.styles.find(s=>s.id===layer.styleId)?.maxLines,2);
 await page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false');
 assert.deepEqual(await read(),before);
 console.log(JSON.stringify({assetId,revision:asset.revision,textLayers:textLayers.length,inspector:true,reloaded:true,trial:true,libraryUnchanged:true}));
}finally{await browser.close();}
