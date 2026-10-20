"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Preview = {
	revision: number;
	mediaUrl: string;
	captionsUrl: string;
	width: number;
	height: number;
	batchId: string;
		qualityReview?: {
			total: number;
			meetsInternalThreshold: boolean;
			aestheticQualityVerified?: boolean;
		review: {
			templateRevision: number;
			reviewer: string;
			inspection: string;
			limitations: string;
			listened: boolean;
			blockingFindings: string[];
			composition: Criterion;
			motion: Criterion;
			assets: Criterion;
			adaptation: Criterion;
			editability: Criterion;
		};
	} | null;
};
type Criterion = { score: number; rationale: string };

export function SavedTemplatePreview({ id, revision, dirty, onPreview, onEdit }: {
	id: string;
	revision: number;
	dirty: boolean;
	onPreview: () => void;
	onEdit: () => void;
}) {
	const [preview, setPreview] = useState<Preview | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setPreview(null);
		setError("");
		void (async () => {
			try {
				const response = await fetch("/api/footage/templates/previews", {
					cache: "no-store", signal: controller.signal,
				});
				const data = await response.json();
				if (!response.ok) throw new Error(data.error ?? "样例加载失败");
				const candidate: Preview | undefined = data.previews[id];
				if (!controller.signal.aborted)
					setPreview(candidate?.revision === revision ? candidate : null);
			} catch (e) {
				if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "样例加载失败");
			} finally {
				if (!controller.signal.aborted) setLoading(false);
			}
		})();
		return () => controller.abort();
	}, [id, revision, attempt]);
	return (
		<section className="tw-saved-preview" aria-label="模板成片样例">
			{!dirty && <Link href={`/templates/production?template=${encodeURIComponent(id)}`}>使用模板</Link>}
			{dirty && <p role="status">有未保存修改，以下为已保存版本的样例。</p>}
			{loading ? <p>正在加载成片…</p> : error ? (
				<div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(attempt + 1)}><RefreshCw />重新加载</Button></div>
			) : preview ? (
				<>
					<video key={preview.mediaUrl} controls playsInline preload="metadata"
						src={preview.mediaUrl} aria-label="模板成片播放"
						style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
						onError={() => setError("成片播放失败，请重新加载。")}
					>
						<track kind="captions" src={preview.captionsUrl} srcLang="zh" label="中文字幕" />
					</video>
					<p>已保存版本 v{preview.revision} · 样例素材 · {preview.qualityReview ? `内部评审 ${preview.qualityReview.total} 分${preview.qualityReview.meetsInternalThreshold ? " · 内部评分达标" : " · 需返修"}${preview.qualityReview.aestheticQualityVerified === true ? " · 审美已验收" : " · 待最终审美验收"}` : "待质量审片"}</p>
					{preview.qualityReview && <details className="tw-quality-report" aria-label="质量报告">
						<summary>评分依据与检查范围</summary>
						<p>评审：{preview.qualityReview.review.reviewer} · v{preview.qualityReview.review.templateRevision}</p>
						<dl>{([
							["构图与可读性", "composition", 25], ["动效与节奏", "motion", 25],
							["素材与风格", "assets", 20], ["适配能力", "adaptation", 20], ["可编辑性", "editability", 10],
						] as const).map(([name, key, max]) => <div key={key}>
							<dt>{name} {preview.qualityReview!.review[key].score}/{max}</dt>
							<dd>{preview.qualityReview!.review[key].rationale}</dd>
						</div>)}</dl>
						<p>{preview.qualityReview.review.inspection}</p>
						<p>{preview.qualityReview.review.listened ? "已试听" : "未试听"} · {preview.qualityReview.review.limitations}</p>
						{preview.qualityReview.review.blockingFindings.map((finding, index) => <p key={index} role="alert">{finding}</p>)}
					</details>}
					<Link href={`/templates/production?batch=${encodeURIComponent(preview.batchId)}`}>查看生产批次</Link>
				</>
			) : <div>
				<p>当前版本暂无成片</p>
				<div className="tw-preview-actions">
					<Button onClick={onPreview}><Play />生成试映</Button>
					<Button variant="outline" onClick={onEdit}><Pencil />编辑模板</Button>
				</div>
			</div>}
		</section>
	);
}
