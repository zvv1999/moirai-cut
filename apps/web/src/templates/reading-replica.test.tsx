import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReadingReplicaControls } from "./reading-replica-controls";
import { readingDiagnosticKey, ReadingDiagnosticResultPanel, type ReadingDiagnosticResult } from "./reading-diagnostic";

function select(tree: ReactNode): Record<string, any> {
	let result: Record<string, any> | undefined;
	function visit(node: ReactNode) { Children.forEach(node, child => {
		if (!isValidElement<Record<string, any>>(child)) return;
		if (child.type === "select") result = child.props;
		visit(child.props.children);
	}); }
	visit(tree);
	if (!result) throw new Error("Missing reading selector");
	return result;
}
const main = { id: "main", description: "主字", features: { representation: "text", role: "emphasis" } };
const echo = { id: "echo", description: "彩色重影", features: { representation: "text", role: "decoration" } };

test("a reading relation edits only its reference; assigning it does not silently change the semantic role", () => {
	let value: string | null = "initial";
	const tree = ReadingReplicaControls({ element: echo, elements: [main, echo], relations: [], onChange: next => { value = next; } });
	select(tree).onChange({ target: { value: "main" } });
	expect(value).toBe("main");
	expect(echo.features.role).toBe("decoration");
	select(tree).onChange({ target: { value: "" } });
	expect(value).toBeNull();
	expect(select(ReadingReplicaControls({ element: main, elements: [main, echo], relations: [], onChange() {} })).disabled).toBe(true);
});

test("an invalid existing reference stays visible and removable after role or layer changes", () => {
	let removed = false;
	const tree = ReadingReplicaControls({ element: main, elements: [main, echo], relations: [{ elementId: "main", primaryId: "missing" }], onChange: value => { removed = value === null; } });
	expect(select(tree).value).toBe("missing");
	expect(select(tree).disabled).toBe(false);
	expect(renderToStaticMarkup(tree)).toContain("需修复的关联：missing");
	select(tree).onChange({ target: { value: "" } });
	expect(removed).toBe(true);
});

const target = { batchId: "batch", itemIndex: 0, fixtureId: 1, outputSha256: "sha", requestFingerprint: "fixture-hash" };
const form = { viewportWidthPx: "390", minFontSizePx: "18", maxLines: "2", budgets: { main: { stableStartSeconds: "1.2", stableSeconds: "1.4", requiredStableSeconds: "1" } } };
const result: ReadingDiagnosticResult = {
	production: target, basis: "frozen_production_measurements",
	primaryInstances: [], instances: [{ elementId: "main", templateElementId: "primary", templateInstanceId: "event-1", content: "重点词", availableSeconds: 2, startSeconds: 1, endSeconds: 3, timingStatus: "passed", isReplica: false }],
	geometryCheck: { status: "passed", records: [] }, timingCheck: { status: "passed", missingElementIds: [], exemptElementIds: ["echo"] },
	replicaIdentityCheck: { status: "passed", records: [{ elementId: "echo", primaryId: "main", status: "passed", independentTimingExempt: true, primaryTimingPassed: true }] },
	visualCheck: { status: "unverified" }, timingEvidence: "caller_supplied", aestheticQualityVerified: false, listened: false,
};

test("changing any evidence target, threshold or caller observation invalidates the prior result synchronously", () => {
	const original = readingDiagnosticKey(target, form);
	for (const [field, value] of Object.entries({ batchId: "other", itemIndex: 2, fixtureId: 3, outputSha256: "other-sha", requestFingerprint: "other-fixture" })) {
		expect(readingDiagnosticKey({ ...target, [field]: value }, form)).not.toBe(original);
		expect(renderToStaticMarkup(<ReadingDiagnosticResultPanel result={result} target={{ ...target, [field]: value }}/>)).toContain("请重新检查");
	}
	for (const field of ["viewportWidthPx", "minFontSizePx", "maxLines"] as const) expect(readingDiagnosticKey(target, { ...form, [field]: "999" })).not.toBe(original);
	for (const field of ["stableStartSeconds", "stableSeconds", "requiredStableSeconds"] as const) expect(readingDiagnosticKey(target, { ...form, budgets: { main: { ...form.budgets.main, [field]: "9" } } })).not.toBe(original);
});

test("structural timing exemption never presents visual or listening acceptance", () => {
	const html = renderToStaticMarkup(<ReadingDiagnosticResultPanel result={result} target={target}/>);
	expect(html).toContain("沿用主字的停留预算");
	expect(html).toContain("稳定时长由本次观察填写");
	expect(html).toContain("遮挡和重影干扰尚未验证");
	const failed = { ...result, replicaIdentityCheck: { status: "partial" as const, records: [{ ...result.replicaIdentityCheck.records[0], independentTimingExempt: false, primaryTimingPassed: false }] } };
	const failedHtml = renderToStaticMarkup(<ReadingDiagnosticResultPanel result={failed} target={target}/>);
	expect(failedHtml).toContain("主字尚未满足阅读条件");
	expect(failedHtml).not.toContain("沿用主字的停留预算");
});

test("an exempt replica still exposes a failed font or boundary measurement", () => {
	const value: ReadingDiagnosticResult = { ...result, geometryCheck: { status: "failed", records: [{ elementId: "echo", status: "failed", recordCount: 4, measuredMinFontSizePx: 8, maxLineCount: 1, overflowing: false, fontCheck: "replica_sampled_frames", sampledBoundaryStatus: "warning" }] } };
	const html = renderToStaticMarkup(<ReadingDiagnosticResultPanel result={value} target={target}/>);
	expect(html).toContain("排版：需要调整");
	expect(html).toContain("副本全部采样在当前观看宽度下最小字号 8.00 px");
	expect(html).toContain("采样中有画布越界");
	expect(html).toContain("沿用主字的停留预算");
});


test("each reading relation identifies the edited layer in the visible legend", () => {
    const html=renderToStaticMarkup(ReadingReplicaControls({element:echo,elements:[main,echo],relations:[],onChange(){}}));
    expect(html).toContain(`${echo.description} · 文字阅读关系`);
});

test("native geometry limitations are shown without UI granting exemptions",()=>{
 const value:ReadingDiagnosticResult={...result,geometryEvidence:{coverage:null,completeRecordPoses:false,droppedRecords:3,partialReasons:["legacy_first_pose_only","dropped_records"],producerAuthenticated:false,independentlyVerified:false},geometryCheck:{status:"partial",records:[{elementId:"main",status:"partial",recordCount:2,sampledBoundaryStatus:"partial",partialReasons:["missing_stable_interval","incomplete_stable_frames","incomplete_active_frames"]}]},replicaIdentityCheck:{status:"partial",records:[{...result.replicaIdentityCheck.records[0],independentTimingExempt:false,primaryTimingPassed:false}]}};
 const html=renderToStaticMarkup(<ReadingDiagnosticResultPanel result={value} target={target}/>);
 for(const expected of ["旧记录仅有首帧姿态","部分姿态记录因容量限制被省略","未提供完整稳定阅读区间","稳定阅读区间内的帧未完整测量","文字显示范围内的帧未完整测量","画面边界采样不完整","测量来源未经独立认证"])expect(html).toContain(expected);
 expect(html).not.toContain("沿用主字的停留预算");
 const current={...value,geometryEvidence:{...value.geometryEvidence!,coverage:"constant_record_pose_v1",completeRecordPoses:true,partialReasons:[]}};
 const currentHtml=renderToStaticMarkup(<ReadingDiagnosticResultPanel result={current} target={target}/>);
 expect(currentHtml).toContain("测量按文字与分组变换分别记录采样区间");expect(currentHtml).toContain("排版：证据不完整");
});
