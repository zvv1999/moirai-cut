"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import {
	getProjectFileSyncState,
	subscribeToProjectFileSync,
	type ProjectFileSyncState,
} from "@/services/storage/project-file-sync";
import type { ProjectRevisionDiff } from "@/project/revision-diff";

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(value: unknown, fallback: string): string {
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
 * Human history and agent activity in one persistent surface.
 *
 * Agent file edits are not in the current tab's command stack, so the timeline
 * needs a disk-backed, compare-before-restore path even when no agent is active.
 */
export function AgentBadge() {
	const editor = useEditor();
	const projectId = editor.project.getActiveOrNull()?.metadata.id ?? null;
	const [sync, setSync] = useState<ProjectFileSyncState>(
		getProjectFileSyncState(),
	);
	const [open, setOpen] = useState(false);
	const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
	const [currentRevision, setCurrentRevision] = useState<number | null>(null);
	const [snapshotName, setSnapshotName] = useState("");
	const [diff, setDiff] = useState<ProjectRevisionDiff | null>(null);
	const [loadingRevision, setLoadingRevision] = useState<number | null>(null);
	const [confirmRevision, setConfirmRevision] = useState<number | null>(null);

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
			toast.error(errorMessage(payload, "Snapshot failed"));
			return;
		}
		toast(`Saved snapshot at revision ${revisionOf(payload) ?? "unknown"}`);
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
				toast.error(errorMessage(payload, "Comparison failed"));
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
			toast(`Restored snapshot as revision ${revisionOf(payload) ?? "unknown"}`);
			setDiff(null);
			setConfirmRevision(null);
			await refreshHistory();
		} else {
			toast.error(errorMessage(payload, "Restore failed"));
		}
	};

	const { agent, blockedByUnsavedChanges } = sync;

	return (
		<div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
			{open && (
				<div className="bg-popover text-popover-foreground border-border w-[28rem] rounded-lg border p-3 shadow-lg">
					<div className="mb-3 flex items-start justify-between gap-3">
						<div>
							<div className="text-sm font-semibold">Project snapshots</div>
							<div className="text-[11px] opacity-60">
								Current revision {currentRevision ?? "…"} · compare before restore
							</div>
						</div>
						<span className="bg-muted rounded px-2 py-1 font-mono text-[10px]">
							{revisions.length} saved
						</span>
					</div>

					<div className="mb-3 flex gap-2">
						<input
							className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs"
							aria-label="Snapshot name"
							placeholder="e.g. Approved rough cut"
							value={snapshotName}
							onChange={(event) => setSnapshotName(event.target.value)}
						/>
						<button
							type="button"
							className="bg-foreground text-background rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
							disabled={!snapshotName.trim() || currentRevision === null}
							onClick={() => void createSnapshot()}
						>
							Save snapshot
						</button>
					</div>

					<div className="mb-1 text-xs font-medium opacity-70">Timeline history</div>
					{revisions.length === 0 ? (
						<div className="border-border rounded-md border border-dashed p-4 text-center text-xs opacity-50">
							No snapshots yet
						</div>
					) : (
						<ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
							{revisions.slice(0, 20).map((entry) => (
								<li
									key={entry.revision}
									className="border-border flex items-center gap-2 rounded-md border p-2 text-xs"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate font-medium">
											{entry.name ?? `Automatic revision ${entry.revision}`}
										</div>
										<div className="font-mono text-[10px] opacity-50">
											rev {entry.revision}
											{entry.summary?.elementCount !== undefined
												? ` · ${entry.summary.elementCount} clips`
												: ""}
											{" · "}
											{entry.createdAt || entry.updatedAt
												? new Date(
														entry.createdAt ?? entry.updatedAt ?? "",
													).toLocaleTimeString()
												: "unknown time"}
										</div>
									</div>
									<button
										type="button"
										className="text-primary rounded px-2 py-1 hover:underline"
										disabled={loadingRevision === entry.revision}
										onClick={() => void compare(entry.revision)}
									>
										{loadingRevision === entry.revision ? "Comparing…" : "Compare"}
									</button>
								</li>
							))}
						</ul>
					)}

					{diff ? (
						<div className="border-border bg-muted/20 mt-3 rounded-md border p-2">
							<div className="flex items-center justify-between">
								<strong className="text-xs">
									Revision {diff.fromRevision} → {diff.toRevision}
								</strong>
								<button
									type="button"
									className="text-xs opacity-60 hover:opacity-100"
									onClick={() => {
										setDiff(null);
										setConfirmRevision(null);
									}}
								>
									Close
								</button>
							</div>
							<div className="my-2 grid grid-cols-5 gap-1 text-center text-[10px]">
								{(
									[
										["Add", diff.summary.added],
										["Remove", diff.summary.removed],
										["Move", diff.summary.moved],
										["Rename", diff.summary.renamed],
										["Change", diff.summary.changed],
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
									No timeline differences. Restore is unnecessary.
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
										Restore revision {diff.toRevision}? The current state is
										saved as another revision first.
									</p>
									<div className="flex justify-end gap-2">
										<button
											type="button"
											className="rounded px-2 py-1 text-xs"
											onClick={() => setConfirmRevision(null)}
										>
											Cancel
										</button>
										<button
											type="button"
											className="bg-foreground text-background rounded px-2 py-1 text-xs"
											onClick={() => void restore(diff.toRevision)}
										>
											Confirm restore
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
									Restore this snapshot
								</button>
							)}
						</div>
					) : null}

					{agent.active || agent.events.length > 0 ? (
						<div className="mt-3">
							<div className="mb-1 text-xs font-medium opacity-70">
								Recent agent activity
							</div>
							{agent.events.length === 0 ? (
								<div className="text-xs opacity-50">No activity yet</div>
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
			<button
				type="button"
				aria-label="Open project snapshots and agent activity"
				onClick={() => {
					const nextOpen = !open;
					setOpen(nextOpen);
					if (nextOpen) void refreshHistory();
				}}
				className="bg-popover text-popover-foreground border-border flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-md"
			>
				{blockedByUnsavedChanges ? (
					<>
						<span className="h-2 w-2 rounded-full bg-amber-500" />
						Disk moved ahead — save or discard to sync
					</>
				) : agent.active ? (
					<>
						<span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
						{agent.actor ?? "Agent"} connected
					</>
				) : (
					<>
						<span className="bg-primary h-2 w-2 rounded-full" />
						History
					</>
				)}
			</button>
		</div>
	);
}
