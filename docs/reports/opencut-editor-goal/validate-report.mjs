import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot = path.dirname(fileURLToPath(import.meta.url));
const reportDataPath = path.join(reportRoot, "report-data.json");
const reportHtmlPath = path.join(reportRoot, "index.html");

function range(prefix, count) {
	return Array.from(
		{ length: count },
		(_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`,
	);
}

const expectedFeatureIds = [
	...range("W", 8),
	...range("M", 7),
	...range("T", 8),
	...range("A", 7),
	...range("C", 7),
	...range("V", 8),
	...range("R", 8),
	...range("E", 7),
	...range("G", 8),
	...range("Q", 6),
];

const report = JSON.parse(await readFile(reportDataPath, "utf8"));
const html = await readFile(reportHtmlPath, "utf8");
const failures = [];

function check(condition, message) {
	if (!condition) failures.push(message);
}

const completedIds = new Set(report.greenFeatureIds);
const evidencedIds = new Set(
	report.evidence.flatMap((entry) => entry.featureIds ?? []),
);
const screenshotRefs = report.evidence.flatMap(
	(entry) => entry.screenshots ?? [],
);
const uniqueScreenshots = new Set(screenshotRefs);

check(report.status === "COMPLETE", "report status must be COMPLETE");
check(
	report.summary.cataloguedCapabilities === expectedFeatureIds.length,
	`catalogued capability count must be ${expectedFeatureIds.length}`,
);
check(
	report.summary.greenCapabilities === expectedFeatureIds.length,
	`completed capability count must be ${expectedFeatureIds.length}`,
);
check(
	expectedFeatureIds.every((featureId) => completedIds.has(featureId)),
	"every catalogued feature ID must be completed",
);
check(
	expectedFeatureIds.every((featureId) => evidencedIds.has(featureId)),
	"every catalogued feature ID must have an evidence-ledger entry",
);
check(
	report.summary.archivedScreenshots === screenshotRefs.length,
	"summary screenshot count must equal the evidence catalogue",
);
check(
	uniqueScreenshots.size === screenshotRefs.length,
	"screenshot references must be unique",
);
check(
	html.includes("COMPLETE · M7"),
	"HTML report must expose the final COMPLETE state",
);

for (const screenshotRef of screenshotRefs) {
	const screenshotName = path.basename(screenshotRef);
	const featureMatch = screenshotName.match(/^(M0|[A-Z][0-9]{2})-/);
	check(
		Boolean(featureMatch),
		`${screenshotName} must start with a stable feature ID`,
	);
	check(
		html.includes(screenshotRef),
		`${screenshotRef} must be visible in the HTML catalogue`,
	);

	const screenshotPath = path.join(reportRoot, screenshotRef);
	try {
		const file = await stat(screenshotPath);
		check(
			file.size > 1024,
			`${screenshotRef} must not be an empty placeholder`,
		);
		const signature = await readFile(screenshotPath);
		const isPng =
			signature[0] === 0x89 &&
			signature[1] === 0x50 &&
			signature[2] === 0x4e &&
			signature[3] === 0x47;
		const isJpeg = signature[0] === 0xff && signature[1] === 0xd8;
		check(isPng || isJpeg, `${screenshotRef} must be PNG or JPEG image data`);
	} catch {
		failures.push(`${screenshotRef} is missing`);
	}
}

if (failures.length > 0) {
	console.error("HoloCut goal report validation failed:");
	for (const failure of failures) console.error(`- ${failure}`);
	process.exitCode = 1;
} else {
	console.log(
		`HoloCut goal report valid: ${expectedFeatureIds.length} capabilities, ` +
			`${report.summary.automatedTestsPassing} tests, ` +
			`${screenshotRefs.length} screenshots.`,
	);
}
