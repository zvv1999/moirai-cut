"use client";

import { useState } from "react";
import {
	ArrowLeft,
	ChevronRight,
	Focus,
	Info,
	Pipette,
	ScanLine,
	ShieldCheck,
	Sparkles,
	WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import { MotionTrackingTab } from "@/motion-tracking/components/motion-tracking-tab";
import type { Effect } from "@/effects/types";
import type { VideoElement, VisualElement } from "@/timeline";
import { cn } from "@/utils/ui";

type AiToolId = "tracking" | "cutout" | "chroma" | "stabilization" | "style";

const STYLE_PRESETS = ["油画", "美漫", "CG", "光影"];

function getEffect({
	element,
	type,
}: {
	element: VisualElement;
	type: string;
}): Effect | undefined {
	return (element.effects ?? []).find((effect) => effect.type === type);
}

function CapabilityCard({
	title,
	description,
	icon,
	active = false,
	enabled = false,
	disabled = false,
	onClick,
}: {
	title: string;
	description: string;
	icon: React.ReactNode;
	active?: boolean;
	enabled?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"border-border/80 bg-accent/25 group flex min-h-[78px] w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
				"hover:border-foreground/20 hover:bg-accent/55",
				active && "border-primary/45 bg-primary/[0.07]",
				disabled && "cursor-not-allowed opacity-45",
			)}
		>
			<span
				className={cn(
					"border-border bg-background text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border",
					(active || enabled) && "border-primary/35 text-primary",
				)}
			>
				{icon}
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-2">
					<span className="truncate text-[12px] font-medium">{title}</span>
					{enabled ? (
						<span className="bg-primary/12 text-primary rounded px-1.5 py-0.5 text-[9px]">
							已启用
						</span>
					) : null}
				</span>
				<span className="text-muted-foreground mt-1 block text-[10px] leading-4">
					{description}
				</span>
			</span>
			<ChevronRight className="text-muted-foreground size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
		</button>
	);
}

function EffectRange({
	label,
	value,
	min = 0,
	max = 100,
	step = 1,
	onChange,
}: {
	label: string;
	value: number;
	min?: number;
	max?: number;
	step?: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="grid grid-cols-[4.25rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-[11px]">
			<span className="text-muted-foreground">{label}</span>
			<input
				type="range"
				className="inspector-range w-full"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
			<input
				type="number"
				className="bg-input border-border h-7 rounded border px-1.5 text-right text-[10px]"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
		</label>
	);
}

function DetailHeader({
	title,
	onBack,
}: {
	title: string;
	onBack: () => void;
}) {
	return (
		<div className="border-border/80 flex h-11 shrink-0 items-center gap-2 border-b px-2">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-7"
				aria-label="返回 AI 效果列表"
				onClick={onBack}
			>
				<ArrowLeft className="size-4" />
			</Button>
			<span className="text-[12px] font-medium">{title}</span>
		</div>
	);
}

export function JianyingAiEffectsTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [activeTool, setActiveTool] = useState<AiToolId | null>(null);
	const cutout = getEffect({ element, type: "background-removal" });
	const chroma = getEffect({ element, type: "chroma-key" });
	const stabilization =
		element.type === "video"
			? (element.stabilization ?? {
					enabled: false,
					strength: 70,
					autoCrop: true,
				})
			: null;

	const ensureEffect = (effectType: string): string => {
		const existing = getEffect({ element, type: effectType });
		if (existing) return existing.id;
		return editor.timeline.addClipEffect({
			trackId,
			elementId: element.id,
			effectType,
		});
	};

	const setEffectEnabled = ({
		effectType,
		enabled,
	}: {
		effectType: string;
		enabled: boolean;
	}) => {
		const existing = getEffect({ element, type: effectType });
		if (!existing) {
			if (enabled) ensureEffect(effectType);
			return;
		}
		if (existing.enabled !== enabled) {
			editor.timeline.toggleClipEffect({
				trackId,
				elementId: element.id,
				effectId: existing.id,
			});
		}
	};

	const updateEffectParam = ({
		effectType,
		key,
		value,
	}: {
		effectType: string;
		key: string;
		value: number | string | boolean;
	}) => {
		const effectId = ensureEffect(effectType);
		const current = getEffect({ element, type: effectType });
		editor.timeline.updateClipEffectParams({
			trackId,
			elementId: element.id,
			effectId,
			params: { ...(current?.params ?? {}), [key]: value },
		});
	};

	const updateStabilization = (
		patch: Partial<VideoElement["stabilization"]>,
	) => {
		if (element.type !== "video" || !stabilization) return;
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						stabilization: {
							...stabilization,
							...patch,
						},
					},
				},
			],
		});
	};

	if (activeTool === "tracking" && element.type === "video") {
		return (
			<div className="flex h-full flex-col">
				<DetailHeader title="智能跟踪" onBack={() => setActiveTool(null)} />
				<div className="min-h-0 flex-1">
					<MotionTrackingTab element={element} trackId={trackId} />
				</div>
			</div>
		);
	}

	if (activeTool === "cutout") {
		return (
			<div className="flex h-full flex-col">
				<DetailHeader title="智能抠像" onBack={() => setActiveTool(null)} />
				<div className="space-y-4 px-3.5 py-4">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-[12px] font-medium">去除背景</p>
							<p className="text-muted-foreground mt-0.5 text-[10px]">
								识别主体并生成透明背景
							</p>
						</div>
						<Switch
							checked={cutout?.enabled ?? false}
							onCheckedChange={(enabled) =>
								setEffectEnabled({
									effectType: "background-removal",
									enabled,
								})
							}
						/>
					</div>
					<label className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 text-[11px]">
						<span className="text-muted-foreground">处理质量</span>
						<select
							className="bg-input border-border h-8 rounded border px-2"
							value={String(cutout?.params.quality ?? "balanced")}
							onChange={(event) =>
								updateEffectParam({
									effectType: "background-removal",
									key: "quality",
									value: event.target.value,
								})
							}
						>
							<option value="fast">快速</option>
							<option value="balanced">均衡</option>
							<option value="precise">精细</option>
						</select>
					</label>
					<EffectRange
						label="识别范围"
						value={Number(cutout?.params.threshold ?? 25)}
						onChange={(value) =>
							updateEffectParam({
								effectType: "background-removal",
								key: "threshold",
								value,
							})
						}
					/>
					<EffectRange
						label="边缘柔化"
						value={Number(cutout?.params.softness ?? 5)}
						onChange={(value) =>
							updateEffectParam({
								effectType: "background-removal",
								key: "softness",
								value,
							})
						}
					/>
				</div>
			</div>
		);
	}

	if (activeTool === "chroma") {
		return (
			<div className="flex h-full flex-col">
				<DetailHeader title="色度抠图" onBack={() => setActiveTool(null)} />
				<div className="space-y-4 px-3.5 py-4">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-[12px] font-medium">绿幕抠图</p>
							<p className="text-muted-foreground mt-0.5 text-[10px]">
								吸取颜色并实时去除
							</p>
						</div>
						<Switch
							checked={chroma?.enabled ?? false}
							onCheckedChange={(enabled) =>
								setEffectEnabled({ effectType: "chroma-key", enabled })
							}
						/>
					</div>
					<label className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 text-[11px]">
						<span className="text-muted-foreground">吸取颜色</span>
						<input
							type="color"
							className="bg-input border-border h-8 w-full rounded border p-1"
							value={String(chroma?.params.keyColor ?? "#00ff00")}
							onChange={(event) =>
								updateEffectParam({
									effectType: "chroma-key",
									key: "keyColor",
									value: event.target.value,
								})
							}
						/>
					</label>
					{[
						["相似度", "similarity", 20],
						["边缘柔化", "softness", 10],
						["溢色抑制", "spill", 50],
					].map(([label, key, fallback]) => (
						<EffectRange
							key={String(key)}
							label={String(label)}
							value={Number(chroma?.params[String(key)] ?? fallback)}
							onChange={(value) =>
								updateEffectParam({
									effectType: "chroma-key",
									key: String(key),
									value,
								})
							}
						/>
					))}
				</div>
			</div>
		);
	}

	if (activeTool === "stabilization" && stabilization) {
		return (
			<div className="flex h-full flex-col">
				<DetailHeader title="视频防抖" onBack={() => setActiveTool(null)} />
				<div className="space-y-4 px-3.5 py-4">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-[12px] font-medium">视频防抖</p>
							<p className="text-muted-foreground mt-0.5 text-[10px]">
								使用跟踪轨迹平滑镜头抖动
							</p>
						</div>
						<Switch
							checked={stabilization.enabled}
							onCheckedChange={(enabled) => updateStabilization({ enabled })}
						/>
					</div>
					<EffectRange
						label="防抖强度"
						value={stabilization.strength}
						onChange={(strength) => updateStabilization({ strength })}
					/>
					<div className="flex items-center justify-between text-[11px]">
						<span>自动裁剪黑边</span>
						<Switch
							aria-label="自动裁剪黑边"
							checked={stabilization.autoCrop}
							onCheckedChange={(autoCrop) => updateStabilization({ autoCrop })}
						/>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col pb-5">
			<section className="border-border/75 border-b px-3.5 py-4">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-[13px] font-medium">AI特效</h3>
						<p className="text-muted-foreground mt-1 text-[10px]">
							风格化能力待接入视频生成服务
						</p>
					</div>
					<span className="border-border bg-accent rounded border px-1.5 py-0.5 text-[9px] text-muted-foreground">
						能力待接入
					</span>
				</div>
				<div className="mt-3 grid grid-cols-4 gap-2">
					{STYLE_PRESETS.map((name, index) => (
						<button
							key={name}
							type="button"
							disabled
							className="group overflow-hidden rounded-md text-left opacity-55"
							title={`${name}：能力待接入`}
						>
							<span
								className={cn(
									"border-border/80 bg-accent/70 flex aspect-[4/5] items-center justify-center rounded-md border",
									index % 2 === 0 ? "text-primary/70" : "text-amber-300/70",
								)}
							>
								<WandSparkles className="size-5" />
							</span>
							<span className="mt-1 block truncate text-center text-[9px]">
								{name}
							</span>
						</button>
					))}
				</div>
				<div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[9px]">
					<Info className="size-3" />
					<span>未接入的能力保持禁用，不伪造生成结果。</span>
				</div>
			</section>

			<section className="px-3.5 py-4">
				<div className="mb-3 flex items-center gap-2">
					<Sparkles className="text-primary size-3.5" />
					<h3 className="text-[13px] font-medium">智能工具</h3>
				</div>
				<div className="space-y-2">
					<CapabilityCard
						title="智能跟踪"
						description="跟踪主体，驱动画面、蒙版和防抖"
						icon={<Focus className="size-4.5" />}
						enabled={
							element.type === "video" && Boolean(element.motionTracking)
						}
						disabled={element.type !== "video"}
						onClick={() => setActiveTool("tracking")}
					/>
					<CapabilityCard
						title="智能抠像"
						description="本地识别主体并去除视频背景"
						icon={<ScanLine className="size-4.5" />}
						enabled={cutout?.enabled}
						onClick={() => setActiveTool("cutout")}
					/>
					<CapabilityCard
						title="色度抠图"
						description="吸取绿幕或蓝幕颜色并实时去除"
						icon={<Pipette className="size-4.5" />}
						enabled={chroma?.enabled}
						onClick={() => setActiveTool("chroma")}
					/>
					<CapabilityCard
						title="视频防抖"
						description="平滑镜头运动，可自动裁剪黑边"
						icon={<ShieldCheck className="size-4.5" />}
						enabled={stabilization?.enabled}
						disabled={element.type !== "video"}
						onClick={() => setActiveTool("stabilization")}
					/>
				</div>
			</section>
		</div>
	);
}
