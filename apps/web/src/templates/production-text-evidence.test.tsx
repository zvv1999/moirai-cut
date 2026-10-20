import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductionTextEvidencePanel, reviewTextEvidenceKey, type ProductionTextEvidence } from "./production-text-evidence";

const emptyMeasurement: ProductionTextEvidence = {
	version: 1, status: "sampled", producer: "production-scene-exporter", timebase: 120000,
	framesObserved: 420, droppedRecords: 0, records: [], outputSha256: "preview-a",
};

test("review request identity invalidates on same-item fixture or output changes", () => {
	const original = reviewTextEvidenceKey("batch-a", 0, [{ fixture: 0, sha256: "preview-a" }]);
	expect(reviewTextEvidenceKey("batch-a", 0, [{ fixture: 0, sha256: "preview-a" }])).toBe(original);
	for (const key of [
		reviewTextEvidenceKey("batch-b", 0, [{ fixture: 0, sha256: "preview-a" }]),
		reviewTextEvidenceKey("batch-a", 1, [{ fixture: 0, sha256: "preview-a" }]),
		reviewTextEvidenceKey("batch-a", 0, [{ fixture: 1, sha256: "preview-a" }]),
		reviewTextEvidenceKey("batch-a", 0, [{ fixture: 0, sha256: "preview-b" }]),
	]) expect(key).not.toBe(original);
});

test("legacy and absent evidence remain unmeasured", () => {
	for (const evidence of [undefined, { status: "not_measured" } as const]) {
		const html = renderToStaticMarkup(<ProductionTextEvidencePanel evidence={evidence} previewSha256="preview-a"/>);
		expect(html).toContain("未测量");
		expect(html).not.toContain("已采样");
	}
});

test("mismatched output evidence never displays as current measured facts", () => {
	const html = renderToStaticMarkup(<ProductionTextEvidencePanel evidence={emptyMeasurement} previewSha256="preview-b"/>);
	expect(html).toContain('role="alert"');
	expect(html).toContain("成片已变化");
	expect(html).not.toContain("已采样");
});

test("a sampled empty result retains its measured status instead of legacy fallback", () => {
	const html = renderToStaticMarkup(<ProductionTextEvidencePanel evidence={emptyMeasurement} previewSha256="preview-a"/>);
	expect(html).toContain("0 条记录");
	expect(html).toContain("已采样 420 帧");
	expect(html).not.toContain("未测量");
	expect(html).not.toContain("可读性通过");
});

test("historical first-pose evidence is distinct from explicitly marked pose records",()=>{
 const legacy=renderToStaticMarkup(<ProductionTextEvidencePanel evidence={emptyMeasurement} previewSha256="preview-a"/>);
 expect(legacy).toContain("旧版记录仅保留每段的首帧姿态");
 expect(legacy).toContain("不能检查动态稳定区间的字号与边界");
 const current=renderToStaticMarkup(<ProductionTextEvidencePanel evidence={{...emptyMeasurement,geometryCoverage:"constant_record_pose_v1"} as ProductionTextEvidence} previewSha256="preview-a"/>);
 expect(current).toContain("已记录各采样区间的文字与分组变换");
 expect(current).not.toContain("旧版记录");expect(current).not.toContain("验收通过");
});
