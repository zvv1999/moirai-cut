import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {archiveTestStyle} from './archive-test-style.mjs';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page = await browser.newPage({viewport:{width:1280,height:950}});
  await page.goto("http://127.0.0.1:3000/templates");
  await page.getByRole("textbox",{name:"效果名称",exact:true}).waitFor();
  await page.getByRole("combobox",{name:"新建样式用途",exact:true}).selectOption("decoration");
  const [response] = await Promise.all([
    page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST"),
    page.getByRole("button",{name:"新建装饰素材",exact:true}).click(),
  ]).catch(async error=>{console.error(await page.locator('[role="alert"]').allTextContents());throw error;});
  assert.equal(response.ok(),true);
  const {definition} = await response.json();
  assert.deepEqual(definition.purposes,["decoration"]);
  assert.equal(definition.inputs.length,0);
  assert.equal(definition.layers.filter(l=>l.content.kind==="element"&&l.content.element.features.representation==="text").length,0);
  assert.equal(definition.layers.filter(l=>l.content.kind==="element"&&l.content.element.features.representation==="rectangle").length,1);
  const name = page.getByRole("textbox",{name:"效果名称",exact:true});
  await name.waitFor();
  await name.fill("装饰入口验证样例");
  const edited = page.waitForResponse(r=>r.url().endsWith("/dynamic-assets")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"保存修改",exact:true}).click();
  assert.equal((await edited).ok(),true);
  await page.reload();
  await name.waitFor();
  assert.equal(await name.inputValue(),"装饰入口验证样例");
  await page.getByRole("group",{name:"筛选样式用途",exact:true}).getByRole("button",{name:"装饰素材",exact:true}).click();
  assert.equal(await page.locator(".tw-dynamic-results .tw-style-open").filter({hasText:"装饰入口验证样例"}).count(),1);
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:950});
    await page.waitForFunction(()=>{const stage=document.querySelector(".tw-effect-stage"),c=stage?.querySelector("canvas");return !!c&&!!stage.dataset.previewGeneration&&c.dataset.renderGeneration===stage.dataset.previewGeneration;});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`/tmp/effect-decoration-${width}.png`,fullPage:true});
  }
  await archiveTestStyle("http://127.0.0.1:3000",definition.id);
  console.log(JSON.stringify({id:definition.id,verified:"create, save, reload, decoration filter, desktop/mobile preview, archive fixture"}));
} finally { await browser.close(); }
