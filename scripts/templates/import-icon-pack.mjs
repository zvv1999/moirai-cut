import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "apps/web/package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const icons = require("lucide-react");
const sharp = require("sharp");
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Pass an absolute output directory.");
const base = process.env.OPENCUT_BASE_URL ?? "http://127.0.0.1:3000";
const packageRoot = path.dirname(require.resolve("lucide-react/package.json"));
const license = await fs.readFile(path.join(packageRoot, "LICENSE"), "utf8");
const { version } = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
const entries = [
 ["ShoppingCart", "购物车", "购物", "#E44565"],
 ["Tag", "价格标签", "价格", "#E44565"],
 ["Gift", "礼物", "购物", "#E44565"],
 ["Package", "商品包裹", "购物", "#E44565"],
 ["Clock", "时间", "时间", "#2679AD"],
 ["CalendarDays", "日程", "时间", "#2679AD"],
 ["MapPin", "位置", "位置", "#2679AD"],
 ["ListOrdered", "步骤", "步骤", "#2679AD"],
 ["Lightbulb", "灵感提示", "提示", "#B77908"],
 ["TriangleAlert", "注意", "提示", "#B77908"],
 ["CircleHelp", "问题", "提示", "#B77908"],
 ["ArrowRightLeft", "对比", "对比", "#2679AD"],
 ["CircleCheck", "正确", "对错", "#16835B"],
 ["CircleX", "错误", "对错", "#D33D50"],
 ["ThumbsUp", "点赞", "互动", "#16835B"],
 ["Bookmark", "收藏", "互动", "#16835B"],
 ["ArrowRight", "指向箭头", "引导", "#E44565"],
 ["Circle", "圈画", "强调", "#E44565"],
 ["Sparkles", "闪亮强调", "强调", "#B77908"],
 ["MousePointerClick", "点击提示", "互动", "#2679AD"],
 ["PartyPopper", "庆祝礼花", "庆祝", "#16835B"],
];
await fs.mkdir(output, { recursive: true });
await fs.copyFile(path.join(packageRoot, "LICENSE"), path.join(output, "LICENSE.txt"));
const results = [], tiles = [];
for (const [symbol, name, category, color] of entries) {
 assert(icons[symbol], symbol);
 const svg = renderToStaticMarkup(React.createElement(icons[symbol], { size: 384, color, strokeWidth: 1.8 }));
 const source = path.join(output, `${symbol}.svg`), png = path.join(output, `${symbol}.png`);
 await fs.writeFile(source, svg);
 await sharp(Buffer.from(svg)).resize(320, 320).extend({ top: 32, bottom: 32, left: 32, right: 32, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(png);
 const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
 let transparent = 0, visible = 0;
 for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; if (data[i] > 0) visible++; }
 assert(info.width === 384 && info.height === 384 && transparent > 100000 && visible > 1000);
 const provenance = `Lucide ${version}, icon ${symbol}; https://lucide.dev / https://github.com/lucide-icons/lucide. Recolored and padded for template use. Source SVG: ${source}. Not AI-generated. Full license notice follows:\n${license}`;
 const request = { path: png, kind: "image", name: `图标 · ${name}`, description: `${category}用途的透明线性图标，384像素；原始SVG与许可证随素材包保留。`, tags: ["icon", "图标", category, name, "lucide", "透明", color], provenance };
 const response = await fetch(`${base}/api/footage/templates/assets`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" }, body: JSON.stringify(request) });
 const asset = await response.json();assert(response.ok, JSON.stringify(asset));
 results.push({ symbol, name, category, color, source, png, asset, alphaCheck: { transparent, visible } });
 const index = results.length - 1;
 tiles.push({ input: await sharp(png).resize(160, 160).toBuffer(), left: index % 4 * 192 + 16, top: Math.floor(index / 4) * 192 + 16 });
 console.log(JSON.stringify({ name, id: asset.id }));
}
await sharp({ create: { width: 768, height: Math.ceil(entries.length / 4) * 192, channels: 4, background: "#f2f5f4" } }).composite(tiles).png().toFile(path.join(output, "contact-sheet.png"));
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify({ source: "lucide", version, license, results }, null, 2));
