import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_EXECUTABLE});
const id = "effect-follow-validation-20260923";
try {
  const page = await browser.newPage({viewport:{width:1280,height:950}});
  await page.goto(`http://127.0.0.1:3000/templates?effect=${id}`);
  const name = page.getByRole("textbox", {name:"效果名称",exact:true});
  await name.waitFor();
  const originalName = await name.inputValue();
  const purposes = page.getByRole("group", {name:"样式用途",exact:true});
  await purposes.getByRole("checkbox",{name:"重点词",exact:true}).check();
  await purposes.getByRole("checkbox",{name:"花字",exact:true}).check();
  await purposes.getByRole("checkbox",{name:"动态字幕",exact:true}).uncheck();
  const save = page.getByRole("button",{name:"保存修改",exact:true});
  if (await save.isEnabled()) {
    const response = page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST");
    await save.click();
    assert.equal((await response).ok(),true);
  }
  await page.reload();
  await name.waitFor();
  assert.equal(await purposes.getByRole("checkbox",{name:"重点词",exact:true}).isChecked(),true);
  assert.equal(await purposes.getByRole("checkbox",{name:"花字",exact:true}).isChecked(),true);
  const filter = page.getByRole("combobox",{name:"筛选样式用途",exact:true});
  const entry = page.locator(".tw-dynamic-results .tw-style-open").filter({hasText:originalName});
  for (const value of ["keyword","decorative_text"]) {
    await filter.selectOption(value);
    assert.equal(await entry.count(),1);
  }
  await filter.selectOption("caption");
  assert.equal(await entry.count(),0);
  await name.fill(`${originalName} pending`);
  await filter.selectOption("unclassified");
  assert.equal(await entry.count(),0);
  assert.equal(await name.inputValue(),`${originalName} pending`);
  await page.getByRole("button",{name:"撤销未保存修改",exact:true}).click();
  await filter.selectOption("keyword");
  await page.getByRole("searchbox",{name:"搜索效果素材",exact:true}).fill("no-such-style-20260923");
  await page.getByText("没有匹配的样式",{exact:true}).waitFor();
  await page.getByRole("searchbox",{name:"搜索效果素材",exact:true}).fill("");
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:950});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.waitForFunction(()=>{const stage=document.querySelector(".tw-effect-stage"),canvas=stage?.querySelector("canvas");return !!canvas&&canvas.dataset.renderGeneration===stage.dataset.previewGeneration;});
    await page.screenshot({path:`/tmp/effect-purposes-${width}.png`,fullPage:true});
  }
  console.log(JSON.stringify({id,verified:"multi-purpose save/reload, combined search, unclassified filter, pending edits, desktop/mobile layout"}));
} finally {
  await browser.close();
}
