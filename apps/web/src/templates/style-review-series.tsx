"use client";

import { useState, type ReactNode } from "react";
import type { ReviewRecord } from "./style-reviews";

type CaseResult = {
	index: number;
	total: number;
	current?: boolean;
	evidenceCurrent?: boolean;
	meetsInternalThreshold: boolean;
	listened: boolean;
	aestheticQualityVerified: boolean;
};

export type ReviewSeriesRecord = {
	id: string;
	current: boolean;
	evidenceCurrent: boolean;
	total: number;
	meetsInternalThreshold: boolean;
	listened: boolean;
	aestheticQualityVerified: boolean;
	evidenceCount: number;
	caseResults: CaseResult[];
	submission: {
		rationale: string;
		coverage: string;
		limitations: string;
		cases: (ReviewRecord["submission"] & { rationale: string })[];
	};
};

function forStyle(records: ReviewSeriesRecord[] | null, assetId: string) {
	return records?.filter(record => record.submission.cases[0]?.application.assetId === assetId) ?? [];
}

function isCurrent(record: ReviewSeriesRecord, revision: number) {
	return record.current && record.evidenceCurrent && record.submission.cases[0]?.application.assetRevision === revision;
}

export function ReviewSeriesSummary({ records, error, assetId, revision }: {
	records: ReviewSeriesRecord[] | null; error: string; assetId: string; revision: number;
}) {
	if (error) return <span className="tw-style-review-summary">跨输入评审读取失败</span>;
	const current = forStyle(records, assetId).filter(record => isCurrent(record, revision));
	if (!current.length) return null;
	if (current.length === 1) {
		const record = current[0];
		return <span className="tw-style-review-summary" data-qualified={record.meetsInternalThreshold}>
			跨输入评审 · 最低 {record.total}/100 · {record.submission.cases.length} 个应用 · {record.aestheticQualityVerified ? "审美已验收" : "待最终审美验收"}
		</span>;
	}
	return <span className="tw-style-review-summary">跨输入评审 · {current.length} 份当前记录</span>;
}

function SeriesDetails({ record, historical, renderCase }: {
	record: ReviewSeriesRecord;
	historical: boolean;
	renderCase: (record: ReviewRecord, historical: boolean) => ReactNode;
}) {
	const [expanded, setExpanded] = useState(false);
	return <details onToggle={event => { if (event.target === event.currentTarget) setExpanded(event.currentTarget.open); }}>
		<summary>{historical ? "历史跨输入评审" : "跨输入评审"} · 最低 {record.total}/100 · {record.submission.cases.length} 个应用 / {record.evidenceCount} 份成片</summary>
		{expanded && <>
			<p>{record.meetsInternalThreshold ? "所有应用达到内部阈值" : "仍有应用需要完善"} · {record.listened ? "全部已记录试听" : "尚未全部试听"} · {record.aestheticQualityVerified ? "审美已验收" : "待最终审美验收"}</p>
			{historical && <p>此记录的版本或证据已变化，不适用于当前版本。</p>}
			<p>应用策略：{record.submission.rationale}</p>
			<p>覆盖范围：{record.submission.coverage}</p>
			<p>适用限制：{record.submission.limitations}</p>
			{record.submission.cases.map((entry, index) => {
				const result = record.caseResults.find(result => result.index === index);
				if (!result) return <p key={index} role="alert">应用 {index + 1} 的评审结果缺失。</p>;
				return <div key={index}>
					<p><strong>应用 {index + 1} 调整原因：</strong>{entry.rationale}</p>
					{renderCase({
						id: `${record.id}-${index}`,
						current: result.current === true,
						evidenceCurrent: result.evidenceCurrent === true,
						total: result.total,
						meetsInternalThreshold: result.meetsInternalThreshold,
						listened: result.listened,
						aestheticQualityVerified: result.aestheticQualityVerified,
						submission: entry,
					}, historical || !result.current)}
				</div>;
			})}
		</>}
	</details>;
}

export function ReviewSeriesDetails({ records, error, assetId, revision, renderCase }: {
	records: ReviewSeriesRecord[] | null; error: string; assetId: string; revision: number;
	renderCase: (record: ReviewRecord, historical: boolean) => ReactNode;
}) {
	if (error) return <p role="alert">跨输入评审读取失败：{error}</p>;
	if (records === null) return <p>正在读取跨输入评审…</p>;
	return <>{forStyle(records, assetId).map(record => <SeriesDetails key={record.id} record={record} historical={!isCurrent(record, revision)} renderCase={renderCase}/>)}</>;
}
