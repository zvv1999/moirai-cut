"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import {
	getProjectFileSyncState,
	acknowledgeProjectFileSync,
	subscribeToProjectFileSync,
	type ProjectFileSyncState,
} from "@/services/storage/project-file-sync";
import type { ProjectRevisionDiff } from "@/project/revision-diff";
import { ReliabilityWorkbench } from "./reliability-workbench";
import { AgentWorkbench } from "./agent-workbench";

interface RevisionEntry {
	revision: number;
	name: string | null;
	kind: "named" | "automatic";
	createdAt: string | null;
	updatedAt: string | null;
	summary?: {
		elementCount?: number;
		trackCount?: number;
	};
}

type AgentBadgeSurface = "smart-edit" | "project-history" | null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage({
	value,
	fallback,
}: {
	value: unknown;
	fallback: string;
}): string {
	return isRecord(value) && typeof value.error === "string"
		? value.error
		: fallback;
}

function revisionOf(value: unknown): number | null {
	return isRecord(value) && typeof value.revision === "number"
		? value.revision
		: null;
}

function parseRevisionEntry(value: unknown): RevisionEntry | null {
	if (!isRecord(value) || typeof value.revision !== "number") return null;
	const summaryRecord = isRecord(value.summary) ? value.summary : null;
	const summary = summaryRecord
		? {
				elementCount:
					typeof summaryRecord.elementCount === "number"
						? summaryRecord.elementCount
						: undefined,
				trackCount:
					typeof summaryRecord.trackCount === "number"
						? summaryRecord.trackCount
						: undefined,
			}
		: undefined;
	return {
		revision: value.revision,
		name: typeof value.name === "string" ? value.name : null,
		kind: value.kind === "named" ? "named" : "automatic",
		createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
		updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
		summary,
	};
}

function parseRevisionList(value: unknown): RevisionEntry[] {
	if (!isRecord(value) || !Array.isArray(value.revisions)) return [];
	return value.revisions
		.map(parseRevisionEntry)
		.filter((entry): entry is RevisionEntry => entry !== null);
}

function isProjectRevisionDiff(value: unknown): value is ProjectRevisionDiff {
	if (!isRecord(value) || !isRecord(value.summary)) return false;
	const summary = value.summary;
	return (
		typeof value.fromRevision === "number" &&
		typeof value.toRevision === "number" &&
		Array.isArray(value.changes) &&
		["added", "removed", "moved", "renamed", "changed"].every(
			(kind) => typeof summary[kind] === "number",
		)
	);
}

/**
 * Two mutually-exclusive surfaces share one compact launcher area:
 * smart editing owns agent context/activity, while project history owns
 * autosave, snapshots, comparison, and recovery.
 */
export function AgentBadge() {
	const editor = useEditor();
	const save = useEditor((instance) => instance.save.getState());
	const commandHistory = useEditor((instance) =>
		instance.command.getHistoryState(),
	);
	const projectFileConflict = useEditor((instance) =>
		instance.project.getFileConflict(),
	);
	const projectId = editor.project.getActiveOrNull()?.metadata.id ?? null;
	const [sync, setSync] = useState<ProjectFileSyncState>(
		getProjectFileSyncState(),
	);
	const [openSurface, setOpenSurface] = useState<AgentBadgeSurface>(null);
	const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
	const [currentRevision, setCurrentRevision] = useState<number | null>(null);
	const [snapshotName, setSnapshotName] = useState("");
	const [diff, setDiff] = useState<ProjectRevisionDiff | null>(null);
	const [loadingRevision, setLoadingRevision] = useState<number | null>(null);
	const [confirmRevision, setConfirmRevision] = useState<number | null>(null);
	const [duplicatingRevision, setDuplicatingRevision] = useState<number | null>(
		null,
	);
	const [confirmDiscardLocal, setConfirmDiscardLocal] = useState(false);
	const fileConflictRevision =
		save.conflictRevision ??
		projectFileConflict?.revision ??
		(sync.blockedByUnsavedChanges ? sync.externalRevision : null);

	useEffect(() => subscribeToProjectFileSync(setSync), []);

	const refreshHistory = useCallback(async () => {
		if (!projectId) return;
		try {
			const [historyResponse, projectResponse] = await Promise.all([
				fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`),
				fetch(`/api/projects/${encodeURIComponent(projectId)}`),
			]);
			const history: unknown = await historyResponse.json();
			const project: unknown = await projectResponse.json();
			setRevisions(parseRevisionList(history));
			setCurrentRevision(revisionOf(project));
		} catch {
			setRevisions([]);
			setCurrentRevision(null);
		}
	}, [projectId]);

	useEffect(() => {
		if (
			openSurface !== "project-history" ||
			save.status !== "saved" ||
			save.revision === null
		) {
			return;
		}
		queueMicrotask(() => {
			void refreshHistory();
		});
	}, [openSurface, refreshHistory, save.revision, save.status]);

	const createSnapshot = async () => {
		if (!projectId || !snapshotName.trim()) return;
		const response = await fetch(
			`/api/projects/${encodeURIComponent(projectId)}/snapshots`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: snapshotName.trim(),
					expectedRevision: currentRevision,
				}),
			},
		);
		const payload: unknown = await response.json().catch(() => ({}));
		if (!response.ok) {
			toast.error(
				errorMessage({ value: payload, fallback: "保存快照失败" }),
			);
			return;
		}
		toast(`快照已保存为版本 ${revisionOf(payload) ?? "未知"}`);
		setSnapshotName("");
		await refreshHistory();
	};

	const compare = async (revision: number) => {
		if (!projectId) return;
		setLoadingRevision(revision);
		setConfirmRevision(null);
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/compare/${revision}`,
			);
			const payload: unknown = await response.json().catch(() => ({}));
			if (!response.ok || !isProjectRevisionDiff(payload)) {
				toast.error(
					errorMessage({ value: payload, fallback: "版本比较失败" }),
				);
				return;
			}
			setDiff(payload);
		} finally {
			setLoadingRevision(null);
		}
	};

	const restore = async (revision: number) => {
		if (!projectId || currentRevision === null) return;
		const response = await fetch(
			`/api/projects/${encodeURIComponent(projectId)}/restore/${revision}`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ expectedRevision: currentRevision }),
			},
		);
		const payload: unknown = await response.json().catch(() => ({}));
		if (response.ok) {
			toast(
				`快照已恢复为版本 ${revisionOf(payload) ?? "未知"}`,
			);
			setDiff(null);
			setConfirmRevision(null);
			await refreshHistory();
		} else {
			toast.error(errorMessage({ value: payload, fallback: "恢复版本失败" }));
		}
	};

	const duplicate = async (entry: RevisionEntry) => {
		if (!projectId) return;
		setDuplicatingRevision(entry.revision);
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/duplicate/${entry.revision}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						name: `${entry.name ?? "工程版本"} · 副本`,
					}),
				},
			);
			const payload: unknown = await response.json().catch(() => ({}));
			const duplicatedProjectId =
				isRecord(payload) && typeof payload.projectId === "string"
					? payload.projectId
					: null;
			if (!response.ok || !duplicatedProjectId) {
				throw new Error(
					isRecord(payload) && typeof payload.error === "string"
						? payload.error
						: "复制版本失败",
				);
			}
			const duplicatedName =
				isRecord(payload) && typeof payload.name === "string"
					? payload.name
					: "版本副本";
			toast(`已创建 ${duplicatedName}`, {
				description: `独立工程 ${duplicatedProjectId.slice(0, 8)}…`,
			});
		} catch (error) {
			toast.error("无法复制此版本", {
				description:
					error instanceof Error ? error.message : "请重试",
			});
		} finally {
			setDuplicatingRevision(null);
		}
	};

	const loadDiskVersion = async () => {
		if (!projectId) return;
		const applied = await editor.project.applyExternalDocument();
		if (!applied) {
			toast.error("无法加载磁盘版本");
			return;
		}
		setConfirmDiscardLocal(false);
		const revision = editor.project.getKnownFileRevision(projectId);
		if (revision !== null) {
			acknowledgeProjectFileSync({ revision });
		}
		toast("已加载最新磁盘版本", {
			description: "本地待保存改动已按你的确认丢弃。",
		});
		await refreshHistory();
	};

	const { agent, blockedByUnsavedChanges } = sync;

	return (
		<div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
			{openSurface && (
				<div
					className={`bg-popover text-popover-foreground border-border max-h-[82vh] overflow-y-auto rounded-lg border p-3 shadow-xl ${
						openSurface === "smart-edit" ? "w-[34rem]" : "w-[32rem]"
					}`}
					aria-label={
						openSurface === "smart-edit" ? "智能剪辑面板" : "工程历史面板"
					}
				>
					{openSurface === "smart-edit" ? (
						<>
							<div className="border-border mb-3 flex items-center justify-between border-b pb-2">
								<div>
									<div className="text-sm font-semibold">智能剪辑工作台</div>
									<div className="text-[11px] opacity-55">
										Codex 上下文 · 计划复核 · 画面质检
									</div>
								</div>
								<span className="bg-cyan-500/10 text-cyan-600 rounded px-2 py-1 font-mono text-[10px] dark:text-cyan-300">
									Agent v{editor.agent.revision}
								</span>
							</div>
							<AgentWorkbench />
							<ReliabilityWorkbench />
						</>
					) : (
						<div className="border-border mb-3 flex items-start justify-between gap-3 border-b pb-2">
							<div>
								<div className="text-sm font-semibold">工程历史</div>
								<div className="text-[11px] opacity-60">
									当前版本 {currentRevision ?? "…"} · 恢复前请先比较
								</div>
							</div>
							<span className="bg-muted rounded px-2 py-1 font-mono text-[10px]">
								已保存 {revisions.length} 个
							</span>
						</div>
					)}

					{openSurface === "project-history" ? (
						<>
							<div className="mb-3 grid grid-cols-2 gap-2">
								<div className="border-border bg-muted/20 rounded-md border p-2">
									<div className="text-[10px] font-semibold tracking-wide uppercase opacity-50">
										持续自动保存
									</div>
									<div className="mt-1 flex items-center gap-2 text-xs font-medium">
										<span
											className={`size-2 rounded-full ${
												save.status === "error"
													? "bg-red-500"
													: save.pendingChanges
														? "bg-amber-500"
														: "bg-emerald-500"
											}`}
										/>
										{save.status === "saving"
											? "保存中…"
											: save.status === "error"
												? "保存失败"
												: save.pendingChanges
													? "改动等待保存"
													: save.revision === null
														? "自动保存已就绪"
														: `已保存至版本 ${save.revision}`}
									</div>
									{fileConflictRevision !== null ? (
										<div className="mt-1">
											<div className="text-[10px] text-amber-600 dark:text-amber-400">
												磁盘版本已更新至 {fileConflictRevision}
												，自动保存已暂停。
											</div>
											{confirmDiscardLocal ? (
												<div className="mt-1 flex gap-1">
													<button
														type="button"
														className="rounded px-1.5 py-0.5 text-[10px]"
														onClick={() => setConfirmDiscardLocal(false)}
													>
														取消
													</button>
													<button
														type="button"
														className="bg-destructive text-destructive-foreground rounded px-1.5 py-0.5 text-[10px]"
														onClick={() => void loadDiskVersion()}
													>
														确认丢弃本地改动
													</button>
												</div>
											) : (
												<button
													type="button"
													className="text-destructive mt-1 text-[10px] hover:underline"
													onClick={() => setConfirmDiscardLocal(true)}
												>
													加载磁盘版本…
												</button>
											)}
										</div>
									) : save.status === "error" ? (
										<button
											type="button"
											className="text-destructive mt-1 text-[10px] hover:underline"
											onClick={() => void editor.save.retry()}
										>
											重试 · {save.error}
										</button>
									) : null}
								</div>
								<div className="border-border bg-muted/20 rounded-md border p-2">
									<div className="text-[10px] font-semibold tracking-wide uppercase opacity-50">
										共享命令历史
									</div>
									<div className="mt-1 flex gap-1">
										<button
											type="button"
											disabled={commandHistory.undoDepth === 0}
											className="border-input flex-1 truncate rounded border px-2 py-1 text-[10px] disabled:opacity-35"
											title={commandHistory.undoLabel ?? "没有可撤销的操作"}
											onClick={() => editor.command.undo()}
										>
											撤销 {commandHistory.undoLabel ?? ""}
										</button>
										<button
											type="button"
											disabled={commandHistory.redoDepth === 0}
											className="border-input flex-1 truncate rounded border px-2 py-1 text-[10px] disabled:opacity-35"
											title={commandHistory.redoLabel ?? "没有可重做的操作"}
											onClick={() => editor.command.redo()}
										>
											重做 {commandHistory.redoLabel ?? ""}
										</button>
									</div>
									<div className="mt-1 font-mono text-[9px] opacity-45">
										撤销 {commandHistory.undoDepth} · 重做{" "}
										{commandHistory.redoDepth} · 人工 + 智能体
									</div>
								</div>
							</div>

							<div className="mb-3 flex gap-2">
								<input
									className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs"
									aria-label="快照名称"
									placeholder="例如：已确认粗剪"
									value={snapshotName}
									onChange={(event) => setSnapshotName(event.target.value)}
								/>
								<button
									type="button"
									className="bg-foreground text-background rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
									disabled={!snapshotName.trim() || currentRevision === null}
									onClick={() => void createSnapshot()}
								>
									保存快照
								</button>
							</div>

							<div className="mb-1 text-xs font-medium opacity-70">
								时间线历史
							</div>
							{revisions.length === 0 ? (
								<div className="border-border rounded-md border border-dashed p-4 text-center text-xs opacity-50">
									暂无快照
								</div>
							) : (
								<ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
									{revisions.slice(0, 50).map((entry) => (
										<li
											key={entry.revision}
											className="border-border flex items-center gap-2 rounded-md border p-2 text-xs"
										>
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium">
													{entry.name ?? `自动版本 ${entry.revision}`}
												</div>
												<div className="font-mono text-[10px] opacity-50">
													版本 {entry.revision}
													{entry.summary?.elementCount !== undefined
														? ` · ${entry.summary.elementCount} 个素材`
														: ""}
													{" · "}
													{entry.createdAt || entry.updatedAt
														? new Date(
																entry.createdAt ?? entry.updatedAt ?? "",
															).toLocaleTimeString()
														: "时间未知"}
												</div>
											</div>
											<div className="flex items-center">
												<button
													type="button"
													className="text-primary rounded px-2 py-1 hover:underline"
													disabled={loadingRevision === entry.revision}
													onClick={() => void compare(entry.revision)}
												>
													{loadingRevision === entry.revision
														? "比较中…"
														: "比较"}
												</button>
												<button
													type="button"
													className="rounded px-2 py-1 opacity-60 hover:opacity-100"
													disabled={duplicatingRevision === entry.revision}
													onClick={() => void duplicate(entry)}
												>
													{duplicatingRevision === entry.revision
														? "复制中…"
														: "复制"}
												</button>
											</div>
										</li>
									))}
								</ul>
							)}

							{diff ? (
								<div className="border-border bg-muted/20 mt-3 rounded-md border p-2">
									<div className="flex items-center justify-between">
										<strong className="text-xs">
											版本 {diff.fromRevision} → {diff.toRevision}
										</strong>
										<button
											type="button"
											className="text-xs opacity-60 hover:opacity-100"
											onClick={() => {
												setDiff(null);
												setConfirmRevision(null);
											}}
										>
											关闭
										</button>
									</div>
									<div className="my-2 grid grid-cols-5 gap-1 text-center text-[10px]">
										{(
											[
												["新增", diff.summary.added],
												["移除", diff.summary.removed],
												["移动", diff.summary.moved],
												["重命名", diff.summary.renamed],
												["修改", diff.summary.changed],
											] as const
										).map(([label, value]) => (
											<div key={label} className="bg-background rounded p-1">
												<strong className="block text-xs">{value}</strong>
												{label}
											</div>
										))}
									</div>
									{diff.changes.length === 0 ? (
										<p className="text-xs opacity-60">
											时间线没有差异，无需恢复。
										</p>
									) : (
										<ul className="mb-2 max-h-24 space-y-1 overflow-y-auto text-[10px]">
											{diff.changes.slice(0, 12).map((change, index) => (
												<li key={`${change.kind}-${change.elementId}-${index}`}>
													<span className="font-mono uppercase opacity-50">
														{change.kind}
													</span>{" "}
													{change.name} · {change.detail}
												</li>
											))}
										</ul>
									)}
									{confirmRevision === diff.toRevision ? (
										<div className="border-amber-500/30 bg-amber-500/10 rounded border p-2">
											<p className="mb-2 text-[11px]">
												恢复版本 {diff.toRevision}？当前状态会先另存为一个版本。
											</p>
											<div className="flex justify-end gap-2">
												<button
													type="button"
													className="rounded px-2 py-1 text-xs"
													onClick={() => setConfirmRevision(null)}
												>
													取消
												</button>
												<button
													type="button"
													className="bg-foreground text-background rounded px-2 py-1 text-xs"
													onClick={() => void restore(diff.toRevision)}
												>
													确认恢复
												</button>
											</div>
										</div>
									) : (
										<button
											type="button"
											className="text-primary text-xs font-medium hover:underline disabled:opacity-40"
											disabled={diff.changes.length === 0}
											onClick={() => setConfirmRevision(diff.toRevision)}
										>
											恢复此快照
										</button>
									)}
								</div>
							) : null}
						</>
					) : null}

					{openSurface === "smart-edit" &&
					(agent.active || agent.events.length > 0) ? (
						<div className="mt-3">
							<div className="mb-1 text-xs font-medium opacity-70">
								最近的智能体活动
							</div>
							{agent.events.length === 0 ? (
								<div className="text-xs opacity-50">暂无活动</div>
							) : (
								<ul className="flex max-h-24 flex-col gap-1 overflow-y-auto">
									{[...agent.events].reverse().map((event) => (
										<li key={event.seq} className="text-xs leading-snug">
											<span className="opacity-60">
												{new Date(event.at).toLocaleTimeString()}{" "}
											</span>
											{event.summary}
										</li>
									))}
								</ul>
							)}
						</div>
					) : null}
				</div>
			)}
			<div className="border-border bg-background/85 flex items-center gap-1 rounded-full border p-1 shadow-lg backdrop-blur-md">
				<button
					type="button"
					aria-label="打开工程历史"
					aria-pressed={openSurface === "project-history"}
					onClick={() => {
						const nextOpen =
							openSurface === "project-history" ? null : "project-history";
						setOpenSurface(nextOpen);
						if (nextOpen) void refreshHistory();
					}}
					className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
						openSurface === "project-history"
							? "bg-foreground text-background"
							: "text-foreground/65 hover:bg-muted hover:text-foreground"
					}`}
				>
					<span
						className={`size-1.5 rounded-full ${
							blockedByUnsavedChanges
								? "bg-amber-500"
								: save.status === "error"
									? "bg-red-500"
									: "bg-emerald-500"
						}`}
					/>
					工程历史
					{currentRevision !== null ? (
						<span className="font-mono text-[9px] opacity-55">
							{currentRevision}
						</span>
					) : null}
				</button>
				<div className="bg-border h-4 w-px" aria-hidden="true" />
				<button
					type="button"
					aria-label="打开智能剪辑"
					aria-pressed={openSurface === "smart-edit"}
					onClick={() =>
						setOpenSurface((current) =>
							current === "smart-edit" ? null : "smart-edit",
						)
					}
					className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
						openSurface === "smart-edit"
							? "bg-cyan-500 text-slate-950"
							: "text-foreground/75 hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300"
					}`}
				>
					<span
						className={`size-1.5 rounded-full ${
							agent.active ? "animate-pulse bg-emerald-500" : "bg-cyan-500"
						}`}
					/>
					{agent.active ? `${agent.actor ?? "智能体"} 已连接` : "智能剪辑"}
				</button>
			</div>
		</div>
	);
}
