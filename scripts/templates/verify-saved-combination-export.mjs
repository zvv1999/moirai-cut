import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:3000',root='/Users/zhengwei/Downloads/saved-combination-export-2026-09-28';
await fs.mkdir(root,{recursive:true});
const saved=JSON.parse(await fs.readFile('/Users/zhengwei/Downloads/style-combination-save-2026-09-28/receipt.json','utf8'));
const before=await(await fetch(base+'/api/footage/templates/dynamic-assets')).json();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 await page.goto(`${base}/templates/effects/${saved.assetId}/try?revision=${saved.revision}`);
 await page.waitForFunction(()=>document.querySelector('.tw-trial-visual')?.getAttribute('aria-busy')==='false');
 await page.getByRole('checkbox',{name:/NIOSH interview excerpt \/ 热爱研究，影响生活/}).click();
 await page.locator('summary').filter({hasText:/^内容重点/}).click();
 for(const summary of await page.getByText('精确范围与段落调整',{exact:true}).all())await summary.click();
 const starts=page.getByRole('combobox',{name:/第\d+段重点起词/});
 for(const [i,[start,end]] of [[3,4],[14,16],[19,21]].entries()){
  await starts.nth(i).selectOption(String(start));await page.getByRole('combobox',{name:`第${i+1}段重点止词`,exact:true}).selectOption(String(end));
 }
 const submitted=page.waitForResponse(r=>r.url().endsWith('/production/author'),{timeout:120000});
 await page.getByRole('button',{name:'生成草稿预览 · 1 个成片',exact:true}).click();
 const response=await submitted;assert.ok(response.ok(),await response.text());
 const manifest=response.request().postDataJSON(),batch=await response.json();
 assert.equal(manifest.previewOnly,true);assert.equal(manifest.designs[0].template.elements.length,5);
 assert.equal(manifest.designs[0].template.composition.spatialRelations.length,3);
 assert.equal(manifest.samples[0].transcriptRevision,1);
 await fs.writeFile(root+'/designs.json',JSON.stringify(manifest,null,2));
 await fs.writeFile(root+'/submission.json',JSON.stringify({batch,assetId:saved.assetId},null,2));
 assert.deepEqual(await(await fetch(base+'/api/footage/templates/dynamic-assets')).json(),before);
 console.log(JSON.stringify({batchId:batch.id,root}));
}finally{await browser.close();}
