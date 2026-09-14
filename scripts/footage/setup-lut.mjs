import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.join(homedir(), ".moirai-cut");
const runtime = path.join(root, "lut-runtime");
const model = path.join(root, "models", "image-adaptive-3dlut");
const python = path.join(runtime, "bin", "python");
const run = (tool, args) => {
	const result = spawnSync(tool, args, { stdio: "inherit" });
	if (result.error || result.status !== 0)
		throw result.error ?? new Error(`${tool} failed`);
};
await mkdir(model, { recursive: true });
if (!existsSync(python)) run("python3", ["-m", "venv", runtime]);
run(python, ["-m", "pip", "install", "torch==2.10.0", "numpy==2.4.2"]);
const base =
	"https://raw.githubusercontent.com/HuiZeng/Image-Adaptive-3DLUT/b491f6df64a588864739a157db271e5c848e1805";
for (const [name, hash] of Object.entries({
	"LUTs.pth":
		"c1bb2bc4b7239c1a7e96159f5923123ba796b1fceb0b8c3132b423ea825b821a",
	"classifier.pth":
		"bae9865395625ecae58cfe86147e521093bb1e29e7b2544e02adb238b8035021",
})) {
	const target = path.join(model, name);
	const valid = (bytes) =>
		createHash("sha256").update(bytes).digest("hex") === hash;
	if (existsSync(target) && valid(await readFile(target))) continue;
	const response = await fetch(`${base}/pretrained_models/sRGB/${name}`);
	if (!response.ok)
		throw new Error(`Model download failed: ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (!valid(bytes)) throw new Error(`Model checksum mismatch: ${name}`);
	await writeFile(`${target}.tmp`, bytes);
	await rename(`${target}.tmp`, target);
}
console.log("Image-Adaptive-3DLUT sRGB model is ready locally.");
