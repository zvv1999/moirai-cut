import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page=await browser.newPage();
  const ready=()=>page.waitForFunction(()=>{
    const stage=document.querySelector(".tw-effect-stage"),c=stage?.querySelector("canvas");
    return c && c.dataset.renderGeneration===stage.dataset.previewGeneration && getComputedStyle(c).visibility==="visible";
  });
  await page.goto("http://127.0.0.1:3000/templates?effect=style-study-20260924-note");
  await ready();
  await page.getByText("示例文案",{exact:true}).click();
  const sentence=page.getByRole("textbox",{name:"预览示例句子",exact:true});
  const keyword=page.getByRole("textbox",{name:"预览示例重点词",exact:true});
  const old=await page.locator(".tw-effect-stage").getAttribute("data-preview-generation");
  // A real validation failure must remove the old frame rather than imply success.
  await keyword.fill("不存在的重点词");
  await page.getByRole("alert").filter({hasText:"preview keyword not found"}).waitFor();
  assert.equal(await page.locator(".tw-effect-stage").count(),0);
  await sentence.fill("每天留出十分钟，记住真正打动你的地方");
  await keyword.fill("真正打动你的地方");
  await ready();
  assert.notEqual(await page.locator(".tw-effect-stage").getAttribute("data-preview-generation"),old);
  // Hold a valid response so the previous frame cannot pass as the new example.
  let release, entered;
  const intercepted=new Promise(resolve=>entered=resolve);
  await page.route("**/dynamic-assets/preview",async route=>{
    const response=await route.fetch();
    await new Promise(resolve=>{release=resolve;entered();});
    await route.fulfill({response});
  },{times:1});
  await sentence.fill("让重点表达更清楚");
  await keyword.fill("重点");
  await intercepted;
  assert.equal(await page.locator('canvas[aria-label="效果实时画面"]').evaluate(c=>getComputedStyle(c).visibility),"hidden");
  release();
  await ready();
  await page.getByRole("button",{name:"白色预览背景",exact:true}).click();
  await page.waitForFunction(()=>{const c=document.querySelector(".tw-effect-stage canvas");return c?.dataset.renderBackground==="#ffffff"&&getComputedStyle(c).visibility==="visible";});
  await sentence.fill("重点之后还有重点");
  await ready();
  const occurrence=page.getByRole("spinbutton",{name:"预览重点词出现次数",exact:true});
  const secondResponse=page.waitForResponse(r=>r.url().endsWith("/dynamic-assets/preview")&&r.request().postDataJSON()?.example?.keywordOccurrence===1);
  await occurrence.fill("2");
  const second=await (await secondResponse).json();
  assert.ok(!second.error,JSON.stringify(second));
  await ready();
  const starts=second.tracks.overlay.flatMap(t=>t.elements).map(e=>e.startTime);
  assert.ok(starts.some(t=>t>120000),"Second occurrence should start after the first second of this two-second example");
  await occurrence.fill("3");
  await page.getByRole("alert").filter({hasText:"preview keyword not found"}).waitFor();
  await sentence.fill("重点只有一次");
  assert.equal(await occurrence.inputValue(),"1");
  await ready();
  console.log("PASS invalid example, recovery, delayed response hides stale frame, background redraw, repeated keyword timing and reset");
} finally {await browser.close();}
