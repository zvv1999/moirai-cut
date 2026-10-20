import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page=await browser.newPage({viewport:{width:1280,height:950}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("http://127.0.0.1:3000/templates/effects/style-pilot-20260923-caption/try?revision=1&scale=0.85&centerX=0.5&centerY=0.8");
  const control=page.getByRole("checkbox",{name:"独立字幕行宽",exact:true});
  await control.waitFor();
  const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/application")&&r.request().postDataJSON()?.captionWidth===0.85);
  await control.check();
  const applied=await (await response).json();
  assert.equal(applied.template.elements.find(e=>e.binding==="sentence").region.width,0.85);
  await page.reload();
  await page.getByRole("slider",{name:"字幕行宽",exact:true}).waitFor();
  assert.equal(await control.isChecked(),true);
  assert.equal(await page.getByRole("slider",{name:"字幕行宽",exact:true}).inputValue(),"0.85");
  await page.locator("summary").filter({hasText:/^示例文案$/}).click();
  const text="让重点表达更清楚，每天留出十分钟";
  const example=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/application-preview")&&r.request().postDataJSON()?.example?.text===text);
  await page.getByRole("textbox",{name:"预览示例句子",exact:true}).fill(text);
  assert.equal((await example).ok(),true);
  for(const format of ["landscape","portrait"]) {
    await page.getByRole("combobox",{name:"试映画幅",exact:true}).selectOption(format);
    await page.waitForFunction(format=>{
      const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");
      return document.querySelector(".tw-trial-visual")?.getAttribute("aria-busy")==="false"&&document.querySelector('section[aria-label="效果预览"]')?.getAttribute("aria-busy")==="false"&&c?.dataset.renderGeneration===s?.dataset.previewGeneration&&c?.width===(format==="landscape"?1280:720)&&c?.height===(format==="landscape"?720:1280);
    },format);
    const canvas=page.locator('canvas[aria-label="效果实时画面"]');
    const pixels=await canvas.evaluate(c=>c.getContext("2d").getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===3&&v>0).length);
    assert.ok(pixels>100);
    await canvas.screenshot({path:`/tmp/caption-width-${format}.png`});
  }
  await control.uncheck();
  assert.equal(new URL(page.url()).searchParams.has("captionWidth"),false);
  await page.goto("http://127.0.0.1:3000/templates/effects/style-pilot-20260923-offset/try?revision=1");
  await page.waitForFunction(()=>document.querySelector(".tw-trial-visual")?.getAttribute("aria-busy")==="false");
  assert.equal(await control.count(),0);
  assert.deepEqual(errors,[]);
  console.log("Caption width: application, persisted controls, landscape/portrait nonblank rendering, and keyword-only control exclusion passed.");
} finally {await browser.close();}
