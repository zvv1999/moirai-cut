"use client";
import { useState } from "react";
import type { FootageLineage } from "./types";

export function FootageOrigin({ value }: { value: FootageLineage }) {
	return (
		<div className="space-y-1 border-t p-3 text-xs">
			<a
				className="underline"
				href={`/footage?shot=${encodeURIComponent(value.shotId)}`}
				target="_blank"
				rel="noreferrer"
			>
				素材来源 · v{value.shotRevision}
			</a>
			<p className="break-words">
				{value.sourceName} ·{" "}
				{(value.sourceStartTicks / value.ticksPerSecond).toFixed(2)}–
				{(value.sourceEndTicks / value.ticksPerSecond).toFixed(2)} s
			</p>
			<p className="break-words">{value.description}</p>
			<p>{value.tags.join(" · ")}</p>
			{value.unsupportedClaims.length > 0 && (
				<p className="text-amber-600">
					使用限制：{value.unsupportedClaims.join("；")}
				</p>
			)}
		</div>
	);
}

interface LineageResult {
	source: { name: string; id: string; sha256: string; batch: string };
	analysisRunId: string;
	versions: Array<{ revision: number; status: string }>;
	reviews: Array<{ id: string; revision: number; action: string }>;
	releases: Array<{ id: string; shot: { revision: number } }>;
	uses: Array<{
		projectId: string;
		projectName: string;
		mediaId: string;
		shotRevision: number;
		elements: Array<{ elementId: string }>;
	}>;
	warnings: string[];
}
export function ShotLineage({ shotId }: { shotId: string }) {
	const [value, setValue] = useState<LineageResult | null>(null);
	const [error, setError] = useState("");
	const load = async () => {
		setError("");
		try {
			const response = await fetch(`/api/footage/lineage/${shotId}`);
			const result = await response.json();
			if (!response.ok) throw new Error(result.error);
			setValue(result);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	return (
		<details
			className="border-t py-3 text-sm"
			onToggle={(e) => {
				if (e.currentTarget.open) void load();
			}}
		>
			<summary className="cursor-pointer">来源与工程关联</summary>
			{error && <p role="alert">{error}</p>}
			{value && (
				<div className="space-y-2 break-words pt-3">
					<p>原片：{value.source.name}</p>
					<p className="text-xs">
						原片 ID：{value.source.id}
						<br />
						SHA-256：{value.source.sha256}
						<br />
						分析批次：{value.analysisRunId || "人工创建"}
					</p>
					<p>
						保存版本：
						{value.versions.map((v) => `v${v.revision}`).join("、") ||
							"当前版本"}{" "}
						· 审核记录 {value.reviews.length} 条 · 发布版本{" "}
						{value.releases.length} 个
					</p>
					{value.uses.length === 0 && <p>暂无工程引用</p>}
					{value.uses.map((use) => (
						<p key={`${use.projectId}-${use.mediaId}`}>
							<a
								className="underline"
								href={`/editor/${encodeURIComponent(use.projectId)}`}
							>
								{use.projectName || use.projectId}
							</a>{" "}
							· v{use.shotRevision} · 时间线 {use.elements.length} 处
						</p>
					))}
					{value.warnings.map((w) => (
						<p key={w} role="alert">
							{w}
						</p>
					))}
				</div>
			)}
		</details>
	);
}
