import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:3000/templates?effect=dynamic-ac330f19-affe-4aed-b3c4-a6b63f2c85ae");
  const input=page.getByRole("combobox",{name:"字体名称",exact:true});
  await input.waitFor();
  await page.waitForFunction(()=>document.querySelector("canvas")?.dataset.renderGeneration);
  const initial=await input.inputValue();
  const families=initial==="Songti SC"?["PingFang SC","Songti SC"]:["Songti SC","PingFang SC"];
  const renders=[];
  for(const family of families){
    const old=await page.locator(".tw-effect-stage").getAttribute("data-preview-generation");
    const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/preview")&&r.request().postDataJSON()?.definition?.styles?.some(s=>s.fontFamily===family));
    await input.fill(family);assert.equal((await response).ok(),true);
    await page.waitForFunction(old=>{const s=document.querySelector(".tw-effect-stage"),c=s?.querySelector("canvas");return !!c&&s.dataset.previewGeneration!==old&&c.dataset.renderGeneration===s.dataset.previewGeneration;},old);
    const canvas=page.locator('canvas[aria-label="效果实时画面"]');
    renders.push(await canvas.evaluate(c=>c.toDataURL()));
    await canvas.screenshot({path:`/tmp/font-${family.replaceAll(" ","-")}.png`});
  }
  assert.notEqual(renders[0],renders[1]);
  const finalFamily=families[0];
  await input.fill(finalFamily);
  const response=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"保存修改",exact:true}).click();assert.equal((await response).ok(),true);
  await page.reload();await input.waitFor();assert.equal(await input.inputValue(),finalFamily);
  console.log(JSON.stringify({verified:"local family input, distinct completed render generations and pixels, save/reload",finalFamily}));
} finally {await browser.close();}
