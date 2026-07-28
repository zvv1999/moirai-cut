import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isGuideId, type GuideId } from "@/guides";
import { DEFAULT_GRID_CONFIG } from "@/guides/grid";
import type { GridConfig } from "@/guides/types";
import { isPreviewQuality, type PreviewQuality } from "@/playback/transport";

type PreviewOverlaysState = Record<string, boolean>;

interface PreviewState {
	activeGuide: GuideId | null;
	overlays: PreviewOverlaysState;
	gridConfig: GridConfig;
	quality: PreviewQuality;
	toggleGuide: (guideId: GuideId) => void;
	setGridConfig: (config: Partial<GridConfig>) => void;
	setOverlayVisibility: ({
		overlayId,
		isVisible,
	}: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
	toggleOverlayVisibility: ({ overlayId }: { overlayId: string }) => void;
	setQuality: (quality: PreviewQuality) => void;
}

const DEFAULT_PREVIEW_OVERLAYS: PreviewOverlaysState = {};

function readPersistedProperty({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): unknown {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	return Reflect.get(value, key);
}

function getPersistedActiveGuide(state: unknown): GuideId | null {
	const persistedGuide =
		readPersistedProperty({ value: state, key: "activeGuide" }) ??
		readPersistedProperty({
			value: readPersistedProperty({ value: state, key: "layoutGuide" }),
			key: "platform",
		}) ??
		null;

	if (typeof persistedGuide !== "string") {
		return null;
	}

	return isGuideId(persistedGuide) ? persistedGuide : null;
}

export const usePreviewStore = create<PreviewState>()(
	persist(
		(set) => ({
			activeGuide: null,
			overlays: DEFAULT_PREVIEW_OVERLAYS,
			gridConfig: DEFAULT_GRID_CONFIG,
			quality: "full",
			toggleGuide: (guideId) => {
				set((state) => ({
					activeGuide: state.activeGuide === guideId ? null : guideId,
				}));
			},
			setGridConfig: (config) => {
				set((state) => ({
					gridConfig: { ...state.gridConfig, ...config },
				}));
			},
			setOverlayVisibility: ({ overlayId, isVisible }) => {
				set((state) => ({
					overlays: {
						...state.overlays,
						[overlayId]: isVisible,
					},
				}));
			},
			toggleOverlayVisibility: ({ overlayId }) => {
				set((state) => ({
					overlays: {
						...state.overlays,
						[overlayId]: !state.overlays[overlayId],
					},
				}));
			},
			setQuality: (quality) => {
				set({ quality });
			},
		}),
		{
			name: "preview-settings",
			version: 7,
			migrate: (persistedState) => {
				const gridConfig = readPersistedProperty({
					value: persistedState,
					key: "gridConfig",
				});
				const persistedRows = readPersistedProperty({
					value: gridConfig,
					key: "rows",
				});
				const persistedCols = readPersistedProperty({
					value: gridConfig,
					key: "cols",
				});
				const persistedQuality = readPersistedProperty({
					value: persistedState,
					key: "quality",
				});

				return {
					activeGuide: getPersistedActiveGuide(persistedState),
					overlays: DEFAULT_PREVIEW_OVERLAYS,
					gridConfig: {
						rows:
							typeof persistedRows === "number"
								? persistedRows
								: DEFAULT_GRID_CONFIG.rows,
						cols:
							typeof persistedCols === "number"
								? persistedCols
								: DEFAULT_GRID_CONFIG.cols,
					},
					quality:
						typeof persistedQuality === "string" &&
						isPreviewQuality(persistedQuality)
							? persistedQuality
							: "full",
				};
			},
			partialize: (state) => ({
				activeGuide: state.activeGuide,
				overlays: state.overlays,
				gridConfig: state.gridConfig,
				quality: state.quality,
			}),
		},
	),
);
