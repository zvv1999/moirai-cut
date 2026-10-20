import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "apps/web/package.json"));
const sharp = require("sharp");
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Pass an absolute output directory.");
const base = process.env.OPENCUT_BASE_URL ?? "http://127.0.0.1:3000";
const revision = "e2e7f9f6aaff3170526a67a2434732e07407fb1e";
const licenseRevision = "8436ac247c7120766af00c055b1656b7f2122be0";
const archiveUrl = `https://raw.githubusercontent.com/ira-design/ira-illustrations/${revision}/SVG.zip`;
const expectedHash = "8da78c4d4671b8f440781114ea82149f9c32c903e7b22c702bfb8b9ff1efccc1";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function download(url) {
 const response = await fetch(url);
 assert(response.ok, `${response.status}: ${url}`);
 return Buffer.from(await response.arrayBuffer());
}
const entries = [
 ["bg1-2", "商品陈列", "商品", "购物"],
 ["bg12-1", "创意启程", "知识", "灵感"],
 ["bg12-2", "咖啡交流", "生活", "交流"],
 ["bg15-1", "知识讲解", "知识", "教学"],
 ["bg15-2", "协作讨论", "知识", "协作"],
 ["bg2-1", "数码设备", "商品", "数码"],
 ["bg3-1", "城市购物", "商品", "购物"],
 ["bg4-2", "日程安排", "知识", "时间"],
 ["bg5-1", "居家阅读", "生活", "阅读"],
 ["bg6-2", "桌面办公", "知识", "工作"],
 ["bg7-2", "街角交谈", "生活", "城市"],
 ["bg9-1", "户外学习", "生活", "学习"],
];
await fs.mkdir(output, { recursive: true });
const archive = path.join(output, "IRA-SVG.zip");
const bytes = await fs.readFile(archive).catch(() => download(archiveUrl));
assert.equal(hash(bytes), expectedHash);
await fs.writeFile(archive, bytes);
const licenseUrl = `https://raw.githubusercontent.com/ira-design/ira-illustrations/${licenseRevision}/LICENSE.md`;
const license = (await download(licenseUrl)).toString("utf8");
assert(license.includes("MIT License") && license.includes("Creative Tim"));
await fs.writeFile(path.join(output, "LICENSE.txt"), license);
await fs.writeFile(path.join(output, "SOURCE-README.md"), await download(`https://raw.githubusercontent.com/ira-design/ira-illustrations/${licenseRevision}/README.md`));
async function alphaCheck(bytes) {
 const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
 let transparent = 0, visible = 0;
 for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; else visible++; }
 assert(transparent > info.width * info.height * .1 && visible > info.width * info.height * .1);
 return { width: info.width, height: info.height, transparent, visible };
}
const results = [], tiles = [];
for (const [key, name, category, subject] of entries) {
 const member = `SVG/Examples/${key}.svg`;
 const svg = execFileSync("unzip", ["-p", archive, member], { maxBuffer: 4 * 1024 * 1024 });
 const source = path.join(output, `${key}.svg`), png = path.join(output, `${key}.png`);
 await fs.writeFile(source, svg);
 await sharp(svg).resize(1200, 900, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(png);
 const alpha = await alphaCheck(await fs.readFile(png));
 const provenance = `IRA Design by Creative Tim. MIT licensed illustration, not AI-generated. Source: ${archiveUrl} :: ${member}. Archive SHA256 ${expectedHash}. Converted SVG to transparent 1200x900 PNG without recoloring. License: ${licenseUrl}\n${license}`;
 const response = await fetch(`${base}/api/footage/templates/assets`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" }, body: JSON.stringify({ path: png, kind: "image", name: `插画 · ${name}`, description: `${category}主题的IRA场景插画；${subject}；保留原始颜色与透明背景。`, tags: ["插画", "illustration", category, subject, "IRA Design", "MIT", "透明", "场景"], provenance }) });
 const asset = await response.json();assert(response.ok, JSON.stringify(asset));
 const served = await download(`${base}/api/footage/templates/assets/${asset.id}/media`);
 const servedAlpha = await alphaCheck(served);
 results.push({ key, name, category, subject, source, png, sourceSha256: hash(svg), asset, alpha, servedAlpha });
 const i = results.length - 1;
 tiles.push({ input: await sharp(png).resize(300, 225).toBuffer(), left: i % 3 * 320 + 10, top: Math.floor(i / 3) * 245 + 10 });
 console.log(JSON.stringify({ name, id: asset.id, alphaVerified: true }));
}
await sharp({ create: { width: 960, height: 980, channels: 4, background: "#f4f5f6" } }).composite(tiles).png().toFile(path.join(output, "contact-sheet.png"));
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify({ source: "IRA Design", revision, licenseRevision, archiveUrl, archiveSha256: expectedHash, license, results }, null, 2));
