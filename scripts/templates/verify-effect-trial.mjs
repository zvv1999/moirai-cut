import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base=process.env.WORKBENCH_URL??"http://127.0.0.1:3000";
const read=async path=>{const response=await fetch(`${base}/api/footage/templates${path}`);assert.ok(response.ok);return response.json();};
const asset=await read(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`);
const input=await read(`/inputs/${process.env.TEST_INPUT_ID}`);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(`${base}/templates`);
  await page.getByRole("button",{name:`${asset.definition.name} v${asset.definition.revision} · ${asset.definition.layers.length} 层`,exact:true}).click();
  await page.getByRole("link",{name:"试用到视频",exact:true}).click();
  await page.getByRole("region",{name:"选择素材与内容",exact:true}).waitFor();
  assert.ok(page.url().includes(`revision=${asset.definition.revision}`));
  const prepared=page.waitForResponse(response=>response.url().endsWith("/dynamic-assets/application"));
  await page.getByRole("combobox",{name:"试映效果区域",exact:true}).selectOption("lower");
  const response=await prepared;
  assert.ok(response.ok(),await response.text());
  let application=await response.json();
  assert.equal(application.assetRevision,asset.definition.revision);
  assert.equal(application.template.elements.length,asset.projection.elements.length);
  await page.getByRole("checkbox",{name:new RegExp(input.input.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))}).click();
  const submit=page.getByRole("button",{name:"生成草稿预览 · 1 个成片",exact:true});
  await submit.waitFor();
  for(const area of ["upper","lower"]) {
    const changed=page.waitForResponse(response=>response.url().endsWith("/dynamic-assets/application"));
    await page.getByRole("combobox",{name:"试映效果区域",exact:true}).selectOption(area);
    assert.ok((await changed).ok());
    await submit.waitFor();
    assert.equal(await page.getByRole("checkbox",{name:new RegExp(input.input.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))}).isChecked(),true);
  }
  if(process.env.INDEPENDENT_TRIAL==="1") {
    let prepared=page.waitForResponse(response=>response.url().endsWith("/dynamic-assets/application"));
    await page.getByRole("checkbox",{name:"独立位置与大小",exact:true}).check();
    let response=await prepared;
    assert.ok(response.ok(),await response.text());
    const centered=await response.json();
    prepared=page.waitForResponse(response=>response.url().endsWith("/dynamic-assets/application"));
    await page.getByRole("slider",{name:"垂直中心",exact:true}).fill("0.82");
    response=await prepared;
    assert.ok(response.ok(),await response.text());
    const moved=await response.json();
    assert.deepEqual(moved.template.styles,centered.template.styles,"movement must not resize typography");
    assert.equal(moved.template.elements[0].region.width,centered.template.elements[0].region.width);
    prepared=page.waitForResponse(response=>response.url().endsWith("/dynamic-assets/application"));
    await page.getByRole("slider",{name:"效果大小",exact:true}).fill("0.85");
    response=await prepared;
    assert.ok(response.ok(),await response.text());
    application=await response.json();
    const region=application.template.elements[0].region;
    assert.ok(Math.abs(region.y+region.height/2-0.82)<1e-8);
    await submit.waitFor();
  }
  for(const [width,height,label] of [[1280,900,"desktop"],[390,844,"mobile"]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.screenshot({path:`/tmp/effect-trial-${label}.png`});
  }
  if(process.env.RENDER_TRIAL==="1") {
    const production=page.waitForResponse(response=>response.url().endsWith("/production/author"),{timeout:120000});
    await submit.click();
    const response=await production;
    assert.ok(response.ok(),await response.text());
    const batch=await response.json();
    const payload=response.request().postDataJSON();
    assert.equal(payload.previewOnly,true);
    assert.equal(payload.samples[0].transcriptRevision,input.transcript.revision);
    await writeFile("/tmp/effect-trial-run.json",JSON.stringify({batch,application,inputId:input.input.id,effectId:asset.definition.id},null,2));
    console.log(JSON.stringify({batchId:batch.id,previewOnly:true,transcriptRevision:input.transcript.revision}));
  }
  assert.deepEqual(await read(`/dynamic-assets/${asset.definition.id}`),asset);
  await page.reload();
  await page.getByRole("region",{name:"选择素材与内容",exact:true}).waitFor();
  assert.equal(await page.getByRole("combobox",{name:"试映效果区域",exact:true}).inputValue(),"lower");
  if(process.env.INDEPENDENT_TRIAL==="1") {
    assert.equal(await page.getByRole("checkbox",{name:"独立位置与大小",exact:true}).isChecked(),true);
    assert.equal(await page.getByRole("slider",{name:"效果大小",exact:true}).inputValue(),"0.85");
    assert.equal(await page.getByRole("slider",{name:"垂直中心",exact:true}).inputValue(),"0.82");
  }
  console.log(JSON.stringify({passed:["saved effect entry","pinned revision","native application settings","real input retained across placement changes","desktop/mobile no overflow","effect unchanged","placement survives reload"]}));
} finally {await browser.close();}
