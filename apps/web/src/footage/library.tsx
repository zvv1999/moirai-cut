"use client";
import { ShotLineage } from "./lineage-view";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
	ArrowLeft,
	Check,
	Film,
	FolderInput,
	Loader2,
	Plus,
	RefreshCw,
	RotateCcw,
	Save,
	Search,
	Upload,
	X,
	Download,
	HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryState, Shot, FootageSource, Recipe } from "./types";
import { ROLE_LABELS, STATUS_LABELS } from "./types";
import "./library.css";

async function api<T>(
	path: string,
	method = "GET",
	body?: unknown,
): Promise<T> {
	const response = await fetch(`/api/footage/${path}`, {
		method,
		headers: {
			"x-requested-with": "moirai-footage",
			...(body ? { "content-type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
		cache: "no-store",
	});
	const value = await response.json();
	if (!response.ok)
		throw new Error(
			value.error === "revision_conflict"
				? "片段已被更新，请重新载入后再审核。"
				: (value.error ?? "操作失败"),
		);
	return value as T;
}
const seconds = (ticks: number) => (ticks / 120000).toFixed(2);
const errorText = (error: unknown) =>
	error instanceof Error ? error.message : "操作失败";

function Status({ value }: { value: string }) {
	return (
		<span className={`footage-status footage-status-${value}`}>
			{STATUS_LABELS[value] ?? value}
		</span>
	);
}
function Tool({
	label,
	children,
	...props
}: { label: string; children: ReactNode } & React.ComponentProps<
	typeof Button
>) {
	return (
		<Button
			variant="ghost"
			size="icon"
			title={label}
			aria-label={label}
			{...props}
		>
			{children}
		</Button>
	);
}

function syncLabel(status?: string) {
	return (
		(
			{
				succeeded: "NAS 已同步",
				running: "正在同步 NAS",
				queued: "等待同步 NAS",
				failed: "NAS 同步失败，可在任务中重试",
			} as Record<string, string>
		)[status ?? ""] ?? "本地可用"
	);
}

export function FootageLibrary() {
	const [data, setData] = useState<LibraryState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState("shots");
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("");
	const [role, setRole] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const [product, setProduct] = useState("");
	const [modelOptions, setModelOptions] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [uploadState, setUploadState] = useState("");
	const [dragging, setDragging] = useState(false);
	const dragDepth = useRef(0);
	const fileInput = useRef<HTMLInputElement>(null);
	const requestSequence = useRef(0);
	const requestInFlight = useRef(false);
	const refresh = useCallback(async () => {
		if (requestInFlight.current) return;
		requestInFlight.current = true;
		const sequence = ++requestSequence.current;
		try {
			const value = await api<LibraryState>(
				`state?${new URLSearchParams({ q: query, status, role })}`,
			);
			if (sequence !== requestSequence.current) return;
			setData(value);
			setError(null);
		} catch (e) {
			if (sequence === requestSequence.current) setError(errorText(e));
		} finally {
			requestInFlight.current = false;
		}
	}, [query, status, role]);
	useEffect(() => {
		void refresh();
		const sequenceRef = requestSequence;
		const timer = setInterval(() => void refresh(), 1000);
		return () => {
			clearInterval(timer);
			sequenceRef.current++;
		};
	}, [refresh]);
	useEffect(() => {
		api<{ models: string[] }>("models")
			.then((v) => setModelOptions(v.models))
			.catch(() => {});
	}, []);
	useEffect(() => {
		setSelected(new URLSearchParams(window.location.search).get("shot"));
	}, []);
	const run = async (task: () => Promise<unknown>) => {
		setBusy(true);
		try {
			await task();
			await refresh();
		} catch (e) {
			toast.error(errorText(e));
		} finally {
			setBusy(false);
		}
	};
	const upload = async (files: FileList | null) => {
		if (!files?.length) return;
		if (busy || !data) {
			toast.error("请等待当前上传完成或服务连接后再导入。");
			return;
		}
		const list = Array.from(files);
		setBusy(true);
		setTab("sources");
		const batch = new Date().toISOString();
		let failed = 0;
		for (let index = 0; index < list.length; index++) {
			const file = list[index];
			setUploadState(`${index + 1} / ${list.length} · ${file.name}`);
			try {
				const response = await fetch(
					`/api/footage/imports?${new URLSearchParams({ filename: file.name, product, batch })}`,
					{
						method: "POST",
						headers: {
							"x-requested-with": "moirai-footage",
							"content-type": "application/octet-stream",
						},
						body: file,
					},
				);
				const value = await response.json();
				if (!response.ok) throw new Error(value.error ?? "上传失败");
			} catch (e) {
				failed++;
				toast.error(`${file.name}：${errorText(e)}`);
			}
			await refresh();
		}
		setBusy(false);
		setUploadState("");
		if (fileInput.current) fileInput.current.value = "";
		toast(
			failed
				? `${list.length - failed} 条已导入，${failed} 条失败`
				: `${list.length} 条素材已导入`,
		);
	};
	const shot = data?.shots.find((s) => s.id === selected) ?? data?.shots[0];
	return (
		<div
			className="footage-app"
			onDragEnter={(e) => {
				if (e.dataTransfer.types.includes("Files")) {
					e.preventDefault();
					dragDepth.current++;
					setDragging(true);
				}
			}}
			onDragOver={(e) => {
				if (e.dataTransfer.types.includes("Files")) e.preventDefault();
			}}
			onDragLeave={(e) => {
				e.preventDefault();
				dragDepth.current--;
				if (dragDepth.current <= 0) {
					dragDepth.current = 0;
					setDragging(false);
				}
			}}
			onDrop={(e) => {
				e.preventDefault();
				dragDepth.current = 0;
				setDragging(false);
				void upload(e.dataTransfer.files);
			}}
		>
			{dragging && (
				<div className="footage-drop-overlay">
					<Upload size={40} />
					<strong>导入原片</strong>
				</div>
			)}
			<header className="footage-header">
				<div className="footage-title">
					<Link href="/projects" title="返回项目" aria-label="返回项目">
						<ArrowLeft size={18} />
					</Link>
					<h1>产品素材库</h1>
					<span className="footage-subtle">Moirai Cut</span>
				</div>
				<div className="footage-connection">
					<HardDrive size={15} />
					<span
						className={
							!data?.runtime.syncToNas || data.runtime.nasOnline ? "footage-online" : "footage-warning"
						}
					>
						{!data?.runtime.syncToNas
							? "本地素材库"
							: data.runtime.nasOnline
								? "NAS 已连接"
								: "NAS 未连接"}
					</span>
					<label className="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							aria-label="同步至团队 NAS"
							checked={data?.runtime.syncToNas ?? false}
							disabled={busy || !data}
							onChange={(e) => {
								const syncToNas = e.target.checked;
								void run(() => api("storage-settings", "POST", { syncToNas }));
							}}
						/>
						同步至团队 NAS
					</label>
					<Tool label="刷新" onClick={() => void refresh()}>
						<RefreshCw />
					</Tool>
				</div>
			</header>
			<section className="footage-import-bar" aria-label="导入素材">
				<label htmlFor="footage-product">
					产品 / SKU
					<Input
						id="footage-product"
						value={product}
						onChange={(e) => setProduct(e.target.value)}
						placeholder="本批素材所属产品"
					/>
				</label>
				<label>
					分析模型
					<select
						aria-label="分析模型"
						value={data?.settings.modelId ?? "glm-5.3-flash"}
						disabled={busy || !data}
						onChange={(e) =>
							void run(() =>
								api("settings", "POST", {
									...data?.settings,
									modelId: e.target.value,
								}),
							)
						}
					>
						{Array.from(
							new Set([
								data?.settings.modelId ?? "glm-5.3-flash",
								...modelOptions,
							]),
						).map((id) => (
							<option key={id}>{id}</option>
						))}
					</select>
				</label>
				<label>
					分析输入
					<select
						aria-label="分析输入"
						value={data?.settings.inputMode ?? "video"}
						disabled={busy || !data}
						onChange={(e) =>
							void run(() =>
								api("settings", "POST", {
									...data?.settings,
									inputMode: e.target.value,
								}),
							)
						}
					>
						<option value="video">视频</option>
						<option value="frames">采样帧</option>
					</select>
				</label>
				<div className="footage-import-actions">
					{data?.runtime.syncToNas && (
						<Button
							variant="outline"
							disabled={busy || !data?.runtime.nasOnline}
							onClick={() =>
								void run(async () => {
									const result = await api<{ results: { error?: string }[] }>(
										"scan",
										"POST",
									);
									setTab("sources");
									toast(
										`扫描 ${result.results.length} 条，失败 ${result.results.filter((r) => r.error).length} 条`,
									);
								})
							}
						>
							<FolderInput />
							读取 NAS 待导入
						</Button>
					)}
					<Button
						disabled={busy || !data}
						onClick={() => fileInput.current?.click()}
					>
						{busy ? <Loader2 className="animate-spin" /> : <Upload />}导入原片
					</Button>
				</div>
				<input
					ref={fileInput}
					type="file"
					accept="video/*,.mkv,.mov"
					multiple
					className="sr-only"
					aria-label="选择原片文件"
					onChange={(e) => void upload(e.target.files)}
				/>
			</section>
			{uploadState && (
				<div className="footage-notice" role="status">
					正在导入 {uploadState}
				</div>
			)}
			{error && (
				<div className="footage-error" role="alert">
					{error}
				</div>
			)}
			{data?.runtime.endpointError && (
				<div className="footage-error" role="alert">
					{data.runtime.endpointError}
				</div>
			)}
			{data?.runtime.nasError && (
				<div className="footage-notice">{data.runtime.nasError}</div>
			)}
			<div className="footage-toolbar">
				<nav className="footage-tabs" aria-label="素材视图">
					{[
						["shots", "分镜", data?.shots.length],
						["sources", "原片", data?.counts.sources],
						[
							"jobs",
							"任务",
							data?.jobs.filter((j) => ["queued", "running"].includes(j.status))
								.length,
						],
					].map(([id, label, count]) => (
						<button
							key={id}
							type="button"
							aria-current={tab === id ? "page" : undefined}
							onClick={() => setTab(String(id))}
						>
							{label}
							<span>{count ?? 0}</span>
						</button>
					))}
				</nav>
				<div className="footage-summary">
					<span>
						粗剪待审 <b>{data?.counts.draft ?? 0}</b>
					</span>
					<span>
						加工待审 <b>{data?.counts.review ?? 0}</b>
					</span>
					<span className="footage-online">
						已入库 <b>{data?.counts.published ?? 0}</b>
					</span>
				</div>
			</div>
			{tab === "shots" && (
				<>
					<div className="footage-filters">
						<div className="footage-search">
							<Search size={16} />
							<Input
								aria-label="搜索分镜"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="产品、动作、场景"
							/>
						</div>
						<select
							aria-label="片段状态"
							value={status}
							onChange={(e) => setStatus(e.target.value)}
						>
							<option value="">全部状态</option>
							{[
								"draft",
								"rendering",
								"review",
								"publishing",
								"published",
								"failed",
								"rejected",
							].map((s) => (
								<option key={s} value={s}>
									{STATUS_LABELS[s]}
								</option>
							))}
						</select>
						<select
							aria-label="片段用途"
							value={role}
							onChange={(e) => setRole(e.target.value)}
						>
							<option value="">全部用途</option>
							{Object.entries(ROLE_LABELS).map(([id, label]) => (
								<option key={id} value={id}>
									{label}
								</option>
							))}
						</select>
					</div>
					<div className="footage-workspace">
						<aside className="footage-shot-list" aria-label="分镜列表">
							{data?.shots.map((item) => (
								<button
									type="button"
									key={item.id}
									className={`footage-shot-row ${shot?.id === item.id ? "is-selected" : ""}`}
									onClick={() => setSelected(item.id)}
								>
									<div className="footage-thumbnail">
										<Image
											unoptimized
											src={`/api/footage/media/source/${item.sourceId}/poster`}
											alt=""
											width={54}
											height={82}
										/>
									</div>
									<div>
										<strong>{item.name}</strong>
										<span>
											{seconds(item.startTicks)}–{seconds(item.endTicks)} s
										</span>
										<Status value={item.status} />
										<small>
											{item.roles.map((r) => ROLE_LABELS[r.role]).join(" · ")}
										</small>
									</div>
								</button>
							))}
							{data?.shots.length === 0 && (
								<div className="footage-empty">
									<Film />
									<p>
										{query || status || role
											? "没有符合条件的分镜"
											: "暂无分镜"}
									</p>
								</div>
							)}
						</aside>
						<main className="footage-detail">
							{shot && data ? (
								<ShotEditor
									key={shot.id}
									shot={shot}
									source={data.sources.find((s) => s.id === shot.sourceId)!}
									onRefresh={refresh}
								/>
							) : (
								<div className="footage-empty">
									<Film size={36} />
									<p>{data?.sources.length ? "待分析结果" : "暂无素材"}</p>
									<Button
										disabled={busy || !data}
										onClick={() => fileInput.current?.click()}
									>
										<Plus />
										导入原片
									</Button>
								</div>
							)}
						</main>
					</div>
				</>
			)}
			{tab === "sources" && (
				<main className="footage-table-wrap">
					<table>
						<thead>
							<tr>
								<th>原片</th>
								<th>产品</th>
								<th>尺寸 / 时长</th>
								<th>状态</th>
								<th>操作</th>
							</tr>
						</thead>
						<tbody>
							{data?.sources.map((source) => (
								<tr key={source.id}>
									<td>
										<div className="footage-source-name">
											<Film size={18} />
											<span>{source.name}</span>
										</div>
										{source.error && (
											<p className="footage-row-error">{source.error}</p>
										)}
									</td>
									<td>{source.product || "未指定"}</td>
									<td>
										{source.width} × {source.height}
										<br />
										{seconds(source.durationTicks)} s
									</td>
									<td>
										<Status value={source.status} />
										<p className="text-xs">{syncLabel(source.nasSync)}</p>
										{source.nasRelativePath && (
											<div
												className="footage-online text-xs mt-1"
												title={source.nasRelativePath}
											>
												原片已归档
											</div>
										)}
									</td>
									<td>
										<Button
											variant="outline"
											size="sm"
											disabled={
												busy || !["review", "failed"].includes(source.status)
											}
											onClick={() =>
												void run(async () => {
													const result = await api<Shot>(
														`sources/${source.id}/manual`,
														"POST",
													);
													setSelected(result.id);
													setStatus("");
													setRole("");
													setQuery("");
													setTab("shots");
												})
											}
										>
											<Plus />
											手工分镜
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!data?.sources.length && (
						<div className="footage-empty">
							<FolderInput />
							<p>暂无原片</p>
						</div>
					)}
				</main>
			)}
			{tab === "jobs" && (
				<main className="footage-table-wrap">
					<table>
						<thead>
							<tr>
								<th>任务</th>
								<th>素材</th>
								<th>状态</th>
								<th>执行次数</th>
								<th>操作</th>
							</tr>
						</thead>
						<tbody>
							{data?.jobs.map((job) => (
								<tr key={job.id}>
									<td>
										{{
											archive: "本地素材准备",
											analyze: "联合分析",
											render: "片段加工",
											publish: "本地入库",
											sync_source: "原片同步 NAS",
											sync_release: "视频与标签同步 NAS",
										}[job.kind] ?? job.kind}
									</td>
									<td>
										{data.sources.find((s) => s.id === job.targetId)?.name ??
											data.shots.find((s) => s.id === job.targetId)?.name ??
											job.targetId}
										{job.error && (
											<p className="footage-row-error">{job.error}</p>
										)}
									</td>
									<td>
										<Status value={job.status} />
									</td>
									<td>{job.attempt}</td>
									<td>
										{job.status === "failed" && (
											<Tool
												label="重试任务"
												disabled={busy}
												onClick={() =>
													void run(() => api(`jobs/${job.id}/retry`, "POST"))
												}
											>
												<RotateCcw />
											</Tool>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!data?.jobs.length && (
						<div className="footage-empty">
							<Check />
							<p>暂无任务</p>
						</div>
					)}
				</main>
			)}
		</div>
	);
}

function ShotEditor({
	shot,
	source,
	onRefresh,
}: {
	shot: Shot;
	source: FootageSource;
	onRefresh: () => Promise<void>;
}) {
	const [draft, setDraft] = useState(shot);
	const [dirty, setDirty] = useState(false);
	const [busy, setBusy] = useState(false);
	const [view, setView] = useState("source");
	const [error, setError] = useState<string | null>(null);
	const video = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		if (!dirty) setDraft(shot);
	}, [shot, dirty]);
	const change = (patch: Partial<Shot>) => {
		setDraft((d) => ({ ...d, ...patch }));
		setDirty(true);
	};
	const recipe = (patch: Partial<Recipe>) =>
		change({ recipe: { ...draft.recipe, ...patch } });
	const locked = busy || ["rendering", "publishing"].includes(shot.status);
	const stale = dirty && draft.revision !== shot.revision;
	const save = async () => {
		const result = await api<Shot>(`shots/${shot.id}`, "PATCH", {
			baseRevision: draft.revision,
			name: draft.name,
			startTicks: draft.startTicks,
			endTicks: draft.endTicks,
			description: draft.description,
			tags: draft.tags,
			roles: draft.roles,
			unsupportedClaims: draft.unsupportedClaims,
			recipe: draft.recipe,
		});
		setDraft({ ...result, hasOutput: shot.hasOutput });
		setDirty(false);
		return result.revision;
	};
	const perform = async (action?: string) => {
		setBusy(true);
		setError(null);
		try {
			const revision = dirty ? await save() : shot.revision;
			if (action)
				await api(`shots/${shot.id}/action`, "POST", {
					baseRevision: revision,
					action,
				});
			await onRefresh();
		} catch (e) {
			setError(errorText(e));
		} finally {
			setBusy(false);
		}
	};
	const setBoundary = (side: "startTicks" | "endTicks") => {
		if (video.current && view === "source")
			change({ [side]: Math.round(video.current.currentTime * 120000) });
	};
	const actualView = shot.hasOutput && view === "output" ? "output" : "source";
	return (
		<>
			<div className="footage-detail-heading">
				<div>
					<h2>{shot.name}</h2>
					<span className="footage-subtle">
						{source.name} · {source.product || "未指定产品"}
					</span>
				</div>
				<Status value={shot.status} />
			</div>
			{(error || shot.error) && (
				<div className="footage-error" role="alert">
					{error || shot.error}
				</div>
			)}
			{stale && (
				<div className="footage-notice">
					片段版本已更新
					<Button
						variant="link"
						onClick={() => {
							setDraft(shot);
							setDirty(false);
						}}
					>
						重新载入
					</Button>
				</div>
			)}
			<div className="footage-review-grid">
				<section className="footage-preview-section" aria-label="视频预览">
					<div
						className="footage-view-switch"
						role="group"
						aria-label="预览版本"
					>
						<button
							type="button"
							aria-pressed={actualView === "source"}
							onClick={() => setView("source")}
						>
							原片
						</button>
						<button
							type="button"
							aria-pressed={actualView === "output"}
							disabled={!shot.hasOutput}
							onClick={() => setView("output")}
						>
							加工结果
						</button>
					</div>
					<div className="footage-video">
						{/* Raw footage has no authored captions until transcription is available. */}
						{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
						<video
							ref={video}
							key={`${shot.id}-${actualView}-${shot.revision}`}
							controls
							playsInline
							preload="metadata"
							src={
								actualView === "output"
									? `/api/footage/media/shot/${shot.id}/master?r=${shot.revision}`
									: `/api/footage/media/source/${source.id}/preview`
							}
							poster={
								actualView === "output"
									? `/api/footage/media/shot/${shot.id}/poster?r=${shot.revision}`
									: `/api/footage/media/source/${source.id}/poster`
							}
							onLoadedMetadata={() => {
								if (actualView === "source" && video.current)
									video.current.currentTime = draft.startTicks / 120000;
							}}
						/>
					</div>
					<div className="footage-boundaries">
						<label htmlFor="footage-start">
							入点（秒）
							<Input
								id="footage-start"
								aria-label="入点（秒）"
								type="number"
								min={0}
								step={0.01}
								value={draft.startTicks / 120000}
								disabled={locked}
								onChange={(e) =>
									change({
										startTicks: Math.round(Number(e.target.value) * 120000),
									})
								}
							/>
						</label>
						<label htmlFor="footage-end">
							出点（秒）
							<Input
								id="footage-end"
								aria-label="出点（秒）"
								type="number"
								min={0}
								step={0.01}
								value={draft.endTicks / 120000}
								disabled={locked}
								onChange={(e) =>
									change({
										endTicks: Math.round(Number(e.target.value) * 120000),
									})
								}
							/>
						</label>
					</div>
					<div className="footage-boundary-actions">
						<Button
							size="sm"
							variant="outline"
							disabled={locked || actualView !== "source"}
							onClick={() => setBoundary("startTicks")}
						>
							设为入点
						</Button>
						<span>{seconds(draft.endTicks - draft.startTicks)} s</span>
						<Button
							size="sm"
							variant="outline"
							disabled={locked || actualView !== "source"}
							onClick={() => setBoundary("endTicks")}
						>
							设为出点
						</Button>
					</div>
					{shot.qualityIssues.length > 0 && (
						<ul className="footage-quality">
							{shot.qualityIssues.map((issue) => (
								<li key={issue}>{issue}</li>
							))}
						</ul>
					)}
					<div className="footage-evidence">
						<h3>画面证据</h3>
						<p>{shot.evidence}</p>
						<span>
							{shot.modelId} ·{" "}
							{shot.inputMode === "video"
								? "视频分析"
								: shot.inputMode === "frames"
									? "采样帧分析"
									: "人工标注"}
						</span>
					</div>
				</section>
				<section className="footage-fields" aria-label="分镜审核">
					<fieldset disabled={locked}>
						<label htmlFor="footage-shot-name">
							分镜名称
							<Input
								id="footage-shot-name"
								value={draft.name}
								onChange={(e) => change({ name: e.target.value })}
							/>
						</label>
						<label>
							画面描述
							<textarea
								rows={3}
								value={draft.description}
								onChange={(e) => change({ description: e.target.value })}
							/>
						</label>
						<label htmlFor="footage-tags">
							标签
							<Input
								id="footage-tags"
								value={draft.tags.join("，")}
								onChange={(e) =>
									change({ tags: e.target.value.split(/[,，]/) })
								}
							/>
						</label>
						<div>
							<h3>适用位置</h3>
							<div className="footage-role-grid">
								{Object.entries(ROLE_LABELS).map(([id, label]) => (
									<label key={id}>
										<input
											type="checkbox"
											checked={draft.roles.some((r) => r.role === id)}
											onChange={(e) =>
												change({
													roles: e.target.checked
														? [
																...draft.roles,
																{ role: id, confidence: 1, reason: "人工指定" },
															]
														: draft.roles.filter((r) => r.role !== id),
												})
											}
										/>
										{label}
									</label>
								))}
							</div>
							{draft.roles.map((r) => (
								<p className="footage-role-reason" key={r.role}>
									{ROLE_LABELS[r.role]}：{r.reason}
								</p>
							))}
						</div>
						<label>
							使用限制
							<textarea
								rows={2}
								value={draft.unsupportedClaims.join("\n")}
								onChange={(e) =>
									change({ unsupportedClaims: e.target.value.split("\n") })
								}
							/>
						</label>
						<div className="footage-field-pair">
							<label>
								画幅
								<select
									aria-label="画幅"
									value={draft.recipe.cropMode}
									onChange={(e) => recipe({ cropMode: e.target.value })}
								>
									<option value="preserve">保留原构图</option>
									<option value="vertical">竖屏 9:16</option>
								</select>
							</label>
							<label>
								追加旋转
								<select
									aria-label="追加旋转"
									value={draft.recipe.rotation}
									onChange={(e) => recipe({ rotation: Number(e.target.value) })}
								>
									{[0, 90, 180, 270].map((r) => (
										<option key={r} value={r}>
											{r}°
										</option>
									))}
								</select>
							</label>
						</div>
						{draft.recipe.cropMode === "vertical" && (
							<div className="footage-field-pair">
								<label>
									裁切水平位置
									<input
										type="range"
										min={0}
										max={1}
										step={0.01}
										value={draft.recipe.cropX}
										onChange={(e) => recipe({ cropX: Number(e.target.value) })}
									/>
								</label>
								<label>
									裁切垂直位置
									<input
										type="range"
										min={0}
										max={1}
										step={0.01}
										value={draft.recipe.cropY}
										onChange={(e) => recipe({ cropY: Number(e.target.value) })}
									/>
								</label>
							</div>
						)}
						<label>
							调色
							<select
								aria-label="调色"
								value={draft.recipe.colorMode}
								onChange={(e) => recipe({ colorMode: e.target.value })}
							>
								<option value="auto">保守自动曝光</option>
								<option value="preserve">保留原色</option>
								<option value="manual">人工调整</option>
							</select>
						</label>
						{draft.recipe.colorMode === "manual" && (
							<div className="footage-color-controls">
								{(
									[
										["brightness", "亮度", -0.12, 0.12],
										["contrast", "对比度", 0.85, 1.15],
										["saturation", "饱和度", 0.85, 1.15],
									] as const
								).map(([key, label, min, max]) => (
									<label key={key}>
										{label}
										<output>{draft.recipe[key].toFixed(2)}</output>
										<input
											type="range"
											min={min}
											max={max}
											step={0.005}
											value={draft.recipe[key]}
											onChange={(e) =>
												recipe({ [key]: Number(e.target.value) })
											}
										/>
									</label>
								))}
							</div>
						)}
					</fieldset>
				</section>
			</div>
			{shot.status === "published" && (
				<p className="text-sm">{syncLabel(shot.nasSync)}</p>
			)}
			<ShotLineage key={shot.id} shotId={shot.id} />
			<footer className="footage-review-actions">
				<div>
					<Tool
						label="淘汰片段"
						disabled={locked || stale || shot.status === "rejected"}
						onClick={() => void perform("reject")}
					>
						<X />
					</Tool>
					<Tool
						label="保存修改"
						disabled={locked || stale || !dirty}
						onClick={() => void perform()}
					>
						<Save />
					</Tool>
					{shot.status === "published" && (
						<Button variant="outline" asChild>
							<a
								href={`/api/footage/media/shot/${shot.id}/master`}
								download={`${shot.name}.mp4`}
							>
								<Download />
								下载片段
							</a>
						</Button>
					)}
				</div>
				<div>
					{shot.status === "rejected" ? (
						<Button
							variant="outline"
							disabled={locked || stale}
							onClick={() => void perform("restore")}
						>
							<RotateCcw />
							恢复片段
						</Button>
					) : (
						<>
							<Button
								variant="outline"
								disabled={
									locked || stale || (!dirty && shot.status === "published")
								}
								onClick={() => void perform("render")}
							>
								{shot.status === "rendering" || busy ? (
									<Loader2 className="animate-spin" />
								) : (
									<Film />
								)}
								{shot.status === "rendering"
									? "加工中"
									: shot.hasOutput && !dirty
										? "复用加工结果"
										: "确认粗剪并加工"}
							</Button>
							<Button
								disabled={locked || stale || dirty || shot.status !== "review"}
								onClick={() => void perform("publish")}
							>
								{shot.status === "publishing" ? (
									<Loader2 className="animate-spin" />
								) : (
									<Check />
								)}
								{shot.status === "publishing"
									? "正在本地入库"
									: "确认结果并入库"}
							</Button>
						</>
					)}
				</div>
			</footer>
		</>
	);
}
