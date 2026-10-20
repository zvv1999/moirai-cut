import {chromium} from "/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try {
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:3000/templates?effect=style-study-20260924-note");
  const ready=()=>page.waitForFunction(()=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return c&&c.dataset.renderGeneration===s.dataset.previewGeneration&&getComputedStyle(c).visibility==="visible";});
  await ready();
  await page.getByRole("button",{name:"编辑布局区域",exact:true}).click();
  await page.locator(".tw-layout-overlay button[data-layer-id]").first().focus();
  await page.keyboard.press("Enter");
  const selectedId=await page.locator('.tw-layout-overlay button[aria-pressed="true"]').first().getAttribute("data-layer-id");
  const polygon=page.locator('svg[aria-label="当前文字测量边界"] polygon').first();
  await polygon.waitFor();
  const before=await polygon.getAttribute("points");
  await page.getByText("示例文案",{exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/preview")&&r.request().postDataJSON()?.example?.keyword==="真正打动你的地方");
  await page.getByRole("textbox",{name:"预览示例句子",exact:true}).fill("真正打动你的地方");
  await page.getByRole("textbox",{name:"预览示例重点词",exact:true}).fill("真正打动你的地方");
  const previewResponse=await response;
  assert.equal(previewResponse.ok(),true);
  const compiled=await previewResponse.json();
  const selectedClip=compiled.tracks.overlay.flatMap(track=>track.elements).find(element=>element.params["template.elementId"]===selectedId);
  assert.ok(selectedClip,"Selected layer must have a compiled example instance");
  const entranceTime=Number((selectedClip.startTime/120000+0.04).toFixed(2));
  await ready();
  await page.waitForFunction(old=>{const p=document.querySelector('svg[aria-label="当前文字测量边界"] polygon');return p&&p.getAttribute("points")!==old;},before);
  const after=await polygon.getAttribute("points");
  assert.notEqual(after,before);
  // Hold the renderer's font-ready await to expose the seek/render race reliably.
  await page.evaluate(()=>{
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    Object.defineProperty(document.fonts,"ready",{configurable:true,get:()=>gate});
    window.releaseMeasuredFrame=()=>{delete document.fonts.ready;release(document.fonts);};
  });
  await page.getByRole("slider",{name:"效果预览进度",exact:true}).fill(String(entranceTime));
  assert.equal(await page.locator('canvas[aria-label="效果实时画面"]').evaluate(c=>getComputedStyle(c).visibility),"hidden");
  assert.equal(await page.locator('svg[aria-label="当前文字测量边界"]').count(),0);
  await page.evaluate(()=>{window.releaseMeasuredFrame();delete window.releaseMeasuredFrame;});
  await ready();
  assert.equal(await page.locator('canvas[aria-label="效果实时画面"]').getAttribute("data-render-time"),String(entranceTime));
  await polygon.waitFor();
  const entrance=await polygon.getAttribute("points");
  assert.notEqual(entrance,after,"Entrance rotation/rise should produce a different measured polygon");
  await page.locator(".tw-effect-stage").screenshot({path:"/tmp/text-measurement-guide.png"});
  console.log(JSON.stringify({before,after,entrance,delayedSeek:"passed"}));
}finally{await browser.close();}
