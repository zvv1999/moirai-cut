import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewSeriesDetails, ReviewSeriesSummary, type ReviewSeriesRecord } from "./style-review-series";

// Rendering contract only; the native service owns score and validity decisions.
const series = {
	id: "series-a", current: true, evidenceCurrent: true, total: 87,
	meetsInternalThreshold: false, listened: false, aestheticQualityVerified: false,
	evidenceCount: 3,
	submission: { rationale: "Preserve diagram", coverage: "Three inputs", limitations: "No listening", cases: [
		{ application: { assetId: "quote", assetRevision: 1 } },
		{ application: { assetId: "quote", assetRevision: 1 } },
		{ application: { assetId: "quote", assetRevision: 1 } },
	] },
	caseResults: [],
} as unknown as ReviewSeriesRecord;

test("series summary displays native weakest-case score and leaves final listening pending", () => {
	const html = renderToStaticMarkup(<ReviewSeriesSummary records={[series]} error="" assetId="quote" revision={1}/>);
	expect(html).toContain("最低 87/100");
	expect(html).toContain("3 个应用");
	expect(html).toContain("待最终审美验收");
	expect(html).toContain('data-qualified="false"');
});

test("outdated style or changed media never appears as a current series score", () => {
	for (const record of [{ ...series, current: false }, { ...series, evidenceCurrent: false }]) {
		expect(renderToStaticMarkup(<ReviewSeriesSummary records={[record]} error="" assetId="quote" revision={1}/>)).toBe("");
	}
	expect(renderToStaticMarkup(<ReviewSeriesSummary records={[series]} error="" assetId="quote" revision={2}/>)).toBe("");
	expect(renderToStaticMarkup(<ReviewSeriesSummary records={[series]} error="" assetId="different" revision={1}/>)).toBe("");
	const html = renderToStaticMarkup(<ReviewSeriesDetails records={[{ ...series, current: false }]} error="" assetId="quote" revision={1} renderCase={() => <video/>}/>);
	expect(html).toContain("历史跨输入评审");
	expect(html).not.toContain("<video");
});

test("loading failures remain explicit and multiple series do not select the highest score", () => {
	const html = renderToStaticMarkup(<ReviewSeriesSummary records={[series, { ...series, id: "second", total: 96 }]} error="" assetId="quote" revision={1}/>);
	expect(html).toContain("2 份当前记录");
	expect(html).not.toContain("96");
	expect(renderToStaticMarkup(<ReviewSeriesDetails records={null} error="service unavailable" assetId="quote" revision={1} renderCase={() => null}/>)).toContain('role="alert"');
});
