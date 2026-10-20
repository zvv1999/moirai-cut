import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:3000/templates?effect=dynamic-ac330f19-affe-4aed-b3c4-a6b63f2c85ae");
  await page.getByRole("combobox",{name:"字体名称",exact:true}).fill("PingFang SC");
  const pixels=[];
  for (const weight of ["400","800"]) {
    const old=await page.locator(".tw-effect-stage").getAttribute("data-preview-generation");
    const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/preview")&&r.request().postDataJSON()?.definition?.styles?.some(s=>s.weight===Number(weight)));
    await page.getByRole("combobox",{name:"字重",exact:true}).selectOption(weight);
    const result=await(await response).json();
    const texts=result.tracks.overlay.flatMap(t=>t.elements).filter(e=>e.type==="text");
    assert.ok(texts.length);assert.ok(texts.every(e=>e.params.fontWeight===weight));
    await page.waitForFunction(old=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return !!c&&s.dataset.previewGeneration!==old&&c.dataset.renderGeneration===s.dataset.previewGeneration;},old);
    const canvas=page.locator('canvas[aria-label="效果实时画面"]');
    pixels.push(await canvas.evaluate(c=>c.toDataURL()));
    await canvas.screenshot({path:`/tmp/effect-weight-${weight}.png`});
  }
  assert.notEqual(pixels[0],pixels[1]);
  console.log("PASS: numeric weight in compiled text and distinct completed canvas frames; edits not saved");
} finally {await browser.close();}
