"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getPropertiesConfig } from "./registry";
import { EmptyView } from "./empty-view";
import {
	InspectorSelectionHeader,
	InspectorTabNavigation,
} from "./components/inspector-chrome";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";

export function PropertiesPanel() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());
	const sourcePreviewAssetId = useAssetsPanelStore(
		(state) => state.sourcePreviewAssetId,
	);
	const { selectedElements } = useElementSelection();
	const { activeTabPerType, setActiveTab } = usePropertiesStore();
	const sourcePreviewAsset =
		editor.media
			.getAssets()
			.find((asset) => asset.id === sourcePreviewAssetId) ?? null;

	if (sourcePreviewAsset) {
		return (
			<SourcePreviewInspector
				asset={sourcePreviewAsset}
				project={activeProject}
			/>
		);
	}

	if (selectedElements.length === 0) {
		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border">
				<EmptyView />
			</div>
		);
	}

	if (selectedElements.length > 1) {
		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border">
				<p className="text-muted-foreground text-sm">
					已选择 {selectedElements.length} 个素材
				</p>
			</div>
		);
	}

	const mediaAssets = editor.media.getAssets();

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack) return null;

	const { element, track } = elementWithTrack;
	const config = getPropertiesConfig({ element, mediaAssets });
	const visibleTabs = config.tabs;

	const storedTabId = activeTabPerType[element.type];
	const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
	const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
	const activeTab =
		visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

	if (!activeTab) return null;

	const tabPanel = (
		<div
			id={`inspector-panel-${activeTab.id}`}
			role="tabpanel"
			aria-label={`${activeTab.label}属性`}
			className={activeTab.id === "speed" ? "h-full" : undefined}
		>
			{activeTab.content({ trackId: track.id })}
		</div>
	);

	return (
		<div
			className="panel bg-background flex h-full flex-col overflow-hidden rounded-lg border"
			data-testid="properties-panel"
		>
			<InspectorTabNavigation
				tabs={visibleTabs}
				activeTabId={activeTab.id}
				onSelect={(tabId) =>
					setActiveTab({
						elementType: element.type,
						tabId,
					})
				}
			/>
			<InspectorSelectionHeader
				name={element.name}
				type={element.type}
				duration={element.duration}
				trackName={track.name}
			/>
			{activeTab.id === "speed" ? (
				<div
					key={`${element.id}:${activeTab.id}`}
					className="min-h-0 flex-1 overflow-hidden"
				>
					{tabPanel}
				</div>
			) : (
				<ScrollArea
					key={`${element.id}:${activeTab.id}`}
					className="flex-1 scrollbar-hidden"
				>
					{tabPanel}
				</ScrollArea>
			)}
		</div>
	);
}

function SourcePreviewInspector({
	asset,
	project,
}: {
	asset: MediaAsset;
	project: TProject;
}) {
	const fps = project.settings.fps.numerator / project.settings.fps.denominator;
	const duration =
		asset.duration === undefined ? "未知" : `${asset.duration.toFixed(2)} 秒`;

	return (
		<div
			className="panel bg-background flex h-full flex-col overflow-hidden rounded-lg border"
			data-source-preview-inspector="active"
		>
			<header className="border-border/70 flex h-[54px] shrink-0 items-center border-b px-4">
				<h2 className="text-[13px] font-medium">草稿参数</h2>
			</header>
			<ScrollArea className="flex-1">
				<div className="divide-border/70 divide-y">
					<InspectorFacts
						title="工程"
						rows={[
							["名称", project.metadata.name],
							[
								"分辨率",
								`${project.settings.canvasSize.width} × ${project.settings.canvasSize.height}`,
							],
							["帧率", `${fps.toFixed(fps % 1 === 0 ? 0 : 2)} fps`],
						]}
					/>
					<InspectorFacts
						title="正在预览"
						rows={[
							["素材", asset.name],
							[
								"类型",
								asset.type === "video"
									? "视频"
									: asset.type === "audio"
										? "音频"
										: "图片",
							],
							["时长", duration],
							[
								"代理",
								asset.proxy?.enabled && asset.proxyFile ? "已启用" : "使用原片",
							],
						]}
					/>
				</div>
			</ScrollArea>
		</div>
	);
}

function InspectorFacts({
	title,
	rows,
}: {
	title: string;
	rows: Array<[string, string]>;
}) {
	return (
		<section className="px-4 py-4">
			<h3 className="mb-3 text-[13px] font-medium">{title}</h3>
			<dl className="grid gap-3">
				{rows.map(([label, value]) => (
					<div
						key={label}
						className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-[12px]"
					>
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="min-w-0 truncate text-right">{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
