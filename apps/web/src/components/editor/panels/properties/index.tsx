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

export function PropertiesPanel() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	useEditor((e) => e.media.getAssets());
	const { selectedElements } = useElementSelection();
	const { activeTabPerType, setActiveTab } = usePropertiesStore();

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
			<ScrollArea className="flex-1 scrollbar-hidden">
				<div
					id={`inspector-panel-${activeTab.id}`}
					role="tabpanel"
					aria-label={`${activeTab.label} properties`}
				>
					{activeTab.content({ trackId: track.id })}
				</div>
			</ScrollArea>
		</div>
	);
}
