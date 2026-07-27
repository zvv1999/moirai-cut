"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import {
	getProjectFileSyncState,
	subscribeToProjectFileSync,
	type ProjectFileSyncState,
} from "@/services/storage/project-file-sync";

/**
 * The human's window into agent activity: a small pill while an agent is
 * connected, expanding into the recent-activity list and the revision history.
 *
 * The history buttons matter more than they look: agent edits arrive by
 * document swap and are in no tab's undo stack, so without this panel a bad
 * agent batch is something the human can see but not undo.
 */
export function AgentBadge() {
	const editor = useEditor();
	const projectId = editor.project.getActiveOrNull()?.metadata.id ?? null;
	const [sync, setSync] = useState<ProjectFileSyncState>(getProjectFileSyncState());
	const [open, setOpen] = useState(false);
	const [revisions, setRevisions] = useState<
		Array<{ revision: number; updatedAt: string | null }>
	>([]);

	useEffect(() => subscribeToProjectFileSync(setSync), []);

	useEffect(() => {
		if (!open || !projectId) return;
		void fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`)
			.then((response) => response.json())
			.then((payload: { revisions?: Array<{ revision: number; updatedAt: string | null }> }) =>
				setRevisions(payload.revisions ?? []),
			)
			.catch(() => setRevisions([]));
	}, [open, projectId]);

	const { agent, blockedByUnsavedChanges } = sync;
	if (!agent.active && !blockedByUnsavedChanges && !open) return null;

	const restore = async (revision: number) => {
		if (!projectId) return;
		const response = await fetch(
			`/api/projects/${encodeURIComponent(projectId)}/restore/${revision}`,
			{ method: "POST" },
		);
		if (response.ok) {
			toast(`Restored revision ${revision}`);
			setOpen(false);
		} else {
			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			toast.error(payload.error ?? "Restore failed");
		}
	};

	return (
		<div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
			{open && (
				<div className="bg-popover text-popover-foreground border-border w-72 rounded-lg border p-3 shadow-lg">
					<div className="mb-2 text-xs font-medium opacity-70">Recent agent activity</div>
					{agent.events.length === 0 ? (
						<div className="text-xs opacity-50">No activity yet</div>
					) : (
						<ul className="mb-3 flex flex-col gap-1">
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
					<div className="mb-1 text-xs font-medium opacity-70">History</div>
					{revisions.length === 0 ? (
						<div className="text-xs opacity-50">No snapshots yet</div>
					) : (
						<ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
							{revisions.slice(0, 10).map((entry) => (
								<li key={entry.revision} className="flex items-center justify-between text-xs">
									<span>
										rev {entry.revision}
										{entry.updatedAt && (
											<span className="ml-1 opacity-50">
												{new Date(entry.updatedAt).toLocaleTimeString()}
											</span>
										)}
									</span>
									<button
										type="button"
										className="text-primary hover:underline"
										onClick={() => void restore(entry.revision)}
									>
										Restore
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="bg-popover text-popover-foreground border-border flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-md"
			>
				{blockedByUnsavedChanges ? (
					<>
						<span className="h-2 w-2 rounded-full bg-amber-500" />
						Disk moved ahead — save or discard to sync
					</>
				) : (
					<>
						<span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
						{agent.actor ?? "Agent"} connected
					</>
				)}
			</button>
		</div>
	);
}
