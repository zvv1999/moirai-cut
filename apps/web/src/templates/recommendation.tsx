"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateInputPanel } from "./input";
import type { Template, TemplateInput, Transcript } from "./types";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
interface Candidate {
	templateId: string; templateRevision: number; name: string; score: number;
	referenceId: string | null; description: string; matchedText: string; tags: string[];
	unresolvedResources: string[]; unsupportedElements: string[]; warnings: string[];
}
interface Result {
	job: { id: string; status: string; error: string | null };
	result: { stale: boolean; candidates: Candidate[] } | null;
}

export function TemplateRecommendation({ api, blocked, onDirtyChange, onChoose }: {
	api: Api; blocked: boolean; onDirtyChange: (dirty: boolean) => void;
	onChoose: (template: Template, input: TemplateInput, transcript: Transcript) => void;
}) {
	const [source, setSource] = useState<{ input: TemplateInput; transcript: Transcript } | null>(null);
	const [brief, setBrief] = useState("");
	const [jobId, setJobId] = useState("");
	const [result, setResult] = useState<Result | null>(null);
	const [busy, setBusy] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [error, setError] = useState("");
	const active = !!jobId && (!result || ["queued", "running"].includes(result.job.status));
	const onInputChange = useCallback(() => { setSource(null); setJobId(""); setResult(null); }, []);
	const handleDirtyChange = useCallback((value: boolean) => { setDirty(value); onDirtyChange(value); }, [onDirtyChange]);
	useEffect(() => {
		if (!jobId) return;
		let live = true;
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			try {
				const next = await api<Result>(`/recommendations/${jobId}`);
				if (!live) return;
				setResult(next);
				if (["queued", "running"].includes(next.job.status)) timer = setTimeout(() => void poll(), 2000);
				if (next.job.error) setError(next.job.error);
			} catch (e) { if (live) { setError(String(e)); setJobId(""); } }
		}
		void poll();
		return () => { live = false; clearTimeout(timer); };
	}, [api, jobId]);
	return <section className="tw-recommendation">
		<TemplateInputPanel api={api} onInputChange={onInputChange} onDirtyChange={handleDirtyChange} onUse={(input, transcript) => {
			setSource({ input, transcript }); setResult(null); setJobId("");
		}} />
		<label>创作要求<input value={brief} disabled={busy || active} maxLength={300} onChange={(e) => { setBrief(e.target.value); setResult(null); setJobId(""); }} /></label>
		<div className="tw-row">
			{source && <span>{source.input.name} · 转写 v{source.transcript.revision}</span>}
			<Button disabled={!source || dirty || busy || active} onClick={() => void (async () => {
				if (!source) return;
				setBusy(true); setError(""); setResult(null);
				try {
					const job = await api<{ id: string }>("/recommendations", { inputId: source.input.id, transcriptRevision: source.transcript.revision, brief, limit: 5 });
					setJobId(job.id);
				} catch (e) { setError(String(e)); } finally { setBusy(false); }
			})()}><Search />{active ? "匹配中" : "匹配模板"}</Button>
		</div>
		{error && <p role="alert">{error}</p>}
		{result?.result?.stale && <p role="status">输入或模板已更新，请重新匹配。</p>}
		{result?.result?.candidates.map((candidate) => <article key={candidate.templateId}>
			{candidate.referenceId && <div className="tw-recommend-preview">
				{/* These visual reference clips contain burned-in text. */}
				<video controls muted preload="metadata" aria-label={`${candidate.name} 参考预览`} src={`/api/footage/templates/media/${candidate.referenceId}/video`} />
			</div>}
			<div className="tw-recommend-details">
				<h3>{candidate.name}</h3><small>相似度 {candidate.score.toFixed(3)} · {candidate.tags.join(" · ")}</small>
				<p>{candidate.description}</p>
				<details><summary>匹配依据与待完善项</summary><p>{candidate.matchedText}</p>
					<p>待绑定资源：{candidate.unresolvedResources.join("、") || "无"}</p>
					<p>暂未支持元素：{candidate.unsupportedElements.join("、") || "无"}</p>
					{candidate.warnings.map((warning) => <p key={warning}>{warning === "source_aspect_requires_reframing" ? "源视频与模板画幅不同" : "部分匹配文本超过模型长度"}</p>)}
				</details>
				<Button disabled={blocked || dirty || busy || active || result.result?.stale} onClick={() => void (async () => {
					if (!source) return;
					setBusy(true); setError("");
					try {
						const fresh = await api<Result>(`/recommendations/${jobId}`);
						setResult(fresh);
						if (!fresh.result || fresh.job.status !== "succeeded") throw new Error("推荐结果尚未就绪。");
						if (fresh.result?.stale) throw new Error("输入或模板已更新，请重新匹配。");
						const template = await api<Template>(`/${candidate.templateId}`);
						if (template.revision !== candidate.templateRevision) throw new Error("模板版本已更新，请重新匹配。");
						onChoose(template, source.input, source.transcript);
					} catch (e) { setError(String(e)); } finally { setBusy(false); }
				})()}><Check />选择模板</Button>
			</div>
		</article>)}
	</section>;
}
