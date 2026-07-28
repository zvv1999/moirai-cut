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
			toast.error("The source media is unavailable for tracking");
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
				`Tracked ${result.samples.length} frames · ${result.failureRanges.length} failure ranges`,
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				toast.info("Motion tracking cancelled");
			} else {
				toast.error(error instanceof Error ? error.message : "Tracking failed");
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
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>Motion</SectionTitle>
			</div>
			<Section sectionKey="motion-region" showTopBorder={false}>
				<SectionHeader>
					<SectionTitle>Track region</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<div className="grid grid-cols-2 gap-2">
							<RegionField
								label="Left"
								value={region.x}
								onChange={(x) => setRegion({ ...region, x })}
							/>
							<RegionField
								label="Top"
								value={region.y}
								onChange={(y) => setRegion({ ...region, y })}
							/>
							<RegionField
								label="Width"
								value={region.width}
								onChange={(width) => setRegion({ ...region, width })}
							/>
							<RegionField
								label="Height"
								value={region.height}
								onChange={(height) => setRegion({ ...region, height })}
							/>
						</div>
						<label className="flex flex-col gap-1 text-xs">
							<span className="text-muted-foreground">Analysis quality</span>
							<select
								className="h-8 rounded-md border bg-background px-2"
								value={quality}
								onChange={(event) => {
									if (isTrackingQuality(event.target.value)) {
										setQuality(event.target.value);
									}
								}}
							>
								<option value="fast">Fast · 4 samples/s</option>
								<option value="balanced">Balanced · 7 samples/s</option>
								<option value="precise">Precise · 10 samples/s</option>
							</select>
						</label>
						<label className="flex flex-col gap-1 text-xs">
							<span className="text-muted-foreground">
								Confidence threshold · {Math.round(confidenceThreshold * 100)}%
							</span>
							<input
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
							<span className="text-muted-foreground">Bind result</span>
							<select
								className="h-8 rounded-md border bg-background px-2"
								aria-label="Motion tracking binding"
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
								<option value="none">Analyze only</option>
								<option value="transform">Clip transform</option>
								{(element.masks ?? []).map((mask, index) => (
									<option key={mask.id} value={`mask:${mask.id}`}>
										Mask {index + 1} · {mask.type}
									</option>
								))}
							</select>
						</label>
						{progress === null ? (
							<Button onClick={() => void runTracking()}>
								{tracking ? "Analyze again" : "Track region"}
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
									<span>{Math.round(progress * 100)}% · decoding frames</span>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => abortRef.current?.abort()}
									>
										Cancel
									</Button>
								</div>
							</div>
						)}
						{tracking ? (
							<div className="rounded-md border p-2 text-xs">
								<div className="font-medium text-emerald-600">
									{tracking.samples.length} samples ready
								</div>
								<div className="text-muted-foreground">
									{failures.length === 0
										? "No low-confidence ranges"
										: `${failures.length} low-confidence ranges need review`}
								</div>
							</div>
						) : null}
					</SectionFields>
				</SectionContent>
			</Section>

			{tracking ? (
				<Section sectionKey="tracking-failures">
					<SectionHeader>
						<SectionTitle>Failure ranges</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							{failures.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Every sample is above the confidence threshold.
								</p>
							) : (
								failures.map((range, index) => (
									<div
										key={`${range.start}:${index}`}
										className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5"
									>
										<label className="flex flex-col gap-1 text-xs">
											<span className="text-muted-foreground">Start</span>
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
											<span className="text-muted-foreground">End</span>
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
					<SectionTitle>Stabilization</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<div className="flex items-center justify-between text-sm">
							<span>Stabilize tracked motion</span>
							<Switch
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
								Strength · {Math.round(stabilization.strength)}%
							</span>
							<input
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
							<span>Auto crop edges</span>
							<Switch
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
									? "Quality: good · no failed ranges"
									: `Quality: review ${failures.length} failed ranges`
								: "Run motion analysis before enabling stabilization"}
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
								Clear analysis
							</Button>
						) : null}
					</SectionFields>
				</SectionContent>
			</Section>
		</div>
	);
}
