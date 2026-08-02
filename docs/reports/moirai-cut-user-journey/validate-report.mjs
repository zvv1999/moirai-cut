import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportPath = fileURLToPath(new URL("./index.html", import.meta.url));
const report = readFileSync(reportPath, "utf8");
const base = dirname(reportPath);
const sources = [...report.matchAll(/<img\s+src="([^"]+)"/g)].map(
	(match) => match[1],
);

if (sources.length < 3)
	throw new Error("Report needs at least three real UI captures.");
for (const source of sources) {
	if (source.startsWith("data:") || source.startsWith("http")) {
		throw new Error(`Report image must be a repository capture: ${source}`);
	}
	if (!existsSync(resolve(base, source))) {
		throw new Error(`Missing report image: ${source}`);
	}
}
for (const required of [
	"开始完整创作",
	"$moirai-cut-create",
	"真实产品截图",
	"还缺什么",
	"86",
]) {
	if (!report.includes(required))
		throw new Error(`Missing report text: ${required}`);
}

console.log(
	`Validated real user-journey report with ${sources.length} UI captures.`,
);
