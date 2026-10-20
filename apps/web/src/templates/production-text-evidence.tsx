"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ExportTextMeasurements } from "@/services/renderer/export-text-measurements";
import { ProductionReadingDiagnostic } from "./reading-diagnostic";

export type ProductionTextEvidence =
	| (ExportTextMeasurements & { outputSha256: string })
	| { status: "not_measured" };

type EvidenceFixture = { fixture: number; sha256: string };

/** Request identity also changes when the same item receives different media. */
export function reviewTextEvidenceKey(batchId: string, item: number, fixtures: EvidenceFixture[]) {
	return JSON.stringify([batchId, item, fixtures.map(({ fixture, sha256 }) => [fixture, sha256])]);
}

/** Display native production facts. No fit, reading budget or quality decision runs here. */
export function ProductionTextEvidencePanel({ evidence, previewSha256 }: {
	evidence?: ProductionTextEvidence;
	previewSha256: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const [visibleCount, setVisibleCount] = useState(20);
	if (!evidence || evidence.status === "not_measured") {
		return <p>文字排版：未测量。需要重新生成支持测量的成片。</p>;
	}
	if (evidence.outputSha256 !== previewSha256) {
		return <p role="alert">成片已变化，无法使用这份文字排版记录。</p>;
	}
	return <details onToggle={event => {
		if (event.target !== event.currentTarget) return;
		setExpanded(event.currentTarget.open);
		if (!event.currentTarget.open) setVisibleCount(20);
	}}>
		<summary>文字排版 · {evidence.records.length} 条记录 · 已采样 {evidence.framesObserved} 帧</summary>
        <p>{evidence.geometryCoverage === "constant_record_pose_v1" ? "已记录各采样区间的文字与分组变换；相同姿态的连续帧合并显示。是否完整请结合省略记录和阅读诊断。" : "旧版记录仅保留每段的首帧姿态，不能检查动态稳定区间的字号与边界。需要重新导出成片。"}</p>
		{expanded && <>
			{evidence.droppedRecords > 0 && <p role="alert">测量记录不完整：已省略 {evidence.droppedRecords} 次记录。</p>}
			<p>字号为缩放前的像素值，小屏效果请对照成片。采样区间不等于稳定阅读时长；无溢出也不代表字够大或没有遮挡。</p>
			{evidence.records.length === 0 && <p>本次导出未记录文字排版，请结合实际内容检查。</p>}
			{evidence.records.slice(0, visibleCount).map((record, index) => <section key={`${record.source.elementId}-${record.sceneTime}-${index}`} style={{ marginBlock: 12, overflowWrap: "anywhere" }}>
				<strong>场景时间 {(record.sceneTime / evidence.timebase).toFixed(2)}–{(record.lastSceneTime / evidence.timebase).toFixed(2)} 秒 · {record.layout.fontSizePx.toFixed(2)} px · {record.layout.lineCount} 行</strong>
				<p style={{ whiteSpace: "pre-wrap" }}>{record.layout.lines.join("\n")}</p>
				<p>文本区域：{record.layout.limits.maxWidthPx <= 0 ? "宽度未设上限" : record.layout.overflow.width ? "宽度溢出" : "宽度未溢出"} · {record.layout.limits.maxHeightPx <= 0 ? "高度未设上限" : record.layout.overflow.height ? "高度溢出" : "高度未溢出"} · {record.layout.limits.maxLines <= 0 ? "行数未设上限" : record.layout.overflow.lines ? "行数超限" : "行数未超限"}</p>
				{record.layout.secondary && <p style={{ whiteSpace: "pre-wrap" }}>副语言 · {record.layout.secondary.fontSizePx.toFixed(2)} px · {record.layout.secondary.lineCount} 行{"\n"}{record.layout.secondary.lines.join("\n")}</p>}
			</section>)}
			{visibleCount < evidence.records.length && <Button variant="outline" size="sm" onClick={() => setVisibleCount(count => count + 20)}>再看 20 条</Button>}
			<p>实际回退字体未核实；这些记录不改变评分或试听状态。</p>
		</>}
	</details>;
}

/** Mounted only while review media is expanded; fetching never mutates the project. */
export function ReviewTextEvidence({ batchId, item, fixtures }: {
	batchId: string;
	item: number;
	fixtures: EvidenceFixture[];
}) {
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<{ key: string; previews?: { fixture: number; sha256: string; requestFingerprint?: string; textMeasurements?: ProductionTextEvidence }[]; error?: string }>();
	const key = reviewTextEvidenceKey(batchId, item, fixtures);
	useEffect(() => {
		const controller = new AbortController();
		setState({ key });
		void (async () => {
			try {
				const response = await fetch(`/api/footage/templates/production/${encodeURIComponent(batchId)}/items/${item}`, { signal: controller.signal });
				const data = await response.json();
				if (!response.ok) throw new Error(data.error ?? "无法读取成片排版记录");
				if (!controller.signal.aborted) setState({ key, previews: data.previews ?? [] });
			} catch (error) {
				if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : "无法读取成片排版记录" });
			}
		})();
		return () => controller.abort();
	}, [batchId, item, key, attempt]);
	if (!state || state.key !== key) return <p>正在读取成片排版记录…</p>;
	if (state.error) return <p role="alert">排版记录读取失败：{state.error} <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>重试</Button></p>;
	if (!state.previews) return <p>正在读取成片排版记录…</p>;
	return <div>{fixtures.map(fixture => {
		const preview = state.previews?.find(entry => entry.fixture === fixture.fixture && entry.sha256 === fixture.sha256);
		return <section key={`${fixture.fixture}-${fixture.sha256}`}>
			<p>样例 {fixture.fixture + 1} · 排版记录</p>
			{preview ? <ProductionTextEvidencePanel key={preview.sha256} evidence={preview.textMeasurements} previewSha256={preview.sha256}/> : <p role="alert">关联成片证据已变化，不能使用当前排版记录。</p>}
			{preview && <ProductionReadingDiagnostic batchId={batchId} itemIndex={item} fixtureId={preview.fixture} outputSha256={preview.sha256} requestFingerprint={preview.requestFingerprint}/>}
		</section>;
	})}</div>;
}
