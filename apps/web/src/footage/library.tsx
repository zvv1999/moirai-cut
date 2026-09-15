"use client";
import { ShotLineage } from "./lineage-view";
import { ReanalysisDialog, AnalysisSuggestionPanel } from "./analysis-review";
import { TagEvidenceView } from "./tag-evidence-view";
import { RecognitionSettings } from "./recognition-settings";
import { ShotMetadata, EMPTY_SHOT_DETAILS } from "./shot-metadata";
import { PublishedVideo } from "./published-video";
import { acceptLibrary, libraryHeaders } from "./library-session";
import {
	TagInput,
	tagInputValue,
	readTagInput,
	type TagInputValue,
} from "./tag-input";
import { StorageSettings } from "./storage-settings";
import { LivePreview } from "./live-preview";
import { TrimControl } from "./trim-control";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
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
	RotateCw,
	FlipHorizontal2,
	FlipVertical2,
	Save,
	Search,
	Upload,
	X,
	Download,
	HardDrive,
	Info,
	Settings2,
	Trash2,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import {
	Tooltip,
	TooltipProvider,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { isTypableDOMElement } from "@/utils/browser";
import type { LibraryState, Shot, FootageSource, Recipe } from "./types";
import { STATUS_LABELS } from "./types";
import "./library.css";

const TAG_CATEGORIES = ["抓注意力", "建立需求", "展示商品", "行动引导"];

function PushInControl({ value, onChange }: {
	value: Recipe;
	onChange: (patch: Partial<Recipe>) => void;
}) {
	const [text, setText] = useState<string | null>(null);
	return (
		<div className="footage-push-in-control">
			<label className="footage-push-in">
				<input type="checkbox" checked={!!value.pushIn}
					onChange={(e) => { setText(null); onChange({ pushIn: e.target.checked }); }} />
				镜头拉近
			</label>
			<label className="footage-push-in-end">
				结束比例
				<span>
					<input type="number" aria-label="镜头拉近结束比例" min={100} max={200} step={1}
						disabled={!value.pushIn} value={text ?? value.pushInEndPercent ?? 110}
						onChange={(e) => {
							setText(e.target.value);
							if (e.target.value && e.target.validity.valid)
								onChange({ pushInEndPercent: Number(e.target.value) });
						}}
						onBlur={() => setText(null)} />
					<span>%</span>
				</span>
			</label>
		</div>
	);
}

async function api<T>(
	path: string,
	method = "GET",
	body?: unknown,
): Promise<T> {
	const response = await fetch(`/api/footage/${path}`, {
		method,
		headers: {
			...libraryHeaders(),
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

function SourceDeleteButton({ source, disabled, onRefresh }: {
	source: FootageSource; disabled: boolean; onRefresh: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const confirmDelete = useRef<HTMLButtonElement>(null);
	return <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
		<DialogTrigger asChild><Button variant="ghost" size="sm" disabled={disabled || busy} title="删除原片" aria-label={`删除原片 ${source.name}`}><Trash2 /></Button></DialogTrigger>
		<DialogContent aria-describedby={undefined} onOpenAutoFocus={(event) => {
			event.preventDefault();
			confirmDelete.current?.focus();
		}}>
			<DialogHeader><DialogTitle>删除原片</DialogTitle></DialogHeader>
			<div className="p-6 space-y-4">
				<p>从素材库移除“{source.name}”及其所有分镜？排队任务将取消，磁盘文件和历史工程引用保留。</p>
				<div className="flex justify-end gap-2">
					<Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>取消</Button>
					<Button ref={confirmDelete} variant="destructive" disabled={busy} onClick={async () => {
						setBusy(true);
						try {
							await api(`sources/${source.id}/delete`, "POST");
							setOpen(false);
							await onRefresh();
							toast.success("原片及关联分镜已删除");
						} catch (error) { toast.error(errorText(error)); }
						finally { setBusy(false); }
					}}><Trash2 />{busy ? "正在删除" : "删除"}</Button>
				</div>
			</div>
		</DialogContent>
	</Dialog>;
}

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

function syncLabel(status?: string, folder = false, team = false) {
	if (team) return "团队素材库";
	if (folder) return "本机文件夹";
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

export function FootageLibrary({
	initialView,
}: {
	initialView: {
		tab: string;
		query: string;
		status: string;
		role: string;
		selected: string | null;
	};
}) {
	useEffect(() => {
		const stored = sessionStorage.getItem("footage-library-open-result");
		if (!stored) return;
		sessionStorage.removeItem("footage-library-open-result");
		try {
			const result = JSON.parse(stored) as {
				created: boolean;
				imported: number;
				duplicates: number;
				errors: { file: string; error: string }[];
			};
			if (result.errors?.length)
				toast.error(`素材库已打开，${result.errors.length} 个文件导入失败`, {
					description: result.errors
						.map((item) => `${item.file}：${item.error}`)
						.join("\n"),
					duration: 15000,
				});
			else
				toast.success(
					result.created
						? `已新建素材库，导入 ${result.imported} 个视频${result.duplicates ? `，跳过 ${result.duplicates} 个重复文件` : ""}`
						: "已加载素材库",
				);
		} catch {
			/* Ignore an obsolete session notice. */
		}
	}, []);
	const [data, setData] = useState<LibraryState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState(initialView.tab);
	const [query, setQuery] = useState(initialView.query);
	const [status, setStatus] = useState(initialView.status);
	const [role, setRole] = useState(initialView.role);
	const [selected, setSelected] = useState<string | null>(initialView.selected);
	const [modelOptions, setModelOptions] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [uploadState, setUploadState] = useState("");
	const [dragging, setDragging] = useState(false);
	const dragDepth = useRef(0);
	const fileInput = useRef<HTMLInputElement>(null);
	const stickyControls = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const controls = stickyControls.current;
		const app = controls?.closest<HTMLElement>(".footage-app");
		const header = app?.querySelector<HTMLElement>(".footage-header");
		if (!controls || !app || !header) return;
		const updateHeight = () => {
			const headerHeight = Math.ceil(header.getBoundingClientRect().height);
			app.style.setProperty("--footage-header-height", `${headerHeight}px`);
			app.style.setProperty(
				"--footage-controls-height",
				`${headerHeight + Math.ceil(controls.getBoundingClientRect().height)}px`,
			);
		};
		updateHeight();
		const observer = new ResizeObserver(updateHeight);
		observer.observe(controls, { box: "border-box" });
		observer.observe(header, { box: "border-box" });
		return () => observer.disconnect();
	}, []);
	const shotInput = useRef<HTMLInputElement>(null);
	const requestSequence = useRef(0);
	const requestInFlight = useRef(false);
	const refresh = useCallback(async () => {
		if (requestInFlight.current) return;
		requestInFlight.current = true;
		const sequence = ++requestSequence.current;
		try {
			const value = await api<LibraryState>(
				`state?${new URLSearchParams({ q: query, status, ...(role.startsWith("category:") ? { category: role.slice(9) } : { tag: role.slice(4) }) })}`,
			);
			if (sequence !== requestSequence.current) return;
			if (!acceptLibrary(value.libraryId)) return;
			setData(value);
			setError(null);
		} catch (e) {
			if (sequence === requestSequence.current) setError(errorText(e));
		} finally {
			requestInFlight.current = false;
		}
	}, [query, status, role]);
	const latestRefresh = useRef(refresh);
	useEffect(() => {
		latestRefresh.current = refresh;
	}, [refresh]);
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
		const url = new URL(window.location.href);
		for (const [key, value] of Object.entries({
			tab,
			q: query,
			status,
			role,
			shot: tab === "shots" ? selected : null,
		})) {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		}
		window.history.replaceState(window.history.state, "", url);
	}, [tab, query, status, role, selected]);
	const run = async (task: () => Promise<unknown>) => {
		setBusy(true);
		try {
			await task();
			await latestRefresh.current();
		} catch (e) {
			toast.error(errorText(e));
		} finally {
			setBusy(false);
		}
	};
	const upload = async (files: FileList | null, direct = false) => {
		if (!files?.length) return;
		if (busy || !data) {
			toast.error("请等待当前上传完成或服务连接后再导入。");
			return;
		}
		const list = Array.from(files);
		setBusy(true);
		setTab(direct ? "shots" : "sources");
		setQuery("");
		setStatus("");
		setRole("");
		const batch = new Date().toISOString();
		let failed = 0;
		let duplicates = 0;
		const uploadHeaders = libraryHeaders();
		for (let index = 0; index < list.length; index++) {
			const file = list[index];
			setUploadState(`${index + 1} / ${list.length} · ${file.name}`);
			try {
				const response = await fetch(
					`/api/footage/imports?${new URLSearchParams({ filename: file.name, batch, direct: String(direct) })}`,
					{
						method: "POST",
						headers: {
							...uploadHeaders,
							"x-requested-with": "moirai-footage",
							"content-type": "application/octet-stream",
						},
						body: file,
					},
				);
				const value = await response.json();
				if (!response.ok) throw new Error(value.error ?? "上传失败");
				if (value.duplicate) {
					duplicates++;
					toast(`${file.name}：该片段已存在，已跳过上传`, {
						description: value.existingName
							? `已有素材：${value.existingName}`
							: undefined,
					});
				}
				if (direct && value.shotId) setSelected(value.shotId);
			} catch (e) {
				failed++;
				toast.error(`${file.name}：${errorText(e)}`);
			}
			await latestRefresh.current();
		}
		setBusy(false);
		setUploadState("");
		if (fileInput.current) fileInput.current.value = "";
		if (shotInput.current) shotInput.current.value = "";
		toast(
			`${list.length - failed - duplicates} 条已导入${duplicates ? `，${duplicates} 条已存在并跳过` : ""}${failed ? `，${failed} 条失败` : ""}`,
		);
	};
	const shot = data?.shots.find((s) => s.id === selected) ?? data?.shots[0];
	const folderMode = data?.storage?.mode === "folder";
	const teamMode = data?.runtime.computeLocation === "local";
	return (
		<div
			className="footage-app footage-page"
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
				void upload(e.dataTransfer.files, tab === "shots");
			}}
		>
			{dragging && (
				<div className="footage-drop-overlay">
					<Upload size={40} />
					<strong>{tab === "shots" ? "上传分镜" : "导入原片"}</strong>
				</div>
			)}
			<header className="footage-header">
				<div className="footage-title">
					<Link href="/projects" title="返回项目" aria-label="返回项目">
						<ArrowLeft size={18} />
					</Link>
					<h1>产品素材库</h1>
					<span className="footage-subtle">Moirai Cut</span>
					<RecognitionSettings
						data={data}
						disabled={busy || !data}
						onRefresh={refresh}
					/>
				</div>
				<div className="footage-connection">
					<HardDrive size={15} />
					<span
						className={
							(
								folderMode
									? data?.storage?.folderOnline && !data.storage.error
									: !data?.runtime.syncToNas || data.runtime.nasOnline
							)
								? "footage-online"
								: "footage-warning"
						}
					>
						{teamMode
							? "团队素材库 · 本机处理"
							: folderMode
								? data?.storage?.error
									? "文件夹同步异常"
									: data?.storage?.status === "running"
										? "文件夹同步中"
										: "本机文件夹"
								: !data?.runtime.syncToNas
									? "本地素材库"
									: data.runtime.nasOnline
										? "NAS 已连接"
										: "NAS 未连接"}
					</span>
					{!folderMode && !teamMode && (
						<label className="flex items-center gap-2 text-xs">
							<input
								type="checkbox"
								aria-label="同步至团队 NAS"
								checked={data?.runtime.syncToNas ?? false}
								disabled={busy || !data}
								onChange={(e) => {
									const syncToNas = e.target.checked;
									void run(() =>
										api("storage-settings", "POST", { syncToNas }),
									);
								}}
							/>
							同步至团队 NAS
						</label>
					)}
					<StorageSettings
						location={data?.storage}
						disabled={busy || !data}
						onRefresh={refresh}
					/>
					<Tool label="刷新" onClick={() => void refresh()}>
						<RefreshCw />
					</Tool>
				</div>
				<Dialog>
					<DialogTrigger asChild>
						<Button
							variant="outline"
							disabled={busy || !data}
							title="分析设置"
							aria-label="分析设置"
							size="icon"
						>
							<Settings2 />
						</Button>
					</DialogTrigger>
					<DialogContent
						className="footage-app footage-analysis-dialog"
						aria-describedby={undefined}
					>
						<DialogHeader>
							<DialogTitle>分析设置</DialogTitle>
						</DialogHeader>
						<div className="footage-analysis-fields">
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
						</div>
					</DialogContent>
				</Dialog>
				<div className="footage-import-actions">
					{(data?.runtime.syncToNas || folderMode) && (
						<Button
							variant="outline"
							disabled={
								busy ||
								!(folderMode
									? data?.storage?.folderOnline
									: data?.runtime.nasOnline)
							}
							onClick={() =>
								void run(async () => {
									const result = await api<{
										results: {
											error?: string;
											result?: { duplicate?: boolean };
										}[];
									}>("scan", "POST");
									setTab("sources");
									setQuery("");
									setStatus("");
									setRole("");
									toast(
										`扫描 ${result.results.length} 条，${result.results.filter((r) => r.result?.duplicate).length} 条已存在并跳过，失败 ${result.results.filter((r) => r.error).length} 条`,
									);
								})
							}
						>
							<FolderInput />
							{teamMode
								? "读取团队待导入"
								: folderMode
									? "读取文件夹待导入"
									: "读取 NAS 待导入"}
						</Button>
					)}
					<Button
						variant="outline"
						disabled={busy || !data}
						onClick={() => shotInput.current?.click()}
					>
						<Upload />
						上传分镜
					</Button>
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
				<input
					ref={shotInput}
					type="file"
					accept=".mp4,.mov,.m4v,.webm,.mkv,.avi"
					multiple
					className="sr-only"
					aria-label="选择分镜文件"
					onChange={(e) => void upload(e.target.files, true)}
				/>
			</header>
			<div className="footage-sticky-controls" ref={stickyControls}>
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
				{folderMode && data?.storage?.error && (
					<div className="footage-error" role="alert">
						{data.storage.error}
						<Button
							variant="outline"
							disabled={busy}
							onClick={() =>
								void run(() => api("storage-location/sync", "POST"))
							}
						>
							<RefreshCw />
							重试同步
						</Button>
					</div>
				)}
				<div className="footage-toolbar">
					<nav className="footage-tabs" aria-label="素材视图">
						{[
							["sources", "原片", data?.counts.sources],
							["shots", "分镜", data?.shots.length],
							[
								"jobs",
								"任务",
								data?.jobs.filter((j) =>
									["queued", "running"].includes(j.status),
								).length,
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
					{tab === "shots" && (
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
									"tagging",
									"recognizing",
									"pending_confirm",
									"rendering",
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
								aria-label="标签筛选"
								value={role}
								onChange={(e) => setRole(e.target.value)}
							>
								<option value="">全部标签</option>
								{TAG_CATEGORIES.map((label, index) => (
									<optgroup key={label} label={label}>
										<option value={`category:${index}`}>{label} · 全部</option>
										{data?.tagSettings?.groups[index].map((tag) => (
											<option key={tag} value={`tag:${tag}`}>
												{tag}
											</option>
										))}
									</optgroup>
								))}
							</select>
						</div>
					)}
					<div className="footage-summary">
						<span>
							待确认打标 <b>{data?.counts.pendingConfirm ?? 0}</b>
						</span>
						<span>
							处理中 <b>{data?.counts.processing ?? 0}</b>
						</span>
						<span className="footage-online">
							已入库 <b>{data?.counts.published ?? 0}</b>
						</span>
					</div>
				</div>
			</div>
			{tab === "shots" && (
				<>
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
										{data.sources.find((s) => s.id === item.sourceId)
											?.previewReady === false ? (
											<Film size={24} />
										) : (
											<Image
												unoptimized
												src={`/api/footage/media/source/${item.sourceId}/poster`}
												alt=""
												width={54}
												height={82}
											/>
										)}
									</div>
									<div>
										<strong>{item.name}</strong>
										<span>
											{seconds(item.startTicks)}–{seconds(item.endTicks)} s
										</span>
										<Status value={item.status} />
										<small>{item.tags.join(" · ")}</small>
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
									tagGroups={data.tagSettings?.groups ?? [[], [], [], []]}
									holidays={data.tagSettings?.holidays ?? []}
									folderMode={folderMode}
									teamMode={teamMode}
									source={data.sources.find((s) => s.id === shot.sourceId)!}
									onRefresh={refresh}
								/>
							) : (
								<div className="footage-empty">
									<Film size={36} />
									<p>{data?.sources.length ? "待分析结果" : "暂无素材"}</p>
									<Button
										disabled={busy || !data}
										onClick={() => shotInput.current?.click()}
									>
										<Plus />
										导入分镜
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
										<p className="text-xs">
											{syncLabel(source.nasSync, folderMode, teamMode)}
										</p>
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
												busy ||
												source.hasShot ||
												source.directUpload ||
												!["review", "failed"].includes(source.status)
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
										<SourceDeleteButton source={source} disabled={busy} onRefresh={refresh} />
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
											tag: "上传分镜",
											recognize_products: "商品识别",
											reanalyze: "重新分析打标",
											archive: "上传原片",
											analyze: "上传原片",
											render: "片段加工",
											publish: "本地入库",
											sync_source: "原片同步 NAS",
											sync_release: "视频与标签同步 NAS",
										}[job.kind] ?? job.kind}
										{["tag", "archive", "analyze"].includes(job.kind) && (
											<div className="footage-subtle">
												{
													{
														tag: "打标",
														archive: "准备素材",
														analyze: "截取分镜并打标",
													}[job.kind]
												}
											</div>
										)}
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
										{data.shots.some(
											(s) =>
												s.id === job.targetId || s.sourceId === job.targetId,
										) && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													const target = data.shots.find(
														(s) =>
															s.id === job.targetId ||
															s.sourceId === job.targetId,
													);
													setQuery("");
													setStatus("");
													setRole("");
													setSelected(target!.id);
													setTab("shots");
												}}
											>
												查看分镜
											</Button>
										)}
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
	tagGroups,
	holidays,
	folderMode,
	teamMode,
	source,
	onRefresh,
}: {
	shot: Shot;
	tagGroups: string[][];
	holidays: string[];
	folderMode: boolean;
	teamMode: boolean;
	source: FootageSource;
	onRefresh: () => Promise<void>;
}) {
	const [draft, setDraft] = useState(shot);
	const [tagDraft, setTagDraft] = useState<TagInputValue | null>(null);
	const currentTags = tagDraft ? readTagInput(tagDraft) : draft.tags;
	const configuredTags = tagGroups.flat();
	const customValue =
		tagDraft ??
		tagInputValue(draft.tags.filter((tag) => !configuredTags.includes(tag)));
	const [dirty, setDirty] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const confirmDelete = useRef<HTMLButtonElement>(null);
	const [busy, setBusy] = useState(false);
	const [view, setView] = useState(shot.directUpload ? "source" : "preview");
	const [previewTime, setPreviewTime] = useState(shot.startTicks / 120000);
	const [error, setError] = useState<string | null>(null);
	const video = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.code !== "Space" ||
				event.defaultPrevented ||
				event.isComposing ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				useKeybindingsStore.getState().overlayDepth > 0
			)
				return;
			const target = document.activeElement;
			if (
				target instanceof HTMLElement &&
				(isTypableDOMElement({ element: target }) ||
					target.closest(
						'select, video[controls], [role="combobox"], [role="checkbox"], [role="switch"]',
					))
			)
				return;
			const player = video.current;
			if (!player || player.error) return;
			event.preventDefault();
			if (event.repeat) return;
			if (player.paused) {
				const end = Number(player.dataset.playbackEnd ?? player.duration);
				const start = Number(player.dataset.playbackStart ?? 0);
				if (
					Number.isFinite(end) &&
					(player.currentTime < start || player.currentTime >= end - 0.02)
				)
					player.currentTime = start;
				void player.play().catch((error: unknown) => {
					if (!(error instanceof DOMException && error.name === "AbortError"))
						toast.error("无法播放视频，请重试");
				});
			} else player.pause();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
	useEffect(() => {
		if (!dirty) {
			setDraft(shot);
			setTagDraft(null);
		}
	}, [shot, dirty]);
	const change = (patch: Partial<Shot>) => {
		if (
			!shot.directUpload &&
			(patch.recipe ||
				patch.startTicks !== undefined ||
				patch.endTicks !== undefined)
		) {
			if (
				draft.recipe.colorMode === "auto" &&
				(!patch.recipe || patch.recipe.colorMode === "auto")
			) {
				patch = {
					...patch,
					recipe: { ...(patch.recipe ?? draft.recipe), colorMode: "adaptive" },
				};
			}
			if (view !== "preview")
				setPreviewTime(
					view === "source"
						? (video.current?.currentTime ?? draft.startTicks / 120000)
						: draft.startTicks / 120000,
				);
			setView("preview");
		}
		setDraft((d) => ({ ...d, ...patch }));
		setDirty(true);
	};
	const recipe = (patch: Partial<Recipe>) =>
		change({ recipe: { ...draft.recipe, ...patch } });
	const locked =
		busy ||
		["rendering", "publishing", "tagging", "recognizing"].includes(shot.status);
	const stale = dirty && draft.revision !== shot.revision;
	const rangeNeedsReview = !!draft.labelsNeedReview || draft.startTicks !== shot.startTicks || draft.endTicks !== shot.endTicks;
	const removedConfiguredTags = (draft.analyzedTags ?? []).filter((tag) => draft.tags.includes(tag) && !configuredTags.includes(tag));
	const save = async (confirm = false) => {
		const result = await api<Shot>(
			`shots/${shot.id}${confirm ? "/confirm" : ""}`,
			confirm ? "POST" : "PATCH",
			{
				baseRevision: draft.revision,
				name: draft.name,
				startTicks: draft.startTicks,
				endTicks: draft.endTicks,
				description: draft.description,
				details: draft.details ?? EMPTY_SHOT_DETAILS,
				keepOriginalAudio: draft.keepOriginalAudio ?? false,
				isFeatured: draft.isFeatured ?? false,
				hasHoliday: draft.hasHoliday ?? false,
				holidayTags: draft.hasHoliday ? (draft.holidayTags ?? []) : [],
				tags: tagDraft
					? [
							...new Set([
								...draft.tags.filter((tag) => configuredTags.includes(tag)),
								...readTagInput(tagDraft),
							]),
						]
					: draft.tags,
				roles: draft.roles,
				unsupportedClaims: draft.unsupportedClaims,
				recipe: draft.recipe,
			},
		);
		setDraft({ ...result, hasOutput: shot.hasOutput });
		setTagDraft(null);
		setDirty(false);
		return result.revision;
	};
	const perform = async (action?: string) => {
		setBusy(true);
		setError(null);
		try {
			if (action === "reanalyze" || action === "reanalyze_replace") {
				const revision = dirty ? await save() : shot.revision;
				await api(`shots/${shot.id}/action`, "POST", {
					baseRevision: revision,
					action,
				});
				setTagDraft(null);
				setDirty(false);
				toast.success("已开始重新分析打标");
			} else if (action === "confirm_labels") {
				await save(true);
			} else {
				const revision = dirty ? await save() : shot.revision;
				if (action)
					await api(`shots/${shot.id}/action`, "POST", {
						baseRevision: revision,
						action,
					});
			}
			await onRefresh();
		} catch (e) {
			setError(errorText(e));
		} finally {
			setBusy(false);
		}
	};
	const actualView =
		view === "preview" && !shot.directUpload ? "preview" : "source";
	return (
		<>
			<div className="footage-detail-heading">
				<div>
					<div className="footage-shot-title">
						<h2>{shot.name}</h2>
						<ShotLineage key={shot.id} shotId={shot.id} />
						<ReanalysisDialog
							disabled={locked || stale || shot.status === "rejected"}
							onAnalyze={async (replace) => {
								setBusy(true);
								try {
									const revision = dirty ? await save() : shot.revision;
									await api(`shots/${shot.id}/action`, "POST", { baseRevision: revision, action: replace ? "reanalyze_replace" : "reanalyze" });
									setDirty(false);
									setTagDraft(null);
									await onRefresh();
								} finally { setBusy(false); }
							}}
						/>
					</div>
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
			{(rangeNeedsReview || removedConfiguredTags.length > 0) && (
				<div className="footage-review-notice" role="status">
					{rangeNeedsReview && <p>截取范围已变化，原有标签、商品与节日结果待复核。确认打标时将按当前范围保存。</p>}
					{removedConfiguredTags.length > 0 && <p>标签配置已移除：{removedConfiguredTags.join("、")}。当前片段仍保留这些标签，请核对。</p>}
				</div>
			)}
			{shot.analysisSuggestion && (
				<>
					{dirty && <div className="footage-review-notice">当前有未保存修改，暂不能采纳建议。<Button variant="link" onClick={() => { setDraft(shot); setDirty(false); setTagDraft(null); }}>撤销本次修改</Button></div>}
					<AnalysisSuggestionPanel
						suggestion={shot.analysisSuggestion}
						current={draft}
						disabled={locked || dirty || stale}
						onApply={async (fields) => {
							const result = await api<Shot>(`shots/${shot.id}/action`, "POST", { baseRevision: shot.revision, action: "accept_analysis", fields });
							setDraft(result); setTagDraft(null); setDirty(false); await onRefresh();
						}}
						onDismiss={async () => { await api(`shots/${shot.id}/action`, "POST", { baseRevision: shot.revision, action: "dismiss_analysis" }); await onRefresh(); }}
					/>
				</>
			)}
			<div
				className={`footage-review-grid${shot.directUpload ? " is-direct-upload" : ""}`}
			>
				<section className="footage-preview-section" aria-label="视频预览">
					<div className="footage-preview-toolbar">
						{!shot.directUpload && (
							<div
								className="footage-view-switch"
								role="group"
								aria-label="预览版本"
							>
								<button
									type="button"
									aria-pressed={actualView === "preview"}
									onClick={() => {
										setPreviewTime(
											actualView === "source"
												? (video.current?.currentTime ??
														draft.startTicks / 120000)
												: draft.startTicks / 120000,
										);
										setView("preview");
									}}
								>
									实时预览
								</button>
								<button
									type="button"
									aria-pressed={actualView === "source"}
									onClick={() => setView("source")}
								>
									原片
								</button>
							</div>
						)}
						<TooltipProvider delayDuration={200}>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										className="footage-evidence-trigger"
										aria-label="画面证据"
									>
										<Info size={14} />
										画面证据
									</button>
								</TooltipTrigger>
								<TooltipPrimitive.Portal>
									<TooltipContent
										side="bottom"
										align="end"
										className="max-w-[380px] max-h-[60vh] overflow-y-auto p-3 text-xs leading-5 break-words"
									>
										<p>{shot.evidence || "暂无画面证据"}</p>
										<p className="mt-2 text-muted-foreground">
											{shot.modelId} ·{" "}
											{shot.inputMode === "video"
												? "视频分析"
												: shot.inputMode === "frames"
													? "采样帧分析"
													: "人工标注"}
										</p>
									</TooltipContent>
								</TooltipPrimitive.Portal>
							</Tooltip>
						</TooltipProvider>
					</div>
					{!shot.directUpload && shot.publishedRelease && (
						<div className="footage-preview-publication">
							<span className="footage-subtle">
								{dirty
									? "当前修改 · 未保存"
									: shot.revision !== shot.publishedRelease.revision
										? "当前编辑版本"
										: `已入库 · v${shot.publishedRelease.revision}`}
							</span>
							<PublishedVideo
								onOpen={() => video.current?.pause()}
								release={shot.publishedRelease}
								name={shot.name}
								changed={
									dirty || shot.revision !== shot.publishedRelease.revision
								}
							/>
						</div>
					)}
					<div className="footage-video">
						{source.previewReady === false ? (
							<div className="footage-empty">
								<Film />
								<p>{shot.status === "failed" ? "预览准备失败" : "准备预览"}</p>
							</div>
						) : actualView === "preview" ? (
							<LivePreview
								shot={draft}
								source={source}
								videoRef={video}
								initialTime={previewTime}
							/>
						) : (
							<>
								{/* Raw footage has no authored captions until transcription is available. */}
								{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
								<video
									ref={video}
									key={`${shot.id}-${actualView}-${shot.revision}`}
									controls
									playsInline
									preload="metadata"
									src={`/api/footage/media/source/${source.id}/preview`}
									poster={`/api/footage/media/source/${source.id}/poster`}
									onLoadedMetadata={() => {
										if (actualView === "source" && video.current)
											video.current.currentTime = draft.startTicks / 120000;
									}}
								/>
							</>
						)}
					</div>
					{!shot.directUpload && (
						<>
							<TrimControl
								src={`/api/footage/media/source/${source.id}/preview`}
								durationTicks={source.durationTicks}
								startTicks={draft.startTicks}
								endTicks={draft.endTicks}
								videoRef={video}
								disabled={locked || source.previewReady === false}
								onChange={(startTicks, endTicks) =>
									change({ startTicks, endTicks })
								}
								onSeek={setPreviewTime}
							/>
							{shot.qualityIssues.length > 0 && (
								<ul className="footage-quality">
									{shot.qualityIssues.map((issue) => (
										<li key={issue}>{issue}</li>
									))}
								</ul>
							)}
						</>
					)}
				</section>
				{!shot.directUpload && (
					<fieldset
						className="footage-video-adjustments"
						disabled={locked}
						aria-label="画面调整"
					>
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
							<div className="footage-orientation">
								<span>旋转与镜像</span>
								<div role="group" aria-label="旋转与镜像">
									<Tool
										label="向左旋转"
										onClick={() =>
											recipe({
												rotation: (draft.recipe.rotation + 270) % 360,
												flipHorizontal: !!draft.recipe.flipVertical,
												flipVertical: !!draft.recipe.flipHorizontal,
											})
										}
									>
										<RotateCcw />
									</Tool>
									<Tool
										label="向右旋转"
										onClick={() =>
											recipe({
												rotation: (draft.recipe.rotation + 90) % 360,
												flipHorizontal: !!draft.recipe.flipVertical,
												flipVertical: !!draft.recipe.flipHorizontal,
											})
										}
									>
										<RotateCw />
									</Tool>
									<Tool
										label="左右镜像"
										aria-pressed={!!draft.recipe.flipHorizontal}
										onClick={() =>
											recipe({ flipHorizontal: !draft.recipe.flipHorizontal })
										}
									>
										<FlipHorizontal2 />
									</Tool>
									<Tool
										label="上下镜像"
										aria-pressed={!!draft.recipe.flipVertical}
										onClick={() =>
											recipe({ flipVertical: !draft.recipe.flipVertical })
										}
									>
										<FlipVertical2 />
									</Tool>
								</div>
							</div>
						</div>
						<PushInControl value={draft.recipe} onChange={recipe} />
						<label>
							调色
							<select
								aria-label="调色"
								value={
									["manual", "preserve"].includes(draft.recipe.colorMode)
										? "preserve"
										: "adaptive"
								}
								onChange={(e) => recipe({ colorMode: e.target.value })}
							>
								<option value="adaptive">AI 调色</option>
								<option value="preserve">原色</option>
							</select>
						</label>
						<div className="footage-color-controls">
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									recipe({
										brightness: 0,
										contrast: 1,
										saturation: 1,
										exposure: 0,
										temperature: 0,
										tint: 0,
										highlights: 0,
										shadows: 0,
										whites: 0,
										blacks: 0,
										vibrance: 0,
									})
								}
							>
								<RotateCcw />
								重置自定义调色
							</Button>
							{(
								[
									["brightness", "亮度", -0.12, 0.12],
									["contrast", "对比度", 0.85, 1.15],
									["saturation", "饱和度", 0.85, 1.15],
									["exposure", "曝光（EV）", -2, 2],
									["temperature", "色温", -1, 1],
									["tint", "色调", -1, 1],
									["highlights", "高光", -1, 1],
									["shadows", "阴影", -1, 1],
									["whites", "白色色阶", -1, 1],
									["blacks", "黑色色阶", -1, 1],
									["vibrance", "自然饱和度", -1, 1],
								] as const
							).map(([key, label, min, max]) => (
								<label key={key}>
									{label}
									<output>{(draft.recipe[key] ?? 0).toFixed(2)}</output>
									<input
										type="range"
										min={min}
										max={max}
										step={0.005}
										value={draft.recipe[key] ?? 0}
										aria-label={label}
										onChange={(e) => recipe({ [key]: Number(e.target.value) })}
									/>
								</label>
							))}
						</div>
					</fieldset>
				)}
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
						<div
							className="footage-tag-selection"
							role="group"
							aria-label="配置标签选择"
						>
							{TAG_CATEGORIES.map((category, index) => (
								<div className="footage-tag-selection-group" key={category}>
									<h4>{category}</h4>
									<div className="footage-tag-options">
										{tagGroups[index].length === 0 && (
											<span className="footage-subtle">暂无配置标签</span>
										)}
										{tagGroups[index].map((tag) => (
											<div className="footage-tag-with-evidence" key={tag}>
											<label>
												<input
													type="checkbox"
													checked={
														draft.tags.includes(tag) ||
														currentTags.includes(tag)
													}
													onChange={(e) => {
														const tags = [
															...new Set([
																...draft.tags.filter((value) =>
																	configuredTags.includes(value),
																),
																...readTagInput(customValue),
															]),
														];
														change({
															tags: e.target.checked
																? [...new Set([...tags, tag])]
																: tags.filter((value) => value !== tag),
														});
														setTagDraft(null);
													}}
												/>
												{tag}
											</label>
											{draft.tags.includes(tag) && <TagEvidenceView tag={tag} evidence={draft.tagEvidence ?? []} legacyEvidence={draft.evidence} stale={rangeNeedsReview || (draft.tagEvidence ?? []).some((e) => e.tag === tag && (e.startSeconds < draft.startTicks / 120000 || e.endSeconds > draft.endTicks / 120000))} onSeek={(time) => {
												const player = video.current;
												if (player) { player.pause(); player.currentTime = time - Number(player.dataset.sourceOffset ?? 0); }
											}} />}
											</div>
										))}
									</div>
								</div>
							))}
						</div>
						<div className="footage-tag-field">
							<div className="footage-product-result" role="status">
								商品识别：{shot.status === "recognizing" ? "识别中" : shot.status === "failed" ? "分析失败，识别结果待核对" : rangeNeedsReview ? "范围已变化，待复核" : draft.productRecognitionStatus === "unconfigured" ? "未配置参考商品" : (draft.productMatches?.length ?? 0) > 0 ? `已匹配 ${draft.productMatches!.map((m) => m.alias).join("、")}` : draft.productRecognitionStatus === "unmatched" ? "未确认匹配到配置商品" : draft.productRecognitionStatus === "failed" ? "识别失败" : "未记录识别结果"}
							</div>
							<span>自定义标签</span>
							<TagInput
								label="自定义标签"
								value={customValue}
								disabled={locked}
								onChange={(value) => {
									setTagDraft(value);
									change({});
								}}
							/>
						</div>
						<ShotMetadata shot={draft} holidays={holidays} onChange={change} />
						{draft.productMatches?.map((match) => (
							<p className="footage-subtle" key={match.productId}>
								<strong>{match.alias}</strong> · {match.evidence}
							</p>
						))}
						<label>
							无法证明的卖点
							<textarea
								rows={2}
								value={draft.unsupportedClaims.join("\n")}
								onChange={(e) =>
									change({ unsupportedClaims: e.target.value.split("\n") })
								}
							/>
						</label>
					</fieldset>
				</section>
			</div>
			{shot.status === "published" && (
				<p className="text-sm">
					{syncLabel(shot.nasSync, folderMode, teamMode)}
				</p>
			)}
			<footer className="footage-review-actions">
				<div>
					<Tool
						label="淘汰片段"
						disabled={locked || stale || shot.status === "rejected"}
						onClick={() => void perform("reject")}
					>
						<X />
					</Tool>
					<Dialog
						open={deleteOpen}
						onOpenChange={(open) => {
							if (!busy) setDeleteOpen(open);
						}}
					>
						<DialogTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								title="删除片段"
								aria-label="删除片段"
								disabled={locked || stale}
							>
								<Trash2 />
							</Button>
						</DialogTrigger>
						<DialogContent aria-describedby={undefined} onOpenAutoFocus={(event) => {
							event.preventDefault();
							confirmDelete.current?.focus();
						}}>
							<DialogHeader>
								<DialogTitle>删除片段</DialogTitle>
							</DialogHeader>
							<div className="p-6 space-y-4">
								<p>
									从素材库移除“{shot.name}
									”及其对应原片？同一原片的其他分镜也会移除。磁盘文件和历史工程引用保留，当前未保存的修改将丢弃。
								</p>
								<div className="flex justify-end gap-2">
									<Button
										variant="outline"
										disabled={busy}
										onClick={() => setDeleteOpen(false)}
									>
										取消
									</Button>
									<Button
										variant="destructive"
										ref={confirmDelete}
										disabled={busy}
										onClick={async () => {
											setBusy(true);
											try {
												await api(`shots/${shot.id}/action`, "POST", {
													baseRevision: shot.revision,
													action: "delete",
												});
												setDeleteOpen(false);
												await onRefresh();
												toast.success("分镜及对应原片已删除");
											} catch (e) {
												toast.error(errorText(e));
											} finally {
												setBusy(false);
											}
										}}
									>
										<Trash2 />
										{busy ? "正在删除" : "删除"}
									</Button>
								</div>
							</div>
						</DialogContent>
					</Dialog>
					{shot.status === "published" && (
						<Button variant="outline" asChild>
							<a
								href={`/api/footage/media/shot/${shot.id}/master`}
								download={`${shot.name}.${shot.directUpload ? source.name.split(".").pop()?.toLowerCase() : "mp4"}`}
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
						<Button
							disabled={
								locked || stale || (shot.status === "published" && !dirty)
							}
							onClick={() => void perform("confirm_labels")}
						>
							{locked ? (
								<Loader2 className="animate-spin" />
							) : shot.labelsConfirmed || shot.status === "published" ? (
								<Save />
							) : (
								<Check />
							)}
							{shot.status === "rendering"
								? "加工并入库中"
								: shot.status === "publishing"
									? "正在入库"
									: busy
										? "正在保存"
										: shot.labelsConfirmed || shot.status === "published"
											? "保存打标结果"
											: "确认打标"}
						</Button>
					)}
				</div>
			</footer>
		</>
	);
}
