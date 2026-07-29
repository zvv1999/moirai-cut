import type { ReactNode } from "react";
import type {
	EffectElement,
	GraphicElement,
	ImageElement,
	RetimableElement,
	StickerElement,
	TextElement,
	VisualElement,
	VideoElement,
	AudioElement,
	TimelineElement,
} from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	TextFontIcon,
	ArrowExpandIcon,
	MusicNote03Icon,
	MagicWand05Icon,
	DashboardSpeed02Icon,
} from "@hugeicons/core-free-icons";
import { ElementParamsTab } from "./components/element-params-tab";
import {
	VisualWorkbenchTab,
	VISUAL_PARAM_SECTIONS,
	VISUAL_SUBTABS,
} from "./components/visual-workbench-tab";
import {
	ClipEffectsTab,
	StandaloneEffectTab,
} from "@/effects/components/effects-tab";
import { SpeedTab } from "@/speed/components/speed-tab";
import { GraphicTab } from "@/graphics/components/graphic-tab";
import { OcShapesIcon } from "@/components/icons";
import { AudioWorkbenchTab } from "./components/audio-workbench-tab";
import { MotionTrackingTab } from "@/motion-tracking/components/motion-tracking-tab";

export { VISUAL_PARAM_SECTIONS, VISUAL_SUBTABS };

const TEXT_PARAM_KEYS = [
	"content",
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"letterSpacing",
	"lineHeight",
	"background.enabled",
	"background.color",
	"background.cornerRadius",
	"background.paddingX",
	"background.paddingY",
	"background.offsetX",
	"background.offsetY",
] as const;

export type TabContentProps = {
	trackId: string;
};

export type PropertiesTabDef = {
	id: string;
	label: string;
	icon: ReactNode;
	content: (props: TabContentProps) => ReactNode;
};

export type ElementPropertiesConfig = {
	defaultTab: string;
	tabs: PropertiesTabDef[];
};

function buildVisualTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "visual",
		label: "画面",
		icon: <HugeiconsIcon icon={ArrowExpandIcon} size={16} />,
		content: ({ trackId }) => (
			<VisualWorkbenchTab element={element} trackId={trackId} />
		),
	};
}

function buildAudioTab({
	element,
}: {
	element: AudioElement | VideoElement;
}): PropertiesTabDef {
	return {
		id: "audio",
		label: "音频",
		icon: <HugeiconsIcon icon={MusicNote03Icon} size={16} />,
		content: ({ trackId }) => (
			<AudioWorkbenchTab element={element} trackId={trackId} />
		),
	};
}

function buildSpeedTab({
	element,
}: {
	element: RetimableElement;
}): PropertiesTabDef {
	return {
		id: "speed",
		label: "变速",
		icon: <HugeiconsIcon icon={DashboardSpeed02Icon} size={16} />,
		content: ({ trackId }) => <SpeedTab element={element} trackId={trackId} />,
	};
}

function InspectorFeatureSummary({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="flex min-h-64 flex-col items-center justify-center px-8 text-center">
			<div className="border-border bg-accent/60 mb-3 flex size-10 items-center justify-center rounded-xl border text-lg">
				◇
			</div>
			<p className="text-[13px] font-medium">{title}</p>
			<p className="text-muted-foreground mt-1.5 max-w-60 text-[11px] leading-5">
				{description}
			</p>
		</div>
	);
}

function buildAnimationTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "animation",
		label: "动画",
		icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
		content: () => (
			<InspectorFeatureSummary
				title="关键帧动画"
				description={`${element.name} 的位置、缩放、旋转等关键帧已在“画面 · 基础”每个属性右侧开放；入场、出场和组合动画预设尚未接入。`}
			/>
		),
	};
}

function buildAdjustmentsTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "adjustments",
		label: "调整",
		icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
		content: ({ trackId }) => (
			<ClipEffectsTab element={element} trackId={trackId} />
		),
	};
}

function buildAiEffectsTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "effects",
		label: "AI效果",
		icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
		content: ({ trackId }) =>
			element.type === "video" ? (
				<MotionTrackingTab element={element} trackId={trackId} />
			) : (
				<InspectorFeatureSummary
					title="AI效果尚未接入"
					description="当前素材类型没有可用的 AI 处理能力；不会用静态样式伪造处理结果。"
				/>
			),
	};
}

function buildTextTab({ element }: { element: TextElement }): PropertiesTabDef {
	return {
		id: "text",
		label: "文本",
		icon: <HugeiconsIcon icon={TextFontIcon} size={16} />,
		content: ({ trackId }) => (
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={TEXT_PARAM_KEYS}
				sectionKey="text"
			/>
		),
	};
}

function buildGraphicTab({
	element,
}: {
	element: GraphicElement;
}): PropertiesTabDef {
	return {
		id: "graphic",
		label: "图形",
		icon: <OcShapesIcon size={16} />,
		content: ({ trackId }) => (
			<GraphicTab element={element} trackId={trackId} />
		),
	};
}

function buildStandaloneEffectTab({
	element,
}: {
	element: EffectElement;
}): PropertiesTabDef {
	return {
		id: "effects",
		label: "特效",
		icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
		content: ({ trackId }) => (
			<StandaloneEffectTab element={element} trackId={trackId} />
		),
	};
}

function getTextConfig({
	element,
}: {
	element: TextElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "text",
		tabs: [buildTextTab({ element }), buildVisualTab({ element })],
	};
}

function getVideoConfig({
	element,
	mediaAsset,
}: {
	element: VideoElement;
	mediaAsset: MediaAsset | undefined;
}): ElementPropertiesConfig {
	const showAudioTab = mediaAsset?.hasAudio !== false;
	return {
		defaultTab: "visual",
		tabs: [
			buildVisualTab({ element }),
			...(showAudioTab ? [buildAudioTab({ element })] : []),
			buildSpeedTab({ element }),
			buildAnimationTab({ element }),
			buildAdjustmentsTab({ element }),
			buildAiEffectsTab({ element }),
		],
	};
}

function getImageConfig({
	element,
}: {
	element: ImageElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "visual",
		tabs: [
			buildVisualTab({ element }),
			buildAnimationTab({ element }),
			buildAdjustmentsTab({ element }),
			buildAiEffectsTab({ element }),
		],
	};
}

function getStickerConfig({
	element,
}: {
	element: StickerElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "visual",
		tabs: [
			buildVisualTab({ element }),
			buildAnimationTab({ element }),
			buildAdjustmentsTab({ element }),
			buildAiEffectsTab({ element }),
		],
	};
}

function getGraphicConfig({
	element,
}: {
	element: GraphicElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "graphic",
		tabs: [
			buildGraphicTab({ element }),
			buildVisualTab({ element }),
			buildAnimationTab({ element }),
			buildAdjustmentsTab({ element }),
			buildAiEffectsTab({ element }),
		],
	};
}

function getAudioConfig({
	element,
}: {
	element: AudioElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "audio",
		tabs: [buildAudioTab({ element }), buildSpeedTab({ element })],
	};
}

function getEffectConfig({
	element,
}: {
	element: EffectElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "effects",
		tabs: [buildStandaloneEffectTab({ element })],
	};
}

export function getPropertiesConfig({
	element,
	mediaAssets,
}: {
	element: TimelineElement;
	mediaAssets: MediaAsset[];
}): ElementPropertiesConfig {
	switch (element.type) {
		case "text":
			return getTextConfig({ element });
		case "video": {
			const mediaAsset = mediaAssets.find((a) => a.id === element.mediaId);
			return getVideoConfig({ element, mediaAsset });
		}
		case "image":
			return getImageConfig({ element });
		case "sticker":
			return getStickerConfig({ element });
		case "graphic":
			return getGraphicConfig({ element });
		case "audio":
			return getAudioConfig({ element });
		case "effect":
			return getEffectConfig({ element });
	}
}
