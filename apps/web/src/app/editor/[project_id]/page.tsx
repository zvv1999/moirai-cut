"use client";

import { useParams } from "next/navigation";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/timeline/components";
import { PreviewPanel } from "@/preview/components";
import { EditorHeader } from "@/components/editor/editor-header";
import { AgentBadge } from "@/components/editor/agent-badge";
import { EditorProvider } from "@/components/providers/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { usePanelStore } from "@/editor/panel-store";
import { usePasteMedia } from "@/media/use-paste-media";
import { MobileGate } from "@/components/editor/mobile-gate";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import {
	createPreviewOverlayControl,
	isPreviewOverlayVisible,
	mergePreviewOverlaySources,
} from "@/preview/overlays";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/guides";
import {
	bookmarkNotesPreviewOverlay,
	getBookmarkPreviewOverlaySource,
} from "@/timeline/bookmarks/index";
import {
	type EditorSurface,
	resolveEditorWorkspaceMode,
} from "@/components/editor/editor-responsive-layout";
import { FolderOpen, MonitorPlay, SlidersHorizontal } from "lucide-react";

export default function Editor() {
	const params = useParams<{ project_id: string }>();
	const projectId = params.project_id;

	return (
		<MobileGate>
			<EditorProvider projectId={projectId}>
				<div className="dark editor-studio-shell bg-background flex h-screen w-screen flex-col overflow-hidden">
					<DegradedRendererBanner />
					<EditorHeader />
					<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
						<AgentBadge />
						<main className="min-w-0 flex-1" data-testid="editor-workspace">
							<EditorLayout />
						</main>
					</div>
					<Onboarding />
					<MigrationDialog />
					<ChangelogNotification />
				</div>
			</EditorProvider>
		</MobileGate>
	);
}

function DegradedRendererBanner() {
	const isDegraded = useEditor((e) => e.renderer.isDegraded);
	const [dismissed, setDismissed] = useState(false);
	if (!isDegraded || dismissed) return null;

	return (
		<div className="bg-accent border-b h-9 flex items-center justify-center gap-2 text-xs text-muted-foreground">
			<span>为获得最佳预览性能，建议使用 Chrome 打开 Moirai Cut。</span>
			<Button
				variant="text"
				size="icon"
				className="p-0 w-auto [&_svg]:size-3.5"
				onClick={() => setDismissed(true)}
				aria-label="关闭提示"
			>
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
		</div>
	);
}

function EditorLayout() {
	usePasteMedia();
	const { panels, setPanel } = usePanelStore();
	const workspaceRef = useRef<HTMLDivElement>(null);
	const [workspaceWidth, setWorkspaceWidth] = useState(0);
	const [activeSurface, setActiveSurface] = useState<EditorSurface>("preview");
	const selectedElementCount = useEditor(
		(editor) => editor.selection.getSelectedElements().length,
	);
	const previousSelectedElementCount = useRef(selectedElementCount);
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const showBookmarkNotes = isPreviewOverlayVisible({
		overlay: bookmarkNotesPreviewOverlay,
		overlays,
	});
	const workspaceMode = resolveEditorWorkspaceMode(workspaceWidth);

	useEffect(() => {
		const workspace = workspaceRef.current;
		if (!workspace) return;

		const updateWidth = (width: number) => {
			setWorkspaceWidth((current) =>
				Math.abs(current - width) >= 1 ? width : current,
			);
		};
		updateWidth(workspace.getBoundingClientRect().width);

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) updateWidth(entry.contentRect.width);
		});
		observer.observe(workspace);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const previousCount = previousSelectedElementCount.current;
		previousSelectedElementCount.current = selectedElementCount;
		if (
			workspaceMode === "focus" &&
			previousCount === 0 &&
			selectedElementCount > 0
		) {
			setActiveSurface("properties");
		}
	}, [selectedElementCount, workspaceMode]);

	const overlaySource = useMemo(
		() =>
			mergePreviewOverlaySources({
				sources: [
					getGuidePreviewOverlaySource({
						guideId: activeGuide,
					}),
					activeScene
						? getBookmarkPreviewOverlaySource({
								bookmarks: activeScene.bookmarks,
								time: currentTime,
								isVisible: showBookmarkNotes,
							})
						: {
								definitions: [bookmarkNotesPreviewOverlay],
								instances: [],
							},
				],
			}),
		[activeGuide, activeScene, currentTime, showBookmarkNotes],
	);

	const overlayControls = useMemo(
		() =>
			overlaySource.definitions.map((overlay) =>
				createPreviewOverlayControl({ overlay, overlays }),
			),
		[overlaySource.definitions, overlays],
	);

	const previewPanel = (
		<PreviewPanel
			overlayControls={overlayControls}
			overlayInstances={overlaySource.instances}
			onOverlayVisibilityChange={setOverlayVisibility}
		/>
	);

	return (
		<div
			ref={workspaceRef}
			className="relative size-full min-h-0 min-w-0"
			data-editor-layout-mode={workspaceMode}
		>
			<ResizablePanelGroup
				direction="vertical"
				className="size-full gap-1"
				data-workbench-layout="jianying"
				onLayout={(sizes) => {
					setPanel({
						panel: "mainContent",
						size: sizes[0] ?? panels.mainContent,
					});
					setPanel({
						panel: "timeline",
						size: sizes[1] ?? panels.timeline,
					});
				}}
			>
				<ResizablePanel
					defaultSize={panels.mainContent}
					minSize={30}
					maxSize={85}
					className="relative min-h-0"
				>
					{workspaceMode === "focus" ? (
						<div className="flex size-full min-h-0 flex-col px-1">
							<header className="flex h-10 shrink-0 items-center justify-between border-x border-t border-white/8 bg-[#17191d] px-2">
								<span className="text-[10px] font-medium tracking-wide text-slate-500">
									紧凑工作区
								</span>
								<FocusSurfaceSwitcher
									activeSurface={activeSurface}
									onSurfaceChange={setActiveSurface}
								/>
							</header>
							<div
								className="min-h-0 min-w-0 flex-1"
								data-workbench-surface={activeSurface}
							>
								{activeSurface === "assets" ? <AssetsPanel /> : null}
								{activeSurface === "preview" ? previewPanel : null}
								{activeSurface === "properties" ? <PropertiesPanel /> : null}
							</div>
						</div>
					) : (
						<ResizablePanelGroup
							direction="horizontal"
							className="size-full gap-1 px-1"
							onLayout={(sizes) => {
								setPanel({
									panel: "tools",
									size: sizes[0] ?? panels.tools,
								});
								setPanel({
									panel: "preview",
									size: sizes[1] ?? panels.preview,
								});
								setPanel({
									panel: "properties",
									size: sizes[2] ?? panels.properties,
								});
							}}
						>
							<ResizablePanel
								defaultSize={panels.tools}
								minSize={15}
								maxSize={40}
								className="min-w-0"
							>
								<AssetsPanel />
							</ResizablePanel>

							<ResizableHandle withHandle />

							<ResizablePanel
								defaultSize={panels.preview}
								minSize={30}
								className="min-h-0 min-w-0 flex-1"
							>
								{previewPanel}
							</ResizablePanel>

							<ResizableHandle withHandle />

							<ResizablePanel
								defaultSize={panels.properties}
								minSize={15}
								maxSize={40}
								className="min-w-0"
							>
								<PropertiesPanel />
							</ResizablePanel>
						</ResizablePanelGroup>
					)}
				</ResizablePanel>

				<ResizableHandle withHandle />

				<ResizablePanel
					defaultSize={panels.timeline}
					minSize={15}
					maxSize={70}
					className="min-h-0 px-1 pb-1"
				>
					<Timeline />
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}

function FocusSurfaceSwitcher({
	activeSurface,
	onSurfaceChange,
}: {
	activeSurface: EditorSurface;
	onSurfaceChange: (surface: EditorSurface) => void;
}) {
	const surfaces = [
		{
			id: "assets",
			label: "素材",
			ariaLabel: "切换到素材面板",
			icon: FolderOpen,
		},
		{
			id: "preview",
			label: "画面",
			ariaLabel: "切换到预览画面",
			icon: MonitorPlay,
		},
		{
			id: "properties",
			label: "属性",
			ariaLabel: "切换到属性面板",
			icon: SlidersHorizontal,
		},
	] satisfies Array<{
		id: EditorSurface;
		label: string;
		ariaLabel: string;
		icon: typeof FolderOpen;
	}>;

	return (
		<nav
			aria-label="紧凑工作区面板"
			className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#111418] p-0.5 text-slate-300 shadow-sm"
		>
			{surfaces.map((surface) => {
				const Icon = surface.icon;
				const active = activeSurface === surface.id;
				return (
					<button
						key={surface.id}
						type="button"
						aria-label={surface.ariaLabel}
						aria-pressed={active}
						title={surface.label}
						className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition ${
							active
								? "bg-cyan-400 text-slate-950 shadow-sm"
								: "text-slate-400 hover:bg-white/8 hover:text-slate-100"
						}`}
						onClick={() => onSurfaceChange(surface.id)}
					>
						<Icon className="size-3.5" aria-hidden="true" />
						<span>{surface.label}</span>
					</button>
				);
			})}
		</nav>
	);
}
