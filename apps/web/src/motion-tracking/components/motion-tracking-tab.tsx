"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import type { MotionTrackingData, TrackingRegion } from "@/motion-tracking";
import { buildTrackingFailureRanges } from "@/motion-tracking";
import { analyzeVideoMotion } from "@/motion-tracking/analyze";
import type { VideoElement } from "@/timeline";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";

const DEFAULT_REGION: TrackingRegion = {
	x: 0.35,
	y: 0.35,
	width: 0.3,
	height: 0.3,
};

function isTrackingQuality(
	value: string,
): value is MotionTrackingData["quality"] {
	return value === "fast" || value === "balanced" || value === "precise";
}

function clampPercent({
	value,
	fallback,
}: {
	value: number;
	fallback: number;
}): number {
	return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
}

function RegionField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="flex flex-col gap-1 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<div className="relative">
				<input
					type="number"
					min={0}
					max={100}
					step={1}
					className="h-8 w-full rounded-md border bg-background px-2 pr-6"
					value={Math.round(value * 100)}
					onChange={(event) =>
						onChange(
							clampPercent({
								value: Number(event.target.value),
								fallback: value * 100,
							}) / 100,
						)
					}
				/>
				<span className="text-muted-foreground pointer-events-none absolute right-2 top-2">
					%
				</span>
			</div>
		</label>
	);
}

function getMaskTypeLabel(type: string): string {
	switch (type) {
		case "split":
			return "线性";
		case "cinematic-bars":
			return "电影黑边";
		case "rectangle":
			return "矩形";
		case "ellipse":
			return "椭圆";
		case "heart":
			return "爱心";
		case "diamond":
			return "菱形";
		case "star":
			return "星形";
		case "text":
			return "文字";
		case "freeform":
			return "自由绘制";
		default:
			return type;
	}
}

export function MotionTrackingTab({
	element,
	trackId,
}: {
	element: VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [region, setRegion] = useState(
		element.motionTracking?.region ?? DEFAULT_REGION,
	);
	const [quality, setQuality] = useState<MotionTrackingData["quality"]>(
		element.motionTracking?.quality ?? "balanced",
	);
	const [confidenceThreshold, setConfidenceThreshold] = useState(
		element.motionTracking?.confidenceThreshold ?? 0.55,
	);
	const [binding, setBinding] = useState(
		element.motionTracking?.binding.type === "mask"
			? `mask:${element.motionTracking.binding.maskId}`
			: (element.motionTracking?.binding.type ?? "none"),
	);
	const [progress, setProgress] = useState<number | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const tracking = element.motionTracking;
	const failures = tracking?.failureRanges ?? [];
	const stabilization = element.stabilization ?? {
		enabled: false,
		strength: 70,
		autoCrop: true,
	};

	const updateElement = (patch: Partial<VideoElement>) => {
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch }],
		});
	};
	const resolvedBinding = (): MotionTrackingData["binding"] => {
		if (binding === "transform") return { type: "transform" };
		if (binding.startsWith("mask:")) {
			return { type: "mask", maskId: binding.slice(5) };
		}
		return { type: "none" };
	};
	const runTracking = async () => {
		const asset = editor.media
			.getAssets()
			.find((candidate) => candidate.id === element.mediaId);
		if (!asset) {
			toast.error("源素材不可用，无法进行运动跟踪");
			return;
		}
		const controller = new AbortController();
		abortRef.current = controller;
		setProgress(0);
		try {
			const result = await analyzeVideoMotion({
				element,
				asset,
				region,
				quality,
				confidenceThreshold,
				signal: controller.signal,
				onProgress: setProgress,
			});
			updateElement({
				motionTracking: { ...result, binding: resolvedBinding() },
			});
			toast.success(
				`已完成 ${result.samples.length} 个采样点 · ${result.failureRanges.length} 段需要检查`,
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				toast.info("已取消运动跟踪");
			} else {
				toast.error(
					error instanceof Error ? error.message : "运动跟踪失败，请重试",
				);
			}
		} finally {
			abortRef.current = null;
			setProgress(null);
		}
	};
	const updateTracking = ({
		updates,
	}: {
		updates: Partial<MotionTrackingData>;
	}) => {
		if (!tracking) return;
		updateElement({ motionTracking: { ...tracking, ...updates } });
	};
	const updateFailureRange = ({
		index,
		side,
		seconds,
	}: {
		index: number;
		side: "start" | "end";
		seconds: number;
	}) => {
		if (!tracking || !Number.isFinite(seconds)) return;
		const next = tracking.failureRanges.map((range, rangeIndex) =>
			rangeIndex === index
				? {
						...range,
						[side]: mediaTimeFromSeconds({ seconds: Math.max(0, seconds) }),
					}
				: range,
		);
		updateTracking({ updates: { failureRanges: next } });
	};

	return (
		<div className="flex h-full flex-col">
			<div className="border-b px-3.5 py-3 shrink-0">
				<div className="flex items-center justify-between gap-2">
					<SectionTitle>智能跟踪</SectionTitle>
					<span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-500">
						本地分析
					</span>
				</div>
				<p className="mt-1 text-[11px] leading-4 text-muted-foreground">
					识别选定区域的运动，可驱动画面位置或蒙版，并用于视频防抖。
				</p>
			</div>
			<Section sectionKey="motion-region" showTopBorder={false}>
				<SectionHeader>
					<SectionTitle>跟踪区域</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<div className="grid grid-cols-2 gap-2">
							<RegionField
								label="左边界"
								value={region.x}
								onChange={(x) => setRegion({ ...region, x })}
							/>
							<RegionField
								label="上边界"
								value={region.y}
								onChange={(y) => setRegion({ ...region, y })}
							/>
							<RegionField
								label="宽度"
								value={region.width}
								onChange={(width) => setRegion({ ...region, width })}
							/>
							<RegionField
								label="高度"
								value={region.height}
								onChange={(height) => setRegion({ ...region, height })}
							/>
						</div>
						<label className="flex flex-col gap-1 text-xs">
							<span className="text-muted-foreground">分析质量</span>
							<select
								className="h-8 rounded-md border bg-background px-2"
								value={quality}
								onChange={(event) => {
									if (isTrackingQuality(event.target.value)) {
										setQuality(event.target.value);
									}
								}}
							>
								<option value="fast">快速 · 每秒 4 个采样点</option>
								<option value="balanced">均衡 · 每秒 7 个采样点</option>
								<option value="precise">精细 · 每秒 10 个采样点</option>
							</select>
						</label>
						<label className="flex flex-col gap-1 text-xs">
							<span className="text-muted-foreground">
								置信度 · {Math.round(confidenceThreshold * 100)}%
							</span>
							<input
								aria-label={`置信度 · ${Math.round(confidenceThreshold * 100)}%`}
								type="range"
								min={10}
								max={95}
								value={Math.round(confidenceThreshold * 100)}
								onChange={(event) => {
									const next = Number(event.target.value) / 100;
									setConfidenceThreshold(next);
									if (tracking) {
										updateTracking({
											updates: {
												confidenceThreshold: next,
												failureRanges: buildTrackingFailureRanges({
													samples: tracking.samples,
													confidenceThreshold: next,
												}),
											},
										});
									}
								}}
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs">
							<span className="text-muted-foreground">应用结果</span>
							<select
								className="h-8 rounded-md border bg-background px-2"
								aria-label="运动跟踪应用结果"
								value={binding}
								onChange={(event) => {
									setBinding(event.target.value);
									if (tracking) {
										const value = event.target.value;
										updateTracking({
											updates: {
												binding:
													value === "transform"
														? { type: "transform" }
														: value.startsWith("mask:")
															? {
																	type: "mask",
																	maskId: value.slice(5),
																}
															: { type: "none" },
											},
										});
									}
								}}
							>
								<option value="none">仅分析，不应用</option>
								<option value="transform">应用到画面位置</option>
								{(element.masks ?? []).map((mask, index) => (
									<option key={mask.id} value={`mask:${mask.id}`}>
										蒙版 {index + 1} · {getMaskTypeLabel(mask.type)}
									</option>
								))}
							</select>
						</label>
						{progress === null ? (
							<Button onClick={() => void runTracking()}>
								{tracking ? "重新分析" : "开始跟踪"}
							</Button>
						) : (
							<div className="flex flex-col gap-2">
								<div className="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full bg-primary transition-[width]"
										style={{ width: `${Math.round(progress * 100)}%` }}
									/>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span>{Math.round(progress * 100)}% · 正在解码画面</span>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => abortRef.current?.abort()}
									>
										取消
									</Button>
								</div>
							</div>
						)}
						{tracking ? (
							<div className="rounded-md border p-2 text-xs">
								<div className="font-medium text-emerald-600">
									已完成 {tracking.samples.length} 个采样点
								</div>
								<div className="text-muted-foreground">
									{failures.length === 0
										? "没有低置信度区间"
										: `${failures.length} 段低置信度区间需要检查`}
								</div>
							</div>
						) : null}
					</SectionFields>
				</SectionContent>
			</Section>

			{tracking ? (
				<Section sectionKey="tracking-failures">
					<SectionHeader>
						<SectionTitle>待检查区间</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							{failures.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									所有采样点均达到当前置信度要求。
								</p>
							) : (
								failures.map((range, index) => (
									<div
										key={`${range.start}:${index}`}
										className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5"
									>
										<label className="flex flex-col gap-1 text-xs">
											<span className="text-muted-foreground">开始</span>
											<input
												type="number"
												step={0.01}
												className="h-8 rounded-md border bg-background px-2"
												defaultValue={(range.start / TICKS_PER_SECOND).toFixed(
													2,
												)}
												onBlur={(event) =>
													updateFailureRange({
														index,
														side: "start",
														seconds: Number(event.target.value),
													})
												}
											/>
										</label>
										<label className="flex flex-col gap-1 text-xs">
											<span className="text-muted-foreground">结束</span>
											<input
												type="number"
												step={0.01}
												className="h-8 rounded-md border bg-background px-2"
												defaultValue={(range.end / TICKS_PER_SECOND).toFixed(2)}
												onBlur={(event) =>
													updateFailureRange({
														index,
														side: "end",
														seconds: Number(event.target.value),
													})
												}
											/>
										</label>
										<span className="pb-2 text-[10px] text-amber-600">
											{Math.round(range.minimumConfidence * 100)}%
										</span>
									</div>
								))
							)}
						</SectionFields>
					</SectionContent>
				</Section>
			) : null}

			<Section sectionKey="stabilization">
				<SectionHeader>
					<SectionTitle>防抖</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<div className="flex items-center justify-between text-sm">
							<span>稳定跟踪运动</span>
							<Switch
								aria-label="稳定跟踪运动"
								disabled={!tracking}
								checked={stabilization.enabled}
								onCheckedChange={(enabled) =>
									updateElement({
										stabilization: { ...stabilization, enabled },
									})
								}
							/>
						</div>
						<label className="flex flex-col gap-1 text-xs">
							<span className="text-muted-foreground">
								强度 · {Math.round(stabilization.strength)}%
							</span>
							<input
								aria-label={`防抖强度 · ${Math.round(stabilization.strength)}%`}
								type="range"
								min={0}
								max={100}
								value={stabilization.strength}
								disabled={!tracking}
								onChange={(event) =>
									updateElement({
										stabilization: {
											...stabilization,
											strength: Number(event.target.value),
										},
									})
								}
							/>
						</label>
						<div className="flex items-center justify-between text-sm">
							<span>自动裁切边缘</span>
							<Switch
								aria-label="自动裁切边缘"
								disabled={!tracking}
								checked={stabilization.autoCrop}
								onCheckedChange={(autoCrop) =>
									updateElement({
										stabilization: { ...stabilization, autoCrop },
									})
								}
							/>
						</div>
						<div
							className={`rounded-md border p-2 text-xs ${
								tracking
									? failures.length === 0
										? "text-emerald-600"
										: "text-amber-600"
									: "text-muted-foreground"
							}`}
						>
							{tracking
								? failures.length === 0
									? "分析质量良好 · 没有待检查区间"
									: `请检查 ${failures.length} 段低置信度区间`
								: "完成运动跟踪后即可开启防抖"}
						</div>
						{tracking ? (
							<Button
								variant="ghost"
								onClick={() =>
									updateElement({
										motionTracking: undefined,
										stabilization: undefined,
									})
								}
							>
								清除分析结果
							</Button>
						) : null}
					</SectionFields>
				</SectionContent>
			</Section>
		</div>
	);
}
