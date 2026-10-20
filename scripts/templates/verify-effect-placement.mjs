import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.WORKBENCH_URL ?? "http://127.0.0.1:3000";
const read = async path => {
  const response = await fetch(`${base}/api/footage/templates${path}`);
  assert.ok(response.ok);
  return response.json();
};
const library = await read("");
const host = library.templates.find(item => item.id === process.env.TEST_TEMPLATE_ID);
assert.ok(host, "Set TEST_TEMPLATE_ID to a test template");
const asset = await read(`/dynamic-assets/${process.env.TEST_EFFECT_ID}`);
assert.notDeepEqual(host.canvas, asset.definition.canvas, "Use different canvases");
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {})});
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(`${base}/templates?template=${encodeURIComponent(host.id)}`);
  await page.getByRole("navigation",{name:"工作视图",exact:true}).getByRole("button",{name:"添加素材",exact:true}).click();
  await page.getByRole("button",{name:"动态素材",exact:true}).click();
  await page.getByRole("button",{name:`${asset.definition.name} v${asset.definition.revision} · ${asset.definition.layers.length} 层`,exact:true}).click();
  const fit = page.getByRole("combobox",{name:"插入画幅适配",exact:true});
  const insert = page.getByRole("button",{name:"插入当前模板",exact:true});
  await fit.selectOption("exact");
  const failed = page.waitForResponse(response => response.url().endsWith("/dynamic-assets/insert"));
  await insert.click();
  const rejected = await failed;
  assert.equal(rejected.status(),400);
  assert.match((await rejected.json()).error,/canvas must match/);
  await fit.selectOption("contain");
  const inserted = page.waitForResponse(response => response.url().endsWith("/dynamic-assets/insert"));
  await insert.click();
  const response = await inserted;
  assert.ok(response.ok(),await response.text());
  const output = await response.json();
  assert.deepEqual(output.instance.placement,{x:0,y:0,width:1,height:1});
  assert.deepEqual(output.template.canvas,host.canvas);
  assert.deepEqual(output.template.elements.slice(0,host.elements.length),host.elements);
  assert.ok(output.template.elements.length > host.elements.length);
  await page.getByText(`${asset.definition.name} 已插入模板，可在设计视图继续编辑。`,{exact:true}).waitFor();
  assert.equal(await page.getByText(/dynamic asset canvas must match/).count(),0);
  for(const [width,height,label] of [[1280,900,"desktop"],[390,844,"mobile"]]) {
    await page.setViewportSize({width,height});
    await fit.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.screenshot({path:`/tmp/effect-placement-${label}.png`});
  }
  assert.deepEqual((await read("")).templates.find(item=>item.id===host.id),host);
  assert.deepEqual(await read(`/dynamic-assets/${asset.definition.id}`),asset);
  console.log(JSON.stringify({passed:["strict mismatch rejected","native proportional insertion","host and effect unchanged in storage","desktop/mobile no overflow"],elementsAdded:output.template.elements.length-host.elements.length}));
} finally {await browser.close();}
