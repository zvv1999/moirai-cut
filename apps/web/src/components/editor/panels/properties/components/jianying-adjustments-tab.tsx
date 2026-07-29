"use client";

import { useRef, useState } from "react";
import type { ParamDefinition, ParamValues } from "@/params";
import type { VisualElement } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { PropertyParamField } from "./property-param-field";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { parseCubeLut } from "@/visual/appearance";
import { toast } from "sonner";
import { cn } from "@/utils/ui";

export const JIANYING_ADJUSTMENT_TABS = [
	{ id: "basic", label: "基础" },
	{ id: "hsl", label: "HSL" },
	{ id: "curve", label: "曲线" },
	{ id: "wheel", label: "色轮" },
	{ id: "mask", label: "蒙版" },
] as const;

export const JIANYING_ADJUSTMENT_SECTIONS = [
	"智能调色",
	"色彩克隆",
	"色彩校正",
	"LUT",
	"调整",
] as const;

type AdjustmentTabId = (typeof JIANYING_ADJUSTMENT_TABS)[number]["id"];

const BASIC_PARAMS: ParamDefinition[] = [
	{
		key: "temperature",
		label: "色温",
		type: "number",
		default: 0,
		min: -100,
		max: 100,
		step: 1,
	},
	{
		key: "saturation",
		label: "饱和度",
		type: "number",
		default: 0,
		min: -100,
		max: 200,
		step: 1,
	},
	{
		key: "exposure",
		label: "亮度",
		type: "number",
		default: 0,
		min: -3,
		max: 3,
		step: 0.05,
	},
	{
		key: "contrast",
		label: "对比度",
		type: "number",
		default: 0,
		min: -100,
		max: 100,
		step: 1,
	},
	{
		key: "highlights",
		label: "高光",
		type: "number",
		default: 0,
		min: -100,
		max: 100,
		step: 1,
	},
	{
		key: "shadows",
		label: "阴影",
		type: "number",
		default: 0,
		min: -100,
		max: 100,
		step: 1,
	},
];

const CURVE_PARAM: ParamDefinition = {
	key: "curve",
	label: "明暗曲线",
	type: "number",
	default: 0,
	min: -100,
	max: 100,
	step: 1,
};

const LUT_STRENGTH_PARAM: ParamDefinition = {
	key: "lutStrength",
	label: "强度",
	type: "number",
	default: 100,
	min: 0,
	max: 100,
	step: 1,
};

export function JianyingAdjustmentsTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [activeTab, setActiveTab] = useState<AdjustmentTabId>("basic");
	const lutInputRef = useRef<HTMLInputElement>(null);
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const committedEffect = (element.effects ?? []).find(
		(effect) => effect.type === "color-grade",
	);
	const renderEffect = (renderElement.effects ?? []).find(
		(effect) => effect.type === "color-grade",
	);
	const effect = renderEffect ?? committedEffect;
	const params: ParamValues = effect?.params ?? {};
	const enabled = effect?.enabled ?? false;

	const ensureAdjustment = (): string => {
		if (committedEffect) return committedEffect.id;
		return editor.timeline.addClipEffect({
			trackId,
			elementId: element.id,
			effectType: "color-grade",
		});
	};

	const setAdjustmentEnabled = () => {
		if (!committedEffect) {
			ensureAdjustment();
			return;
		}
		editor.timeline.toggleClipEffect({
			trackId,
			elementId: element.id,
			effectId: committedEffect.id,
		});
	};

	const previewParam = (key: string) => (value: number | string | boolean) => {
		if (!effect) return;
		previewUpdates({
			effects: (renderElement.effects ?? []).map((candidate) =>
				candidate.id === effect.id
					? {
							...candidate,
							params: { ...candidate.params, [key]: value },
						}
					: candidate,
			),
		});
	};

	const importLut = async (file: File) => {
		try {
			const source = await file.text();
			const lut = parseCubeLut({ source });
			const effectId = ensureAdjustment();
			if (committedEffect && !committedEffect.enabled) {
				editor.timeline.toggleClipEffect({
					trackId,
					elementId: element.id,
					effectId,
				});
			}
			editor.timeline.updateClipEffectParams({
				trackId,
				elementId: element.id,
				effectId,
				params: { lutSource: source, lutStrength: 100 },
			});
			toast.success(`已导入 LUT：${lut.title}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "无法导入 LUT");
		}
	};

	const renderField = (param: ParamDefinition) => (
		<div key={param.key} className="px-3.5">
			<PropertyParamField
				param={param}
				value={params[param.key] ?? param.default}
				onPreview={previewParam(param.key)}
				onCommit={commit}
			/>
		</div>
	);

	return (
		<div className="flex h-full flex-col">
			<div
				role="tablist"
				aria-label="调整分类"
				className="border-border/70 grid h-[50px] shrink-0 grid-cols-5 gap-1 border-b px-3 py-2"
			>
				{JIANYING_ADJUSTMENT_TABS.map((tab) => (
					<Button
						key={tab.id}
						type="button"
						role="tab"
						size="sm"
						variant="ghost"
						aria-selected={activeTab === tab.id}
						className={cn(
							"px-1 text-[11px]",
							activeTab === tab.id
								? "bg-accent text-foreground"
								: "text-muted-foreground",
						)}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</Button>
				))}
			</div>

			{activeTab === "basic" ? (
				<>
					{JIANYING_ADJUSTMENT_SECTIONS.slice(0, 3).map((title) => (
						<Section
							key={title}
							sectionKey={`${element.id}:adjustment:${title}`}
							collapsible
							defaultOpen={false}
						>
							<SectionHeader
								trailing={
									<span className="text-muted-foreground text-[10px]">
										尚未接入
									</span>
								}
							>
								<SectionTitle>{title}</SectionTitle>
							</SectionHeader>
							<SectionContent>
								<p className="text-muted-foreground text-xs">
									当前版本不会用静态滤镜伪造该处理结果。
								</p>
							</SectionContent>
						</Section>
					))}

					<Section
						sectionKey={`${element.id}:adjustment:lut`}
						collapsible
						defaultOpen
					>
						<SectionHeader>
							<SectionTitle>LUT</SectionTitle>
						</SectionHeader>
						<SectionContent>
							<SectionFields>
								<input
									ref={lutInputRef}
									type="file"
									accept=".cube,text/plain"
									className="hidden"
									aria-label="导入 LUT 文件"
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (file) void importLut(file);
										event.currentTarget.value = "";
									}}
								/>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => lutInputRef.current?.click()}
								>
									{typeof params.lutSource === "string" &&
									params.lutSource.trim()
										? "更换 LUT"
										: "导入 .cube"}
								</Button>
								{enabled ? (
									renderField(LUT_STRENGTH_PARAM)
								) : (
									<p className="text-muted-foreground text-[10px]">
										导入 LUT 或打开“调整”后可调整强度。
									</p>
								)}
							</SectionFields>
						</SectionContent>
					</Section>

					<Section
						sectionKey={`${element.id}:adjustment:basic`}
						collapsible
						defaultOpen
					>
						<SectionHeader
							trailing={
								<Switch
									checked={enabled}
									aria-label="启用调整"
									onCheckedChange={setAdjustmentEnabled}
								/>
							}
						>
							<SectionTitle>调整</SectionTitle>
						</SectionHeader>
						<SectionContent>
							{enabled ? (
								<SectionFields>{BASIC_PARAMS.map(renderField)}</SectionFields>
							) : (
								<p className="text-muted-foreground text-xs">
									打开“调整”后可编辑色温、饱和度、亮度和明暗参数。
								</p>
							)}
						</SectionContent>
					</Section>
				</>
			) : activeTab === "curve" ? (
				<Section showTopBorder={false}>
					<SectionHeader
						trailing={
							<Switch
								checked={enabled}
								aria-label="启用曲线调整"
								onCheckedChange={setAdjustmentEnabled}
							/>
						}
					>
						<SectionTitle>曲线</SectionTitle>
					</SectionHeader>
					<SectionContent>
						{enabled ? (
							<>
								{renderField(CURVE_PARAM)}
								<p className="text-muted-foreground mt-3 text-[10px] leading-4">
									当前提供可渲染、可导出的明暗曲线强度；多点曲线编辑器将在后续版本接入。
								</p>
							</>
						) : (
							<p className="text-muted-foreground text-xs">
								打开曲线调整后可编辑可预览、可导出的明暗曲线。
							</p>
						)}
					</SectionContent>
				</Section>
			) : (
				<div className="flex min-h-64 flex-col items-center justify-center px-8 text-center">
					<div className="border-border bg-accent/60 mb-3 flex size-10 items-center justify-center rounded-xl border">
						◇
					</div>
					<p className="text-[13px] font-medium">
						{
							JIANYING_ADJUSTMENT_TABS.find((tab) => tab.id === activeTab)
								?.label
						}
					</p>
					<p className="text-muted-foreground mt-1.5 text-[11px] leading-5">
						该调色能力尚未接入；当前界面不会产生虚假的预览或导出效果。
					</p>
				</div>
			)}
		</div>
	);
}
