#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const require = createRequire(path.join(root, "apps", "web", "package.json"));
const sharp = require("sharp");
const assetsDir = path.join(root, "docs", "brand", "assets");
const logoDir = path.join(root, "apps", "web", "public", "logos", "moirai-cut");
const editorPath = path.join(assetsDir, "moirai-cut-editor-product.png");
const realEditorSourcePath = path.join(
	root,
	"docs",
	"reports",
	"opencut-editor-goal",
	"assets",
	"screenshots",
	"G02-agent-plan-preview.png",
);

const colors = {
	background: "#080A0F",
	panel: "#0E121A",
	white: "#F5F7FA",
	cyan: "#22D3EE",
	slate: "#94A3B8",
	line: "#1B2634",
};

const escapeXml = (value) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

const text = ({
	x,
	y,
	value,
	size,
	fill = colors.white,
	weight = 600,
	spacing = 0,
}) =>
	`<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, SF Pro Display, PingFang SC, Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;

const mark = ({ x, y, scale = 1, light = true }) => `
	<g transform="translate(${x} ${y}) scale(${scale})">
		<path d="M12 21H21C28 21 28 43 36 43H52" stroke="${light ? colors.white : colors.background}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="M12 43H21C28 43 28 21 36 21H52" stroke="${light ? colors.white : colors.background}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="M12 32H52" stroke="${colors.cyan}" stroke-width="4.5" stroke-linecap="round"/>
	</g>`;

const svg = ({ width, height, content }) =>
	Buffer.from(
		`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`,
	);

async function normalizedEditor() {
	// Product evidence must be an actual editor capture. Campaign copy may frame
	// the screenshot, but the UI itself is never synthesized or retouched.
	const source = await readFile(realEditorSourcePath);
	const normalized = await sharp(source)
		.resize(1600, 900, { fit: "cover", position: "centre" })
		.png({ compressionLevel: 9 })
		.toBuffer();
	await writeFile(editorPath, normalized);
	return normalized;
}

async function renderLandscape(editor) {
	const width = 1600;
	const height = 900;
	const editorWidth = 900;
	const editorHeight = 506;
	const editorX = 620;
	const editorY = 208;
	const screenshot = await sharp(editor)
		.resize(editorWidth, editorHeight, { fit: "cover" })
		.png()
		.toBuffer();

	const background = svg({
		width,
		height,
		content: `
			<rect width="${width}" height="${height}" fill="${colors.background}"/>
			<path d="M-80 690C280 690 270 170 625 170C980 170 960 690 1680 690" fill="none" stroke="#172634" stroke-width="1.5"/>
			<path d="M-80 744C300 744 300 242 625 242C950 242 990 744 1680 744" fill="none" stroke="#15212E" stroke-width="1.5"/>
			<path d="M80 790H1518" stroke="${colors.cyan}" stroke-opacity="0.48" stroke-width="2"/>
			<rect x="${editorX - 10}" y="${editorY - 10}" width="${editorWidth + 20}" height="${editorHeight + 20}" rx="18" fill="#020409" stroke="#263443"/>
		`,
	});

	const foreground = svg({
		width,
		height,
		content: `
			${mark({ x: 66, y: 43, scale: 0.86 })}
			${text({ x: 132, y: 92, value: "MOIRAI / CUT", size: 26, weight: 650, spacing: 4 })}
			${text({ x: 74, y: 260, value: "FROM BLACK BOX", size: 52, weight: 650, spacing: -1 })}
			${text({ x: 74, y: 326, value: "TO SHARED", size: 52, weight: 650, spacing: -1 })}
			${text({ x: 74, y: 390, value: "TIMELINE", size: 52, fill: colors.cyan, weight: 650, spacing: -1 })}
			${text({ x: 76, y: 454, value: "告别生成黑盒，进入共享时间线", size: 21, weight: 520 })}
			${text({ x: 76, y: 524, value: "PROMPT · EDIT · PREVIEW · REFINE", size: 17, fill: colors.slate, weight: 600, spacing: 1.5 })}
			${text({ x: 76, y: 558, value: "RENDER LOCALLY", size: 17, fill: colors.slate, weight: 600, spacing: 1.5 })}
			<rect x="${editorX}" y="${editorY}" width="${editorWidth}" height="${editorHeight}" rx="10" fill="none" stroke="#334354" stroke-width="1.5"/>
			${text({ x: 74, y: 834, value: "Agents propose. You direct.", size: 24, weight: 620 })}
			${text({ x: 1118, y: 834, value: "OPEN SOURCE · LOCAL FIRST", size: 16, fill: colors.slate, weight: 600, spacing: 1.5 })}
		`,
	});

	return sharp({
		create: { width, height, channels: 4, background: colors.background },
	})
		.composite([
			{ input: background },
			{ input: screenshot, left: editorX, top: editorY },
			{ input: foreground },
		])
		.png({ compressionLevel: 9 })
		.toBuffer();
}

async function renderPortrait(editor) {
	const width = 1080;
	const height = 1350;
	const editorWidth = 936;
	const editorHeight = 527;
	const editorX = 72;
	const editorY = 520;
	const screenshot = await sharp(editor)
		.resize(editorWidth, editorHeight, { fit: "cover" })
		.png()
		.toBuffer();

	const background = svg({
		width,
		height,
		content: `
			<rect width="${width}" height="${height}" fill="${colors.background}"/>
			<path d="M-80 1090C230 1090 230 340 540 340C850 340 850 1090 1160 1090" fill="none" stroke="#172634" stroke-width="1.5"/>
			<path d="M-80 1152C260 1152 250 410 540 410C830 410 820 1152 1160 1152" fill="none" stroke="#15212E" stroke-width="1.5"/>
			<rect x="62" y="510" width="956" height="547" rx="18" fill="#020409" stroke="#263443"/>
			<path d="M72 1242H1008" stroke="${colors.cyan}" stroke-opacity="0.48" stroke-width="2"/>
		`,
	});

	const foreground = svg({
		width,
		height,
		content: `
			${mark({ x: 57, y: 41, scale: 0.86 })}
			${text({ x: 124, y: 90, value: "MOIRAI / CUT", size: 26, weight: 650, spacing: 4 })}
			${text({ x: 72, y: 228, value: "FROM BLACK BOX", size: 58, weight: 650, spacing: -1 })}
			${text({ x: 72, y: 302, value: "TO SHARED TIMELINE", size: 58, fill: colors.cyan, weight: 650, spacing: -1.5 })}
			${text({ x: 74, y: 370, value: "告别生成黑盒，进入共享时间线", size: 24, weight: 520 })}
			${text({ x: 74, y: 430, value: "PROMPT · EDIT · PREVIEW · REFINE", size: 18, fill: colors.slate, weight: 600, spacing: 1.8 })}
			${text({ x: 74, y: 465, value: "OPEN SOURCE · LOCAL FIRST", size: 18, fill: colors.slate, weight: 600, spacing: 1.8 })}
			<rect x="${editorX}" y="${editorY}" width="${editorWidth}" height="${editorHeight}" rx="10" fill="none" stroke="#334354" stroke-width="1.5"/>
			${text({ x: 72, y: 1152, value: "Agents propose. You direct.", size: 31, weight: 620 })}
			${text({ x: 72, y: 1198, value: "Agent 参与剪辑，最终控制始终在你。", size: 22, fill: colors.slate, weight: 520 })}
			${text({ x: 72, y: 1300, value: "PROMPT. EDIT. PREVIEW. REFINE. RENDER LOCALLY.", size: 16, fill: colors.slate, weight: 600, spacing: 1.2 })}
		`,
	});

	return sharp({
		create: { width, height, channels: 4, background: colors.background },
	})
		.composite([
			{ input: background },
			{ input: screenshot, left: editorX, top: editorY },
			{ input: foreground },
		])
		.png({ compressionLevel: 9 })
		.toBuffer();
}

async function renderLogoPreview() {
	const width = 1200;
	const height = 400;
	return sharp({
		create: { width, height, channels: 4, background: colors.background },
	})
		.composite([
			{
				input: svg({
					width,
					height,
					content: `
						<rect width="${width}" height="${height}" fill="${colors.background}"/>
						<path d="M100 328H1100" stroke="#17303D" stroke-width="1.5"/>
						${mark({ x: 162, y: 113, scale: 2.7 })}
						${text({ x: 356, y: 236, value: "MOIRAI / CUT", size: 78, weight: 650, spacing: 5 })}
					`,
				}),
			},
		])
		.png({ compressionLevel: 9 })
		.toBuffer();
}

async function renderIcons() {
	const iconSvg = await readFile(path.join(logoDir, "icon.svg"));
	const iconDir = path.join(root, "apps", "web", "public", "icons");
	const sizes = [
		16, 32, 36, 48, 57, 60, 70, 72, 76, 96, 114, 120, 144, 150, 152, 180, 192,
		310, 512,
	];
	const iconCache = new Map();
	for (const size of sizes) {
		iconCache.set(
			size,
			await sharp(iconSvg).resize(size, size).png().toBuffer(),
		);
	}
	const filenames = await import("node:fs/promises").then(({ readdir }) =>
		readdir(iconDir),
	);
	for (const filename of filenames) {
		const match = filename.match(/(\d+)x\1\.png$/);
		if (!match) continue;
		const size = Number(match[1]);
		const output =
			iconCache.get(size) ??
			(await sharp(iconSvg).resize(size, size).png().toBuffer());
		await writeFile(path.join(iconDir, filename), output);
	}
	await writeFile(
		path.join(root, "apps", "web", "public", "moirai-cut-icon-512.png"),
		iconCache.get(512),
	);
}

const editor = await normalizedEditor();
const landscape = await renderLandscape(editor);
const portrait = await renderPortrait(editor);
const logoPreview = await renderLogoPreview();

await writeFile(
	path.join(assetsDir, "moirai-cut-launch-landscape.png"),
	landscape,
);
await writeFile(
	path.join(assetsDir, "moirai-cut-launch-portrait.png"),
	portrait,
);
await writeFile(
	path.join(assetsDir, "moirai-cut-logo-preview.png"),
	logoPreview,
);
await sharp(landscape)
	.resize(1200, 630, { fit: "cover", position: "centre" })
	.jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
	.toFile(
		path.join(root, "apps", "web", "public", "open-graph", "default.jpg"),
	);
await renderIcons();

console.log("Rendered Moirai Cut brand assets.");
