"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
	ArrowLeft,
	AudioLines,
	SquarePen,
	Pause,
	Play,
	RefreshCw,
	Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import "./production.css";
import { ProductionCreate } from "./production-create";
import { ExitSamplingPanel, ObservedFrameSamplingPanel } from "./exit-sampling";
import type { ExitSampling, ObservedFrameSampling } from "./types";
import { ProductionTextEvidencePanel, type ProductionTextEvidence } from "./production-text-evidence";
import { ProductionReadingDiagnostic } from "./reading-diagnostic";

type Item = {
	previewOnly?: boolean;
	index: number;
	revision: number;
	name: string;
	templateId: string;
	status: string;
	error?: string;
	errors?: { fixture: number; message: string }[];
	fixtureCount: number;
	fixtureProjects?: { fixture: number; projectId: string }[];
	previews?: {
		fixture: number;
		sha256: string;
		requestFingerprint?: string;
		textMeasurements?: ProductionTextEvidence;
		exitSampling?: ExitSampling;
		observedFrameSampling?: ObservedFrameSampling;
		durationSeconds: number;
		audioQuality?: {
			validated: boolean;
			required?: boolean;
			error?: string;
			measurement?: { warnings: string[] };
		};
	}[];
	renders?: Record<string, { status: string; error?: string }>;
};
type Batch = {
	id: string;
	name: string;
	brief: string;
	cancelled: boolean;
	items: Item[];
	summary: Record<string, number>;
	job: { status: string; error?: string };
	renderJob?: { status: string; error?: string };
};
const labels: Record<string, string> = {
	queued: "等待编译",
	compiling: "编译中",
	render_ready: "等待预览完成",
	published: "已入库",
	failed: "失败",
	rejected: "已排除",
	running: "执行中",
	succeeded: "编译已完成",
};
async function request<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(`/api/footage/templates/production${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: {
			"content-type": "application/json",
			"x-requested-with": "moirai-footage",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const result = await response.json();
	if (!response.ok) throw new Error(result.error ?? JSON.stringify(result));
	return result;
}
export function TemplateProduction() {
	const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
	const [id, setId] = useState("");
	const [loadedBatch, setBatch] = useState<Batch>();
	// A selection change renders before the polling effect clears its old result.
	const batch = loadedBatch?.id === id ? loadedBatch : undefined;
	const [error, setError] = useState("");
	const [listError, setListError] = useState("");
	const [connectionError, setConnectionError] = useState("");
	const [busy, setBusy] = useState(false);
	const [templateId, setTemplateId] = useState("");
	const [formIdentity, setFormIdentity] = useState("");
	const [submittedIdentities, setSubmittedIdentities] = useState<Record<string, string>>({});
	const submittedIdentity = submittedIdentities[id];
	const contentChanged = !!submittedIdentity && submittedIdentity !== formIdentity;
	// Older/running records may omit previewOnly. Only advertise publication
	// when the native result explicitly identifies an item that publishes.
	const publishesTemplates = batch?.items.some((item) => item.previewOnly === false) ?? false;
	const resultPrefix = contentChanged ? "上一版任务 · " : submittedIdentity ? "" : "所选任务 · ";
	const upload = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const requestedTemplate = params.get("template") ?? "";
		setTemplateId(requestedTemplate);
		let live = true;
		let retry: ReturnType<typeof setTimeout>;
		const load = () =>
			void request<{ batches: { id: string; name: string }[] }>("")
				.then((data) => {
					if (live) {
						setListError("");
						setBatches(data.batches);
						const requested = new URLSearchParams(window.location.search).get("batch");
						setId(data.batches.find((entry) => entry.id === requested)?.id ?? (requestedTemplate ? "" : data.batches[0]?.id ?? ""));
					}
				})
				.catch((e) => {
					if (live) {
						setListError(String(e));
						retry = setTimeout(load, 2000);
					}
				});
		load();
		return () => {
			live = false;
			clearTimeout(retry);
		};
	}, []);
	useEffect(() => {
		setBatch(undefined);
		setConnectionError("");
		if (!id) return;
		let live = true;
		let loading = false;
		const load = async () => {
			if (loading) return;
			loading = true;
			try {
				const result = await request<Batch>(`/${id}`);
				if (live) {
					setBatch(result);
					setConnectionError("");
				}
			} catch (e) {
				if (live) setConnectionError(String(e));
			} finally {
				loading = false;
			}
		};
		void load();
		const timer = setInterval(() => void load(), 2000);
		return () => {
			live = false;
			clearInterval(timer);
		};
	}, [id]);
	async function control(action: string) {
		setBusy(true);
		setError("");
		try {
			if (action === "execute") {
				await request(`/${id}/execute`, {});
				setBatch(await request<Batch>(`/${id}`));
			} else {
				setBatch(await request<Batch>(`/${id}/control`, { action }));
			}
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	async function audit(item: Item) {
		setBusy(true);
		setError("");
		try {
			await request(`/${id}/items/${item.index}/audit`, {
				baseRevision: item.revision,
			});
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	return (
		<main className="tp">
			<header>
				<Link href={templateId ? `/templates/compositions?template=${encodeURIComponent(templateId)}` : "/templates/compositions"} aria-label="返回整片模板" title="返回整片模板">
					<ArrowLeft />
				</Link>
				<h1>{templateId ? "应用模板" : "模板批量生产"}</h1>
				{templateId && <a href="/templates/production">全部生产任务</a>}
				<Button
					hidden={!!templateId}
					variant="outline"
					disabled={busy}
					onClick={() => upload.current?.click()}
				>
					<Upload />
					导入生产清单
				</Button>
				<input
					ref={upload}
					hidden
					type="file"
					accept="application/json,.json"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file) return;
						setBusy(true);
						setError("");
						void file
							.text()
							.then((text) =>
								request<{ id: string; name: string }>("", JSON.parse(text)),
							)
							.then((result) => {
								setBatches((previous) => [
									result,
									...previous.filter((b) => b.id !== result.id),
								]);
								setId(result.id);
							})
							.catch((e) => setError(String(e)))
							.finally(() => setBusy(false));
					}}
				/>
			</header>
			<ProductionCreate
				onContentIdentityChange={setFormIdentity}
				onCreated={(result, identity) => {
					setSubmittedIdentities((previous) => ({ ...previous, [result.id]: identity }));
					setBatches((previous) => [
						result,
						...previous.filter((batch) => batch.id !== result.id),
					]);
					setId(result.id);
					const url = new URL(window.location.href);
					url.searchParams.set("batch", result.id);
					window.history.replaceState(null, "", url);
				}}
			/>
			{batch && <section aria-label="所选生产任务">
				<h2>{batch.name}</h2>
				{contentChanged ? <p role="status">当前内容已变化，以下为上一版任务。重新生成后可查看当前内容的效果。</p> : !submittedIdentity ? <p>正在查看所选任务；上方表单用于创建新视频。</p> : null}
			</section>}
			<section className="tp-toolbar" hidden={!!templateId && !id}>
				<label hidden={!!templateId}>
					生产批次
					<select
						aria-label="生产批次"
						value={id}
						onChange={(e) => setId(e.target.value)}
					>
						<option value="">选择批次</option>
						{batches.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				</label>
				{batch && (
					<>
						<span role="status">
							{batch.cancelled
								? "已暂停"
								: (labels[batch.job.status] ?? batch.job.status)}
						</span>
						<Button
							variant="outline"
							disabled={
								busy ||
								((batch.job.status === "running" ||
									batch.renderJob?.status === "running") &&
									batch.cancelled)
							}
							onClick={() =>
								void control(batch.cancelled ? "resume" : "cancel")
							}
						>
							{batch.cancelled ? <Play /> : <Pause />}
							{batch.cancelled ? "继续" : "暂停"}
						</Button>
						<Button
							variant="outline"
							disabled={
								busy ||
								batch.job.status === "running" ||
								batch.renderJob?.status === "running"
							}
							onClick={() => void control("retry_failed")}
						>
							<RefreshCw />
							重试失败项
						</Button>
						{batch.summary.renderReady > 0 && (
							<Button
								variant="outline"
								disabled={
									busy ||
									batch.cancelled ||
									["queued", "running"].includes(batch.renderJob?.status ?? "")
								}
								onClick={() => void control("execute")}
							>
								<Play />
								{publishesTemplates ? "生成预览并入库" : "生成视频"}
							</Button>
						)}
					</>
				)}
			</section>
			{error && <p role="alert">{error}</p>}
			{listError && <p role="alert">{listError}</p>}
			{connectionError && (
				<p role="alert">{connectionError} 正在重连，以下为上次获取的结果。</p>
			)}
			{batch?.job.error && <p role="alert">{batch.job.error}</p>}
			{batch?.renderJob && !connectionError && (
				<p role="status">
					{resultPrefix}
					{batch.cancelled
						? "生产已暂停"
						: batch.renderJob.status === "running"
							? publishesTemplates ? "正在生成预览并入库" : "正在生成视频"
							: batch.renderJob.status === "queued"
								? publishesTemplates ? "等待自动生成预览" : "等待自动生成视频"
								: batch.renderJob.status === "succeeded"
									? batch.summary.published === batch.summary.total
										? "生产完成"
										: "生产已结束，仍有未完成项"
									: "预览生产失败"}
				</p>
			)}
			{batch?.renderJob?.error && <p role="alert">{batch.renderJob.error}</p>}
			{batch && (
				<>
					<p>{batch.brief}</p>
					<div className="tp-counts">
						<span>总数 {batch.summary.total}</span>
						<span>待渲染 {batch.summary.renderReady}</span>
						<span>已完成 {batch.summary.published}</span>
						<span>失败 / 排除 {batch.summary.failed}</span>
					</div>
					<section aria-label="生产结果">
						{batch.items.map((item) => (
							<article key={item.index} className="tp-item">
								<div>
									<h2>{item.name}</h2>
									<p className={`tp-status tp-${item.status}`}>
										{item.previewOnly && item.status === "published" ? "视频已生成 · 模板版本未改动" : labels[item.status] ?? item.status}
									</p>
									<p>{item.fixtureCount} 个测试输入</p>
									{item.status === "published" && (
										<Button
											variant="outline"
											disabled={busy}
											onClick={() => void audit(item)}
										>
											<AudioLines />
											复核音轨
										</Button>
									)}
									{item.error && <p role="alert">{item.error}</p>}
									{item.errors?.map((e) => (
										<p role="alert" key={e.fixture}>
											输入 {e.fixture + 1}：{e.message}
										</p>
									))}
									{Object.entries(item.renders ?? {}).map(([key, r]) => (
										<p key={key}>
											预览 {Number(key) + 1} ·{" "}
											{r.status === "completed"
												? "渲染完成"
												: r.status === "running"
													? "渲染中"
													: "渲染失败"}
											{r.error && ` · ${r.error}`}
										</p>
									))}
								</div>
								<div className="tp-previews">
									{item.previews?.map((p) => (
										<figure key={`${p.fixture}-${p.sha256}`}>
											<video
												controls
												preload="metadata"
												src={`/api/footage/templates/production/${id}/items/${item.index}/previews/${p.fixture}`}
												aria-label={`${item.name} 预览 ${p.fixture + 1}`}
											>
												<track
													kind="captions"
													srcLang="zh"
													label="字幕"
													src={`/api/footage/templates/production/${id}/items/${item.index}/captions/${p.fixture}`}
												/>
											</video>
											<figcaption>
												{item.fixtureProjects
													?.filter((project) => project.fixture === p.fixture)
													.map((project) => (
														<Link
															key={project.fixture}
															className="tp-edit-sample"
															href={`/editor/${encodeURIComponent(project.projectId)}`}
															aria-label={`${item.name} 编辑样例 ${p.fixture + 1}`}
														>
															<SquarePen size={14} /> 编辑样例
														</Link>
													))}
												输入 {p.fixture + 1} · {p.durationSeconds.toFixed(1)} 秒
												· 解码检查通过
											<ExitSamplingPanel value={p.exitSampling} />
											<ObservedFrameSamplingPanel value={p.observedFrameSampling} previewSha256={p.sha256} requested={!!p.exitSampling && p.exitSampling.status !== "not_requested"} />
												<ProductionTextEvidencePanel evidence={p.textMeasurements} previewSha256={p.sha256}/>
												<ProductionReadingDiagnostic batchId={id} itemIndex={item.index} fixtureId={p.fixture} outputSha256={p.sha256} requestFingerprint={p.requestFingerprint}/>
												<p title={p.audioQuality?.error}>
													{!p.audioQuality
														? "音轨尚未复核"
														: !p.audioQuality.validated
															? "音轨异常"
															: p.audioQuality.required
																? "音轨完整"
																: "无需音轨"}
												</p>
												{p.audioQuality?.measurement?.warnings.map(
													(warning) => (
														<p key={warning}>
															{warning === "rendered_audio_near_silence"
																? "音量接近静音"
																: warning === "rendered_audio_near_full_scale"
																	? "采样峰值接近满幅"
																	: warning}
														</p>
													),
												)}
											</figcaption>
										</figure>
									))}
								</div>
							</article>
						))}
					</section>
				</>
			)}
		</main>
	);
}
