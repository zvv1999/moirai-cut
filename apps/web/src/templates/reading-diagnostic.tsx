"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type CheckStatus = "passed" | "failed" | "partial" | "unverified" | "not_requested";
type GeometryPartialReason = "legacy_first_pose_only" | "dropped_records" | "missing_stable_interval" | "incomplete_stable_frames" | "incomplete_active_frames";
type Budget = { elementId: string; stableStartSeconds?: number; stableSeconds: number; requiredStableSeconds: number };
type Instance = {
	elementId: string;
	templateElementId: string | null;
	templateInstanceId: string | null;
	content: string;
	availableSeconds: number;
	startSeconds: number;
	endSeconds: number;
	timingStatus: CheckStatus;
	isReplica: boolean;
};
export type ReadingDiagnosticResult = {
	production: { batchId: string; itemIndex: number; fixtureId: number; outputSha256: string; requestFingerprint: string };
	basis: "frozen_production_measurements";
	geometryEvidence?: {coverage:string|null;completeRecordPoses:boolean;droppedRecords:number;partialReasons:GeometryPartialReason[];producerAuthenticated:false;independentlyVerified:false};
	primaryInstances: Instance[];
	instances: Instance[];
	geometryCheck: { status: CheckStatus; records: {
		elementId: string; status: CheckStatus; recordCount: number;
		measuredMinFontSizePx?: number | null; maxLineCount?: number | null; overflowing?: boolean;
		sampledBoundaryStatus?: "passed" | "warning" | "unverified" | "partial";
		stableIntervalMeasured?: boolean; observedStableFrames?: number; expectedStableFrames?: number;
		fontCheck?: string;
        partialReasons?: GeometryPartialReason[];
	}[] };
	timingCheck: { status: CheckStatus; missingElementIds: string[]; exemptElementIds: string[] };
	replicaIdentityCheck: { status: CheckStatus; records: { elementId: string; primaryId: string | null; status: CheckStatus; independentTimingExempt: boolean; primaryTimingPassed: boolean }[] };
	visualCheck: { status: "unverified" };
	timingEvidence: "caller_supplied";
	aestheticQualityVerified: false;
	listened: false;
};
type Target = { batchId: string; itemIndex: number; fixtureId: number; outputSha256: string; requestFingerprint?: string };
type Form = { viewportWidthPx: string; minFontSizePx: string; maxLines: string; budgets: Record<string, { stableStartSeconds: string; stableSeconds: string; requiredStableSeconds: string }> };

/** Includes every author input so changing a budget cannot leave a previous pass visible. */
export function readingDiagnosticKey(target: Target, form: Form) {
	return JSON.stringify([target.batchId, target.itemIndex, target.fixtureId, target.outputSha256, target.requestFingerprint, form]);
}
export function readingDiagnosticMatches(result: ReadingDiagnosticResult, target: Target) {
	const p = result.production;
	return p.batchId === target.batchId && p.itemIndex === target.itemIndex && p.fixtureId === target.fixtureId && p.outputSha256 === target.outputSha256 && (!target.requestFingerprint || p.requestFingerprint === target.requestFingerprint);
}
const statuses: Record<CheckStatus, string> = { passed: "满足本次检查条件", failed: "需要调整", partial: "证据不完整", unverified: "未验证", not_requested: "未要求" };

const geometryReasons: Record<GeometryPartialReason,string> = {
 legacy_first_pose_only:"旧记录仅有首帧姿态，不能验证动态稳定区间；请重新导出",
 dropped_records:"部分姿态记录因容量限制被省略",
 missing_stable_interval:"未提供完整稳定阅读区间",
 incomplete_stable_frames:"稳定阅读区间内的帧未完整测量",
 incomplete_active_frames:"文字显示范围内的帧未完整测量",
};
const describeGeometryReasons=(reasons:GeometryPartialReason[])=>reasons.map(reason=>geometryReasons[reason]??`未识别的证据限制：${reason}`).join("；");

export function ReadingDiagnosticResultPanel({ result, target }: { result: ReadingDiagnosticResult; target: Target }) {
	if (!readingDiagnosticMatches(result, target)) return <p role="alert">成片或样例已变化，请重新检查。</p>;
	if (!result.instances.length) return <p>本次成片没有可测量的模板文字。</p>;
	const name = (id: string) => result.instances.find(entry => entry.elementId === id)?.content || id;
	return <section aria-label="当前成片阅读诊断">
		<p>排版：{statuses[result.geometryCheck.status]} · 停留预算：{statuses[result.timingCheck.status]} · 同文副本配对：{statuses[result.replicaIdentityCheck.status]}</p>
        {result.geometryEvidence && <p>{result.geometryEvidence.completeRecordPoses ? "测量按文字与分组变换分别记录采样区间。" : "本次证据没有完整区间姿态声明。"}{result.geometryEvidence.partialReasons.length>0 && `${describeGeometryReasons(result.geometryEvidence.partialReasons)}。`}测量来源未经独立认证；记录不替代实际观片。</p>}
		<details><summary>逐层排版测量 · {result.geometryCheck.records.length} 层</summary>
			{result.geometryCheck.records.map(record => <p key={record.elementId}>“{name(record.elementId)}”：{statuses[record.status]}。{record.measuredMinFontSizePx == null ? "稳定区间字号尚未测量。" : `${record.fontCheck === "replica_sampled_frames" ? "副本全部采样" : "稳定区间"}在当前观看宽度下最小字号 ${record.measuredMinFontSizePx.toFixed(2)} px。`}{record.maxLineCount != null && `最多 ${record.maxLineCount} 行。`}{record.overflowing && "存在排版溢出。"}{record.sampledBoundaryStatus === "warning" && "采样中有画布越界。"}{record.sampledBoundaryStatus === "partial" && "画面边界采样不完整。"}{record.partialReasons?.length ? `${describeGeometryReasons(record.partialReasons)}。` : null}{record.expectedStableFrames != null && `稳定区间已测 ${record.observedStableFrames ?? 0} / ${record.expectedStableFrames} 帧。`}</p>)}
		</details>
		{result.instances.filter(instance => instance.timingStatus === "failed" && !result.timingCheck.exemptElementIds.includes(instance.elementId)).map(instance => <p key={instance.elementId}>“{instance.content}”停留预算或排版需要调整。</p>)}
		{result.timingCheck.missingElementIds.length > 0 && <p>待补充稳定阅读观察：{result.timingCheck.missingElementIds.map(name).join("、")}</p>}
		{result.replicaIdentityCheck.records.map(record => <p key={record.elementId}>“{name(record.elementId)}”装饰副本：{record.independentTimingExempt ? "已配对，沿用主字的停留预算" : record.status === "passed" ? "内容已配对，主字尚未满足阅读条件" : "未能验证同一来源的内容，仍需独立阅读检查"}</p>)}
		<p>字号、行文来自当前成片测量；稳定时长由本次观察填写。画面边界、遮挡和重影干扰尚未验证，结果不代表视觉或试听验收通过。</p>
	</section>;
}

export function ProductionReadingDiagnostic(props: Target) {
	// Changing media resets both the editable observations and the instance directory.
	return <ReadingDiagnosticForm key={JSON.stringify(props)} target={props}/>;
}

function ReadingDiagnosticForm({ target }: { target: Target }) {
	const [form, setForm] = useState<Form>({ viewportWidthPx: "390", minFontSizePx: "18", maxLines: "2", budgets: {} });
	const [directory, setDirectory] = useState<Instance[]>([]);
	const [state, setState] = useState<{ key: string; result?: ReadingDiagnosticResult; error?: string }>();
	const [busy, setBusy] = useState(false);
	const active = useRef<AbortController | null>(null);
	useEffect(() => () => active.current?.abort(), []);
	const key = readingDiagnosticKey(target, form);
	const current = state?.key === key ? state : undefined;
	async function run() {
		active.current?.abort();
		const controller = new AbortController();
		active.current = controller;
		setBusy(true);
		setState({ key });
		try {
			const number = (value: string) => value.trim() ? Number(value) : NaN;
			const budgets: Budget[] = [];
			for (const [elementId, entry] of Object.entries(form.budgets)) {
				if (!entry.stableStartSeconds.trim() && !entry.stableSeconds.trim() && !entry.requiredStableSeconds.trim()) continue;
				const stableSeconds = number(entry.stableSeconds), requiredStableSeconds = number(entry.requiredStableSeconds);
				const stableStartSeconds = number(entry.stableStartSeconds);
				if (![stableStartSeconds, stableSeconds, requiredStableSeconds].every(Number.isFinite)) throw new Error("请填写稳定起点、已观察的稳定时长和需要的阅读时长，或三项同时留空。");
				budgets.push({ elementId, stableStartSeconds, stableSeconds, requiredStableSeconds });
			}
			const viewportWidthPx = number(form.viewportWidthPx), minFontSizePx = number(form.minFontSizePx), maxLines = number(form.maxLines);
			if (![viewportWidthPx, minFontSizePx, maxLines].every(Number.isFinite)) throw new Error("请填写检查标准。");
			const response = await fetch(`/api/footage/templates/production/${encodeURIComponent(target.batchId)}/items/${target.itemIndex}/reading-diagnostic`, {
				method: "POST", signal: controller.signal,
				headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
				body: JSON.stringify({ fixtureId: target.fixtureId, outputSha256: target.outputSha256, viewportWidthPx, minFontSizePx, maxLines, budgets }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? "无法读取阅读诊断");
			if (!readingDiagnosticMatches(result, target)) throw new Error("成片或样例已变化，请刷新成片后重试。");
			if (!controller.signal.aborted) { setDirectory(result.instances); setState({ key, result }); }
		} catch (error) {
			if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : "阅读诊断失败" });
		} finally { if (!controller.signal.aborted) setBusy(false); }
	}
	return <details><summary>阅读检查与同文副本</summary>
		<p>先读取当前成片的文字实例，再根据成片填写稳定阅读时长。留空会保留“证据不完整”。</p>
		<fieldset disabled={busy}><legend>本次检查标准</legend>
			{([
				["viewportWidthPx", "观看宽度（像素）", 1, 16384],
				["minFontSizePx", "该宽度下最小字号", 1, 1000],
				["maxLines", "最多行数", 1, 100],
			] as const).map(([field, label, min, max]) => <label key={field} style={{ display: "block" }}>{label}<input type="number" aria-label={label} min={min} max={max} step={field === "maxLines" ? 1 : .1} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })}/></label>)}
			{directory.map((instance, index) => {
				const budget = form.budgets[instance.elementId] ?? { stableStartSeconds: "", stableSeconds: "", requiredStableSeconds: "" };
				return <fieldset key={instance.elementId}><legend>{index + 1}. {instance.content} {instance.isReplica ? "· 装饰副本" : "· 主读文字"}</legend>
					<p>显示范围 {instance.startSeconds.toFixed(3)}–{instance.endSeconds.toFixed(3)} 秒，包含进出场；不能直接作为稳定阅读时长。{instance.isReplica && "配对成立且主字通过后，可不填独立停留预算。"}</p>
					{([ ["stableStartSeconds", "稳定起点（成片时间）"], ["stableSeconds", "观察到的稳定时长"], ["requiredStableSeconds", "需要的阅读时长"] ] as const).map(([field, label]) => <label key={field} style={{ display: "block" }}>{label}（秒）<input aria-label={`${index + 1} ${label}`} type="number" min={0} max={field === "stableStartSeconds" ? undefined : 600} step={.01} value={budget[field]} onChange={event => setForm({ ...form, budgets: { ...form.budgets, [instance.elementId]: { ...budget, [field]: event.target.value } } })}/></label>)}
				</fieldset>;
			})}
		</fieldset>
		<Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>{busy ? "检查中…" : directory.length ? "按当前填写重新检查" : "读取成片并检查排版"}</Button>
		{current?.error && <p role="alert">{current.error}</p>}
		{current?.result ? <ReadingDiagnosticResultPanel result={current.result} target={target}/> : state && !busy && !current && <p>检查条件已变化，请重新检查。</p>}
	</details>;
}
