import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
try {
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:3000/templates?effect=dynamic-ac330f19-affe-4aed-b3c4-a6b63f2c85ae");
  const blur=page.getByRole("spinbutton",{name:"阴影模糊",exact:true});
  await blur.waitFor();
  const save=page.getByRole("button",{name:"保存修改",exact:true});
  assert.equal(await save.isDisabled(),true);
  for(const name of ["阴影模糊","横向留白"]){
    const field=page.getByRole("spinbutton",{name,exact:true});
    const original=await field.inputValue();
    await field.fill(String(Number(original)+1));assert.equal(await save.isEnabled(),true);
    await field.fill(original);assert.equal(await save.isDisabled(),true);
  }
  const keyword=page.getByRole("group",{name:"样式用途",exact:true}).getByRole("checkbox",{name:"重点词",exact:true});
  assert.equal(await keyword.isChecked(),true);
  await keyword.uncheck();assert.equal(await save.isEnabled(),true);
  await keyword.check();assert.equal(await save.isDisabled(),true);
  const dialogs=[];page.on("dialog",dialog=>{dialogs.push(dialog.type());void dialog.dismiss();});
  await page.getByRole("link",{name:"试用到视频",exact:true}).click();
  await page.waitForURL("**/try?revision=*");
  assert.deepEqual(dialogs,[]);
  console.log("PASS: reverted nested styles and unordered purposes are clean; trial navigation enabled; no data saved");
} finally {await browser.close();}
