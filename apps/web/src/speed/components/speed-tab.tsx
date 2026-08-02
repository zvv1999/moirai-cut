import { useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { NumberField } from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDownIcon, ArrowUpIcon } from "@hugeicons/core-free-icons";
import { buildConstantRetime, buildSpeedCurveRetime } from "@/retime";
import {
	DEFAULT_RETIME_RATE,
	MIN_RETIME_RATE,
	MAX_RETIME_RATE,
	clampRetimeRate,
	canMaintainPitch,
} from "@/retime/rate";
import type { AudioElement, VideoElement } from "@/timeline";
import type { RetimeConfig } from "@/timeline";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import { Button } from "@/components/ui/button";
import { mediaTimeToSeconds, TICKS_PER_SECOND } from "@/wasm";

const SPEED_STEP = 0.01;
const DURATION_STEP = 0.1;
const SPEED_FRACTION_DIGITS = getFractionDigitsForStep({ step: SPEED_STEP });
const SPEED_SLIDER_TICKS = [0, 20, 40, 60, 80, 100] as const;

export const JIANYING_SPEED_TABS = [
	{ id: "constant", label: "常规变速" },
	{ id: "curve", label: "曲线变速" },
	{ id: "beat", label: "变速卡点" },
] as const;

export const JIANYING_SPEED_LABELS = [
	"倍数",
	"时长",
	"声音变调",
	"智能补帧",
] as const;

function rateToDisplay({ rate }: { rate: number }): string {
	return formatNumberForDisplay({
		value: rate,
		fractionDigits: SPEED_FRACTION_DIGITS,
	});
}

function parseSpeedInput({ input }: { input: string }): number | null {
	const parsed = parseFloat(input);
	if (Number.isNaN(parsed)) return null;
	return clampRetimeRate({
		rate: snapToStep({ value: parsed, step: SPEED_STEP }),
	});
}

function clampDuration({
	duration,
	sourceSeconds,
}: {
	duration: number;
	sourceSeconds: number;
}): number {
	const minDuration = sourceSeconds / MAX_RETIME_RATE;
	const maxDuration = sourceSeconds / MIN_RETIME_RATE;
	return Math.min(maxDuration, Math.max(minDuration, duration));
}

function parseDurationInput({
	input,
	sourceSeconds,
}: {
	input: string;
	sourceSeconds: number;
}): number | null {
	const parsed = parseFloat(input);
	if (!Number.isFinite(parsed) || parsed <= 0 || sourceSeconds <= 0)
		return null;
	const duration = clampDuration({
		duration: snapToStep({ value: parsed, step: DURATION_STEP }),
		sourceSeconds,
	});
	return clampRetimeRate({
		rate: snapToStep({
			value: sourceSeconds / duration,
			step: SPEED_STEP,
		}),
	});
}

function buildRetime({
	rate,
	maintainPitch,
	existing,
}: {
	rate: number;
	maintainPitch: boolean;
	existing?: RetimeConfig;
}): RetimeConfig | undefined {
	const constant = {
		...buildConstantRetime({ rate, maintainPitch }),
		...(existing?.reverse ? { reverse: true } : {}),
		...(existing?.freezeFrameAt !== undefined
			? { freezeFrameAt: existing.freezeFrameAt }
			: {}),
	};
	if (
		rate === DEFAULT_RETIME_RATE &&
		maintainPitch &&
		!constant.reverse &&
		constant.freezeFrameAt === undefined
	) {
		return undefined;
	}
	return constant;
}

function JianyingStepperField({
	"aria-label": ariaLabel,
	value,
	numericValue,
	suffix,
	step,
	min,
	max,
	onFocus,
	onChange,
	onBlur,
	onStep,
}: {
	"aria-label": string;
	value: string;
	numericValue: number;
	suffix: string;
	step: number;
	min: number;
	max: number;
	onFocus: () => void;
	onChange: React.ChangeEventHandler<HTMLInputElement>;
	onBlur: React.FocusEventHandler<HTMLInputElement>;
	onStep: (value: number) => void;
}) {
	const stepValue = (direction: 1 | -1) => {
		onStep(
			Math.min(
				max,
				Math.max(
					min,
					snapToStep({
						value: numericValue + direction * step,
						step,
					}),
				),
			),
		);
	};

	return (
		<div className="flex h-9 w-[98px] shrink-0 overflow-hidden rounded-md">
			<NumberField
				aria-label={ariaLabel}
				value={value}
				suffix={suffix}
				className="h-9 rounded-r-none border-r-0 bg-[#1b1b1b] px-2 text-center"
				onFocus={onFocus}
				onChange={onChange}
				onBlur={onBlur}
			/>
			<div className="border-border flex w-7 shrink-0 flex-col border bg-[#3c3c3c]">
				<button
					type="button"
					aria-label={`增加${ariaLabel}`}
					className="hover:bg-accent flex min-h-0 flex-1 items-center justify-center"
					onPointerDown={(event) => event.preventDefault()}
					onClick={() => stepValue(1)}
				>
					<HugeiconsIcon icon={ArrowUpIcon} className="size-3.5" />
				</button>
				<button
					type="button"
					aria-label={`减少${ariaLabel}`}
					className="border-border hover:bg-accent flex min-h-0 flex-1 items-center justify-center border-t"
					onPointerDown={(event) => event.preventDefault()}
					onClick={() => stepValue(-1)}
				>
					<HugeiconsIcon icon={ArrowDownIcon} className="size-3.5" />
				</button>
			</div>
		</div>
	);
}

export function SpeedTab({
	element,
	trackId,
}: {
	element: AudioElement | VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const rate = clampRetimeRate({
		rate: element.retime?.rate ?? DEFAULT_RETIME_RATE,
	});
	const isPitchPreserveAvailable = canMaintainPitch({ rate });
	const maintainPitch = element.retime?.maintainPitch ?? true;
	const pendingRateRef = useRef(rate);
	const [ratePreview, setRatePreview] = useState({
		sourceRate: rate,
		value: rate,
	});
	const interactiveRate =
		ratePreview.sourceRate === rate ? ratePreview.value : rate;
	const currentTime = useEditor((e) => e.playback.getCurrentTime());
	const mode = element.retime?.curve ? "curve" : "constant";
	const sourceSpan = Math.max(
		0,
		(element.sourceDuration ?? element.duration) -
			element.trimStart -
			element.trimEnd,
		element.duration * rate,
	);
	const sourceSeconds = sourceSpan / TICKS_PER_SECOND;
	const resultDurationSeconds = mediaTimeToSeconds({
		time: element.duration,
	});
	const interactiveDurationSeconds =
		interactiveRate === rate
			? resultDurationSeconds
			: sourceSeconds / interactiveRate;

	const commitRetime = ({ retime }: { retime?: RetimeConfig }) => {
		editor.timeline.updateElementRetime({
			trackId,
			elementId: element.id,
			retime,
		});
	};
	const preserveDirectionAndHold = ({
		retime,
	}: {
		retime: RetimeConfig;
	}): RetimeConfig => ({
		...retime,
		...(element.retime?.reverse ? { reverse: true } : {}),
		...(element.retime?.freezeFrameAt !== undefined
			? { freezeFrameAt: element.retime.freezeFrameAt }
			: {}),
	});

	const speedDraft = usePropertyDraft({
		displayValue: rateToDisplay({ rate: interactiveRate }),
		parse: (input) => parseSpeedInput({ input }),
		onPreview: (nextRate) => {
			pendingRateRef.current = nextRate;
			setRatePreview({ sourceRate: rate, value: nextRate });
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							retime: buildRetime({
								rate: nextRate,
								maintainPitch,
								existing: element.retime,
							}),
						},
					},
				],
			});
		},
		onCommit: () => {
			commitRetime({
				retime: buildRetime({
					rate: pendingRateRef.current,
					maintainPitch,
					existing: element.retime,
				}),
			});
		},
	});
	const durationDraft = usePropertyDraft({
		displayValue: interactiveDurationSeconds.toFixed(1),
		parse: (input) => parseDurationInput({ input, sourceSeconds }),
		onPreview: (nextRate) => {
			pendingRateRef.current = nextRate;
			setRatePreview({ sourceRate: rate, value: nextRate });
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							retime: buildRetime({
								rate: nextRate,
								maintainPitch,
								existing: element.retime,
							}),
						},
					},
				],
			});
		},
		onCommit: () => {
			commitRetime({
				retime: buildRetime({
					rate: pendingRateRef.current,
					maintainPitch,
					existing: element.retime,
				}),
			});
		},
	});

	const applyCurvePreset = ({
		preset,
	}: {
		preset: "ease-in" | "ease-out" | "hero";
	}) => {
		const points =
			preset === "ease-in"
				? [
						{ time: 0, rate: 0.5 },
						{ time: element.duration, rate: 1.5 },
					]
				: preset === "ease-out"
					? [
							{ time: 0, rate: 1.5 },
							{ time: element.duration, rate: 0.5 },
						]
					: [
							{ time: 0, rate: 0.6 },
							{ time: Math.round(element.duration * 0.45), rate: 2.2 },
							{ time: element.duration, rate: 0.8 },
						];
		commitRetime({
			retime: preserveDirectionAndHold({
				retime: buildSpeedCurveRetime({ points, maintainPitch }),
			}),
		});
	};
	const updateCurvePoint = ({
		index,
		time,
		rate: nextRate,
	}: {
		index: number;
		time?: number;
		rate?: number;
	}) => {
		const points = (element.retime?.curve?.points ?? []).map(
			(point, pointIndex) =>
				pointIndex === index
					? {
							time:
								time === undefined
									? point.time
									: Math.min(element.duration, Math.max(0, Math.round(time))),
							rate:
								nextRate === undefined
									? point.rate
									: clampRetimeRate({ rate: nextRate }),
						}
					: point,
		);
		commitRetime({
			retime: preserveDirectionAndHold({
				retime: buildSpeedCurveRetime({ points, maintainPitch }),
			}),
		});
	};

	return (
		<div className="flex h-full min-h-0 flex-col bg-[#242424] text-[#e8e8e8]">
			<div className="border-border/70 shrink-0 border-b px-3 py-3">
				<div
					className="grid h-9 grid-cols-3 rounded-md bg-[#191919] p-0.5"
					role="tablist"
					aria-label="变速模式"
				>
					{JIANYING_SPEED_TABS.map((tab) => {
						const isActive = tab.id === mode;
						const disabled =
							tab.id === "beat" ||
							(tab.id === "curve" && element.type === "audio");
						return (
							<Button
								key={tab.id}
								type="button"
								role="tab"
								size="sm"
								variant="ghost"
								aria-selected={isActive}
								disabled={disabled}
								title={
									tab.id === "beat"
										? "变速卡点尚未接入"
										: disabled
											? "音频素材暂不支持曲线变速"
											: tab.label
								}
								className={`h-8 rounded-[5px] text-xs ${
									isActive
										? "bg-[#3d3d3d] text-white hover:bg-[#3d3d3d]"
										: "text-muted-foreground hover:bg-[#303030] hover:text-white"
								}`}
								onClick={() => {
									if (tab.id === "constant") {
										commitRetime({
											retime: buildRetime({
												rate,
												maintainPitch,
												existing: element.retime,
											}),
										});
									} else if (tab.id === "curve") {
										applyCurvePreset({ preset: "hero" });
									}
								}}
							>
								{tab.label}
							</Button>
						);
					})}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{mode === "constant" ? (
					<div className="px-3 py-3">
						<div className="border-border/70 flex flex-col gap-8 border-t pt-5">
							<div className="flex flex-col gap-3">
								<div className="text-sm font-medium">倍数</div>
								<div className="flex items-center gap-3">
									<div className="relative min-w-0 flex-1 py-3">
										<div
											className="pointer-events-none absolute inset-x-0 top-1/2 h-4 -translate-y-1/2"
											aria-hidden="true"
										>
											{SPEED_SLIDER_TICKS.map((position) => (
												<span
													key={position}
													className="bg-muted-foreground/70 absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2"
													style={{ left: `${position}%` }}
												/>
											))}
										</div>
										<Slider
											aria-label="倍数滑杆"
											thumbAriaLabel="倍数滑杆"
											min={MIN_RETIME_RATE}
											max={MAX_RETIME_RATE}
											step={SPEED_STEP}
											value={[interactiveRate]}
											className="relative z-10"
											trackClassName="h-px overflow-visible rounded-none bg-[#606060]"
											rangeClassName="bg-white"
											thumbClassName="size-[17px] border-0 bg-white"
											onValueChange={([nextRate]) => {
												if (nextRate !== undefined) {
													speedDraft.scrubTo(nextRate);
												}
											}}
											onValueCommit={([nextRate]) => {
												if (nextRate !== undefined) {
													speedDraft.scrubTo(nextRate);
													speedDraft.commitScrub();
												}
											}}
										/>
									</div>
									<JianyingStepperField
										aria-label="倍数"
										value={speedDraft.displayValue}
										numericValue={interactiveRate}
										suffix="x"
										step={SPEED_STEP}
										min={MIN_RETIME_RATE}
										max={MAX_RETIME_RATE}
										onFocus={() => {
											pendingRateRef.current = rate;
											speedDraft.onFocus();
										}}
										onChange={speedDraft.onChange}
										onBlur={speedDraft.onBlur}
										onStep={(nextRate) => {
											speedDraft.scrubTo(nextRate);
											speedDraft.commitScrub();
										}}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-2.5">
								<div className="text-sm font-medium">时长</div>
								<div className="flex items-center gap-3">
									<span
										className="w-[60px] shrink-0 text-sm tabular-nums"
										aria-label="原始时长"
									>
										{sourceSeconds.toFixed(1)}s
									</span>
									<div className="relative min-w-6 flex-1 border-t-2 border-dashed border-[#4b4b4b]">
										<span className="absolute -right-0.5 -top-[5px] size-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-[#4b4b4b]" />
									</div>
									<JianyingStepperField
										aria-label="结果时长"
										value={durationDraft.displayValue}
										numericValue={interactiveDurationSeconds}
										suffix="s"
										step={DURATION_STEP}
										min={
											sourceSeconds > 0
												? sourceSeconds / MAX_RETIME_RATE
												: DURATION_STEP
										}
										max={
											sourceSeconds > 0
												? sourceSeconds / MIN_RETIME_RATE
												: DURATION_STEP
										}
										onFocus={() => {
											pendingRateRef.current = rate;
											durationDraft.onFocus();
										}}
										onChange={durationDraft.onChange}
										onBlur={durationDraft.onBlur}
										onStep={(nextDuration) => {
											durationDraft.scrubTo(nextDuration);
											durationDraft.commitScrub();
										}}
									/>
								</div>
							</div>

							<div className="flex items-center justify-between">
								<div className="text-sm font-medium">声音变调</div>
								<Switch
									aria-label="声音变调"
									checked={!maintainPitch}
									disabled={!isPitchPreserveAvailable}
									onCheckedChange={(checked) =>
										commitRetime({
											retime: buildRetime({
												rate,
												maintainPitch: !checked,
												existing: element.retime,
											}),
										})
									}
								/>
							</div>

							<div
								className="flex items-center gap-2 text-xs text-[#777]"
								aria-disabled="true"
							>
								<span className="size-4 shrink-0 rounded border border-[#555] bg-[#2a2a2a]" />
								<span className="font-medium">智能补帧</span>
								<span className="rounded bg-[#536163] px-1 py-0.5 text-[10px] text-[#b9c3c4]">
									限免
								</span>
								<span>（仅对慢速片段补帧）</span>
								<span className="ml-auto">⌄</span>
							</div>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-4 px-3 py-4">
						<div className="grid grid-cols-3 gap-1">
							<Button
								size="sm"
								variant="outline"
								onClick={() => applyCurvePreset({ preset: "ease-in" })}
							>
								渐入
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => applyCurvePreset({ preset: "ease-out" })}
							>
								渐出
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => applyCurvePreset({ preset: "hero" })}
							>
								英雄时刻
							</Button>
						</div>
						{(element.retime?.curve?.points ?? []).map((point, index) => (
							<div
								key={`${point.time}:${index}`}
								className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5"
							>
								<label className="flex flex-col gap-1 text-xs">
									<span className="text-muted-foreground">时间</span>
									<div className="relative">
										<input
											type="number"
											min={0}
											max={100}
											step={1}
											className="h-8 w-full rounded-md border bg-background px-2 pr-6"
											defaultValue={Math.round(
												(point.time / Math.max(1, element.duration)) * 100,
											)}
											onBlur={(event) =>
												updateCurvePoint({
													index,
													time:
														(Number(event.target.value) / 100) *
														element.duration,
												})
											}
										/>
										<span className="text-muted-foreground absolute right-2 top-2">
											%
										</span>
									</div>
								</label>
								<label className="flex flex-col gap-1 text-xs">
									<span className="text-muted-foreground">倍数</span>
									<input
										type="number"
										min={MIN_RETIME_RATE}
										max={MAX_RETIME_RATE}
										step={0.05}
										className="h-8 rounded-md border bg-background px-2"
										defaultValue={point.rate}
										onBlur={(event) =>
											updateCurvePoint({
												index,
												rate: Number(event.target.value),
											})
										}
									/>
								</label>
								<Button
									size="sm"
									variant="ghost"
									disabled={(element.retime?.curve?.points.length ?? 0) <= 2}
									onClick={() => {
										const points = (element.retime?.curve?.points ?? []).filter(
											(_, pointIndex) => pointIndex !== index,
										);
										commitRetime({
											retime: preserveDirectionAndHold({
												retime: buildSpeedCurveRetime({
													points,
													maintainPitch,
												}),
											}),
										});
									}}
								>
									×
								</Button>
							</div>
						))}
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								const localTime = Math.min(
									element.duration,
									Math.max(0, currentTime - element.startTime),
								);
								const points = [
									...(element.retime?.curve?.points ?? []),
									{ time: localTime, rate },
								];
								commitRetime({
									retime: preserveDirectionAndHold({
										retime: buildSpeedCurveRetime({
											points,
											maintainPitch,
										}),
									}),
								});
							}}
						>
							在播放头添加变速点
						</Button>
					</div>
				)}
			</div>

			<div
				data-speed-reset-footer
				className="border-border/70 flex h-[58px] shrink-0 items-center justify-end border-t bg-[#2d2d2d] px-3"
			>
				<Button
					type="button"
					size="sm"
					variant="secondary"
					className="h-8 w-24 bg-[#585858] text-white hover:bg-[#666]"
					onClick={() => commitRetime({ retime: undefined })}
				>
					重置
				</Button>
			</div>
		</div>
	);
}
