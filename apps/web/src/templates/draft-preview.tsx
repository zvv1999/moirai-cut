"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductionCreate, type EffectPreviewSample, type TrialContentController } from "./production-create";
import type { Template } from "./types";
import { draftPreviewAspectRatio, draftPreviewIsCurrent, readDraftPreviewReceipts, rememberDraftPreview, type DraftPreviewReceipt } from "./draft-preview-state";
import "./production.css";

interface PreviewBatch {
	id: string;
	name: string;
	cancelled: boolean;
	renderJob?: { status: string; error?: string };
	job?: { status: string; error?: string };
	items: { index: number; status: string; error?: string; fixtureProjects?: { fixture: number; projectId: string }[]; previews?: { fixture: number }[] }[];
}

// Template-only v1 receipts cannot prove which input/content a video contains.
const receiptKey = "moirai.template.draft-previews.v2";
function receipts(): DraftPreviewReceipt[] {
	try {
		return readDraftPreviewReceipts(sessionStorage.getItem(receiptKey));
	} catch { return []; }
}

export function DraftPreview({ template, active = true, onPendingChange, onSampleChange, resumeContent = false, contentController, externalBusy = false }: { template: Template; active?: boolean; resumeContent?: boolean; onPendingChange?: (pending: boolean) => void; onSampleChange?:(sample:EffectPreviewSample|undefined)=>void; contentController?:RefObject<TrialContentController|null>;externalBusy?:boolean }) {
	const section = useRef<HTMLElement>(null);
	useEffect(() => {
		if (!active) section.current?.querySelectorAll("video, audio").forEach((media) => (media as HTMLMediaElement).pause());
	}, [active]);
	const [selectedReceipt, setSelectedReceipt] = useState<DraftPreviewReceipt>();
	const batchId = selectedReceipt?.batchId ?? "";
	const [loadedBatch, setBatch] = useState<PreviewBatch>();
	const batch = loadedBatch?.id === batchId ? loadedBatch : undefined;
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const [retrying, setRetrying] = useState(false);
	const [identity, setIdentity] = useState("");
	const currentIdentity = useRef("");
	const templateSnapshot = JSON.stringify(template);
	const currentTemplateSnapshot = useRef(templateSnapshot);
	currentTemplateSnapshot.current = templateSnapshot;
	const current = draftPreviewIsCurrent(selectedReceipt, identity, templateSnapshot);
	const onContentIdentityChange = useCallback((nextIdentity: string) => {
		currentIdentity.current = nextIdentity;
		setIdentity(nextIdentity);
	}, []);
	const workerRunning = batch?.renderJob?.status === "running" || batch?.job?.status === "running";
	useEffect(() => {
		const receipt = receipts().find((entry) => draftPreviewIsCurrent(entry, identity, templateSnapshot));
		if (receipt) setSelectedReceipt(receipt);
	}, [identity, templateSnapshot]);
	useEffect(() => {
		setBatch(undefined);
		setError("");
		if (!batchId) return;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			try {
				const response = await fetch(`/api/footage/templates/production/${batchId}`, { cache: "no-store", signal: controller.signal });
				const result = await response.json();
				if (!response.ok) throw new Error(result.error ?? "预览读取失败");
				if (controller.signal.aborted) return;
				setBatch(result);
				setError("");
				if (["succeeded", "failed"].includes(result.renderJob?.status) || result.job?.status === "failed") return;
			} catch (error) {
				if (controller.signal.aborted) return;
				setError(error instanceof Error ? error.message : "预览读取失败");
			}
			timer = setTimeout(poll, 2000);
		}
		void poll();
		return () => { controller.abort(); clearTimeout(timer); };
	}, [batchId, attempt]);
	async function retry(action: "retry_failed" | "resume" = "retry_failed") {
		setRetrying(true);
		try {
			const response = await fetch(`/api/footage/templates/production/${batchId}/control`, {
				method: "POST", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" }, body: JSON.stringify({ action }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? "重试失败");
			setBatch(result);
			setError("");
			setAttempt((value) => value + 1);
		} catch (error) { setError(error instanceof Error ? error.message : "重试失败"); }
		finally { setRetrying(false); }
	}
	return <section ref={section} className="tp" aria-label="草稿真实预览">
		<ProductionCreate draft={template} resumeContent={resumeContent} contentController={contentController} externalBusy={externalBusy} onPendingChange={onPendingChange} onSampleChange={onSampleChange} onContentIdentityChange={onContentIdentityChange} onCreated={(result, submittedIdentity) => {
			const receipt = { identity: submittedIdentity, batchId: result.id };
			try { sessionStorage.setItem(receiptKey, JSON.stringify(rememberDraftPreview(receipts(), receipt))); } catch { /* Preview remains usable when browser storage is unavailable. */ }
			if (!draftPreviewIsCurrent(receipt, currentIdentity.current, currentTemplateSnapshot.current)) return;
			setBatch(undefined); setError(""); setSelectedReceipt(receipt); setAttempt((value) => value + 1);
		}} />
		{error && <p role="alert">{error}</p>}
		{selectedReceipt && !current && <p role="status">样式或试映内容已变化，以下是上一版的任务与视频。请重新生成，查看当前配置的效果。</p>}
		{batchId && !batch && <p role="status">正在读取{current ? "" : "上一版"}预览任务…</p>}
		{batch && <>
			<h3>{batch.name}</h3>
			<Link href={`/templates/production?batch=${encodeURIComponent(batchId)}`}>查看试映任务</Link>
			<p role="status">{!current ? "上一版任务：" : ""}{error ? "连接中断，当前显示上次读取的任务状态。" : batch.items.length > 0 && batch.items.every((item) => item.status === "published") ? "草稿预览完成 · 未保存到模板库" : batch.cancelled ? workerRunning ? "正在暂停草稿预览…" : "草稿预览已暂停" : batch.renderJob?.status === "failed" || batch.job?.status === "failed" || batch.items.some((item) => item.status === "failed") ? "草稿预览失败" : "正在生成草稿预览…"}</p>
			{batch.cancelled && <Button variant="outline" disabled={!current || retrying || batch.renderJob?.status === "running" || batch.job?.status === "running"} onClick={() => void retry("resume")}><Play />继续预览</Button>}
			{!batch.cancelled && (batch.renderJob?.error || batch.job?.error) && <p role="alert">{batch.renderJob?.error ?? batch.job?.error}</p>}
			{!batch.cancelled && (batch.renderJob?.status === "failed" || batch.job?.status === "failed" || batch.items.some((item) => item.status === "failed")) && <Button variant="outline" disabled={!current || retrying || batch.renderJob?.status === "running" || batch.job?.status === "running"} onClick={() => void retry()}><RefreshCw />重试失败预览</Button>}
			{batch.items.map((item) => <div key={item.index}>
				{item.error && <p role="alert">{item.error}</p>}
				{item.previews?.map((preview) => <div key={preview.fixture}>
					<video controls playsInline preload="metadata" aria-label={`${current ? "" : "上一版"}草稿成片 ${preview.fixture + 1}`} style={{ width: "100%", maxWidth: 480, aspectRatio: selectedReceipt ? draftPreviewAspectRatio(selectedReceipt) : undefined }} src={`/api/footage/templates/production/${batchId}/items/${item.index}/previews/${preview.fixture}`} />
					{item.fixtureProjects?.filter((project) => project.fixture === preview.fixture).map((project) => <Link key={project.projectId} href={`/editor/${encodeURIComponent(project.projectId)}`}>编辑{current ? "" : "上一版"}样例 {preview.fixture + 1}</Link>)}
				</div>)}
			</div>)}
		</>}
	</section>;
}
