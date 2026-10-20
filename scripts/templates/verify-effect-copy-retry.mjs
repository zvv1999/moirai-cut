import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page=await browser.newPage();
  let drafts=0;
  const requests=[];
  await page.route("**/api/footage/templates/dynamic-assets/duplicate",async route=>{
    drafts++;
    const body=route.request().postDataJSON();
    await route.fulfill({json:{definition:{...body.definition,id:`copy-retry-ui-${drafts}`,name:body.name,revision:0}}});
  });
  await page.route("**/api/footage/templates/dynamic-assets",async route=>{
    if(route.request().method()!=="POST")return route.continue();
    const body=route.request().postDataJSON();requests.push(body);
    if(requests.length===1)return route.abort("connectionreset");
    await route.fulfill({json:{definition:{...body.definition,revision:1}}});
  });
  await page.goto("http://127.0.0.1:3000/templates?effect=style-pilot-20260923-offset");
  const name=page.getByRole("textbox",{name:"效果名称",exact:true});await name.waitFor();
  await name.fill("网络恢复验证");
  const copy=page.getByRole("button",{name:"另存为新样式",exact:true});
  await copy.click();await page.locator(".tw-dynamic-assets > p[role=alert]").waitFor();
  assert.equal(await name.inputValue(),"网络恢复验证");
  await copy.click();
  await page.waitForFunction(()=>document.querySelector('input[aria-label="效果名称"]')?.value==="网络恢复验证 副本");
  assert.equal(drafts,1);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
  assert.equal(new URL(page.url()).searchParams.get("effect"),"copy-retry-ui-1");
  console.log("PASS: interrupted copy save retries identical draft and idempotency key; source edits retained; writes intercepted");
} finally {await browser.close();}
