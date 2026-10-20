import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const origin = "http://127.0.0.1:3000";
async function api(path, body) {
  const response = await fetch(`${origin}/api/footage/templates${path}`,body ? {method:"POST",headers:{"Content-Type":"application/json","x-requested-with":"moirai-footage"},body:JSON.stringify(body)} : undefined);
  const value = await response.json();
  assert.equal(response.ok,true,JSON.stringify(value));
  return value;
}
const assets = (await api("/assets")).assets;
const media = assets.find(a=>a.kind==="image"&&a.name.includes("协作讨论")&&a.name.includes("紧凑"));
assert.ok(media,"Missing local illustration fixture");
const {definition:created} = await api("/dynamic-assets/create",{name:"插画替换验证样例",purpose:"decoration",canvas:{width:720,height:720,fps:30}});
const {definition:original} = await api("/dynamic-assets",{definition:created,baseRevision:0,idempotencyKey:`shape-media-${created.id}`});
const before = original.layers.find(l=>l.content.kind==="element");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page = await browser.newPage({viewport:{width:1280,height:950}});
  await page.goto(`${origin}/templates?effect=${original.id}`);
  await page.getByRole("textbox",{name:"效果名称",exact:true}).waitFor();
  await page.getByText("素材库 · 添加与替换",{exact:true}).click();
  await page.getByRole("textbox",{name:"搜索插画与图标",exact:true}).fill(media.name);
  await page.getByRole("button",{name:`选择素材 ${media.name}`,exact:true}).click();
  const response = page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/media")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"用素材替换图形",exact:true}).click();
  const converted = await response;
  assert.equal(converted.ok(),true);
  assert.equal(converted.request().postDataJSON().convertShape,true);
  const {definition} = await converted.json();
  const after = definition.layers.find(l=>l.content.kind==="element");
  assert.equal(after.content.element.features.representation,"image");
  assert.equal(definition.layers.length,original.layers.length);
  for(const key of ["id","region","motions","motionTiming","timing"])
    assert.deepEqual(after.content.element[key],before.content.element[key],key);
  assert.equal(after.parentId,before.parentId);
  assert.equal(definition.resourceBindings[0].assetId,media.id);
  const saved = page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"保存修改",exact:true}).click();
  assert.equal((await saved).ok(),true);
  await page.reload();
  await page.getByRole("button",{name:`${media.name} · 图片`,exact:true}).waitFor();
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:950});
    await page.waitForFunction(()=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return !!c&&!!s.dataset.previewGeneration&&c.dataset.renderGeneration===s.dataset.previewGeneration;});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`/tmp/effect-shape-media-${width}.png`,fullPage:true});
  }
  console.log(JSON.stringify({id:original.id,media:media.id,verified:"explicit conversion, geometry and envelope preservation, save/reload, rendered desktop/mobile preview"}));
} finally { await browser.close(); }
