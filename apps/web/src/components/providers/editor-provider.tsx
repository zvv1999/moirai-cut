"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsListener } from "@/actions/use-keybindings";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditorActions } from "@/actions/use-editor-actions";
import { installAgentBridge } from "@/agent/bridge";
import { buildAgentContextSnapshot } from "@/agent/context-references";
import { useAgentContextStore } from "@/agent/context-store";
import { toSeconds } from "@/agent/time";
import { watchProjectFile } from "@/services/storage/project-file-sync";
import { AgentBadge } from "@/components/editor/agent-badge";
import { loadFontAtlas } from "@/fonts/google-fonts";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";
import {
	beginRecoverySession,
	markRecoverySessionClean,
	markRecoverySessionSaved,
	type RecoveryCandidate,
} from "@/project/recovery-session";
import { toast } from "sonner";

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { setLoadingProject } = useKeybindingsStore();

	useEffect(() => {
		setLoadingProject(isLoading);
	}, [isLoading, setLoadingProject]);

	useEffect(() => {
		let cancelled = false;
		const editor = EditorCore.getInstance();

		const loadProject = async () => {
			try {
				setIsLoading(true);
				await initializeGpuRenderer();
				editor.renderer.setDegraded(!isGpuAvailable());
				await editor.project.loadProject({ id: projectId });

				if (cancelled) return;

				setIsLoading(false);
				loadFontAtlas();
			} catch (err) {
				if (cancelled) return;

				const isNotFound =
					err instanceof Error &&
					(err.message.includes("not found") ||
						err.message.includes("does not exist"));

				if (isNotFound) {
					try {
						const newProjectId = await editor.project.createNewProject({
							name: "未命名工程",
						});
						router.replace(`/editor/${newProjectId}`);
					} catch (_createErr) {
						setError("创建工程失败");
						setIsLoading(false);
					}
				} else {
					const wasmPanic = (window as Window & { __wasmPanic?: string })
						.__wasmPanic;
					if (wasmPanic) {
						delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
						setError(wasmPanic);
					} else {
						setError(
							err instanceof Error ? err.message : "加载工程失败",
						);
					}
					setIsLoading(false);
				}
			}
		};

		loadProject();

		return () => {
			cancelled = true;
		};
	}, [projectId, router]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">正在加载工程…</p>
				</div>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">正在退出工程…</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			{children}
		</>
	);
}

function EditorRuntimeBindings() {
	const editor = useEditor();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);

	useEffect(() => {
		editor.command.isRippleEnabled = rippleEditingEnabled;
	}, [editor, rippleEditingEnabled]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [editor]);

	// Expose the out-of-page agent surface only once a project is live, so an
	// external driver can never observe a half-loaded editor.
	useEffect(() => installAgentBridge(), []);

	// The editor is no longer the only writer of its own document: with the
	// project on disk, an agent or another window can change it. Watch the file
	// so an external edit is picked up instead of being silently overwritten.
	const activeProjectId = useEditor(
		(instance) => instance.project.getActiveOrNull()?.metadata.id ?? null,
	);
	useEffect(() => {
		if (!activeProjectId) return;
		return watchProjectFile({ projectId: activeProjectId });
	}, [activeProjectId]);

	// Publish a compact heartbeat so a Codex App conversation launched outside
	// this panel can discover the human's current project and exact pinned/live
	// context. The snapshot is rebuilt at send time, so selection/playhead
	// changes do not need another React subscription while video is playing.
	useEffect(() => {
		if (!activeProjectId) return;
		let disposed = false;
		const publish = async () => {
			if (disposed) return;
			const state = editor.agent.getState();
			const snapshot = buildAgentContextSnapshot({
				state,
				pinnedReferences: useAgentContextStore.getState().references,
				selectedElements: editor.selection.getSelectedElements(),
				playheadSeconds:
					toSeconds(editor.playback.getCurrentTime()) ?? 0,
			});
			await fetch("/api/editor-presence", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					projectId: activeProjectId,
					sceneId: state.sceneId,
					revision: state.revision,
					context: snapshot.context,
				}),
				keepalive: true,
			}).catch(() => undefined);
		};
		void publish();
		const timer = window.setInterval(() => void publish(), 5_000);
		const onVisibility = () => {
			if (document.visibilityState === "visible") void publish();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			disposed = true;
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibility);
			void fetch("/api/editor-presence", {
				method: "DELETE",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ projectId: activeProjectId }),
				keepalive: true,
			}).catch(() => undefined);
		};
	}, [activeProjectId, editor]);

	useEditorActions();
	useKeybindingsListener();
	// Fixed-position, so where it mounts in the tree is irrelevant.
	return (
		<>
			<AgentBadge />
			<RecoverySessionGuard />
		</>
	);
}

function RecoverySessionGuard() {
	const editor = useEditor();
	const projectId = useEditor(
		(instance) => instance.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const save = useEditor((instance) => instance.save.getState());
	const [candidate, setCandidate] = useState<RecoveryCandidate | null>(null);
	const [restoring, setRestoring] = useState(false);
	const sessionId = useState(() => crypto.randomUUID())[0];

	useEffect(() => {
		if (!projectId) return;
		const currentRevision =
			editor.project.getKnownFileRevision(projectId) ??
			editor.save.getState().revision;
		if (currentRevision === null) return;
		const recovery = beginRecoverySession({
			storage: window.localStorage,
			projectId,
			currentRevision,
			sessionId,
			now: new Date().toISOString(),
		});
		if (recovery) {
			queueMicrotask(() => setCandidate(recovery));
		}

		const handlePageHide = () => {
			if (editor.save.getIsDirty()) return;
			markRecoverySessionClean({
				storage: window.localStorage,
				projectId,
				sessionId,
			});
		};
		window.addEventListener("pagehide", handlePageHide);
		return () => window.removeEventListener("pagehide", handlePageHide);
	}, [editor, projectId, sessionId]);

	useEffect(() => {
		if (!projectId || save.status !== "saved" || save.revision === null) {
			return;
		}
		markRecoverySessionSaved({
			storage: window.localStorage,
			projectId,
			sessionId,
			revision: save.revision,
		});
	}, [projectId, save.revision, save.status, sessionId]);

	if (!candidate) return null;

	const restoreOpeningRevision = async () => {
		setRestoring(true);
		try {
			const currentResponse = await fetch(
				`/api/projects/${encodeURIComponent(candidate.projectId)}`,
			);
			const current: unknown = await currentResponse.json();
			if (
				!currentResponse.ok ||
				!isRecord(current) ||
				typeof current.revision !== "number"
			) {
				throw new Error("无法读取当前工程版本");
			}
			const response = await fetch(
				`/api/projects/${encodeURIComponent(candidate.projectId)}/restore/${candidate.openingRevision}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ expectedRevision: current.revision }),
				},
			);
			const payload: unknown = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(
					isRecord(payload) && typeof payload.error === "string"
						? payload.error
						: "恢复工程失败",
				);
			}
			const applied = await editor.project.applyExternalDocument();
			if (!applied) {
				throw new Error("恢复的版本无法加载到编辑器");
			}
			setCandidate(null);
			toast(
				`已将会话前版本恢复为版本 ${
					isRecord(payload) && typeof payload.revision === "number"
						? payload.revision
						: "新版本"
				}`,
			);
		} catch (error) {
			toast.error("恢复失败", {
				description:
					error instanceof Error ? error.message : "请重试",
			});
		} finally {
			setRestoring(false);
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="recovery-title"
			className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-6 backdrop-blur-sm"
		>
			<div className="border-border bg-popover text-popover-foreground w-full max-w-lg rounded-xl border p-5 shadow-2xl">
				<div className="mb-1 text-[11px] font-semibold tracking-[0.16em] text-amber-600 uppercase dark:text-amber-400">
					崩溃恢复
				</div>
				<h2 id="recovery-title" className="text-lg font-semibold">
					发现可恢复的编辑内容
				</h2>
				<p className="text-muted-foreground mt-2 text-sm leading-6">
					上次编辑会话未正常关闭。持续自动保存已将工程从版本{" "}
					<strong>{candidate.openingRevision}</strong> 推进到版本{" "}
					<strong>{candidate.recoveryRevision}</strong>。
				</p>
				<div className="border-border bg-muted/30 mt-4 rounded-lg border p-3 text-xs">
					<div className="font-medium">选择要打开的版本</div>
					<div className="text-muted-foreground mt-1">
						你可以保留最新恢复内容，也可以恢复到中断前的准确版本。恢复会新建一个版本，
						两种选择都不会破坏历史记录。
					</div>
				</div>
				<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						disabled={restoring}
						className="border-input hover:bg-accent rounded-md border px-3 py-2 text-sm disabled:opacity-50"
						onClick={() => void restoreOpeningRevision()}
					>
						{restoring
							? "恢复中…"
							: `恢复版本 ${candidate.openingRevision}`}
					</button>
					<button
						type="button"
						className="bg-foreground text-background rounded-md px-3 py-2 text-sm font-medium"
						onClick={() => setCandidate(null)}
					>
						保留恢复版本 {candidate.recoveryRevision}
					</button>
				</div>
			</div>
		</div>
	);
}
