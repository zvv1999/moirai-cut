import { useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSpeed02Icon } from "@hugeicons/core-free-icons";
import {
	buildConstantRetime,
	buildSpeedCurveRetime,
	getRetimeBoundaryStatus,
	getSourceTimeAtClipTime,
} from "@/retime";
import {
	DEFAULT_RETIME_RATE,
	MIN_RETIME_RATE,
	MAX_RETIME_RATE,
	clampRetimeRate,
	canMaintainPitch,
} from "@/retime/rate";
import type { AudioElement, VideoElement } from "@/timeline";
import type { RetimeConfig } from "@/timeline";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import { Button } from "@/components/ui/button";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
	TICKS_PER_SECOND,
} from "@/wasm";

const SPEED_STEP = 0.01;
const SPEED_FRACTION_DIGITS = getFractionDigitsForStep({ step: SPEED_STEP });

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
		!maintainPitch &&
		!constant.reverse &&
		constant.freezeFrameAt === undefined
	) {
		return undefined;
	}
	return constant;
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
	const maintainPitch = element.retime?.maintainPitch ?? false;
	const pendingRateRef = useRef(rate);
	const currentTime = useEditor((e) => e.playback.getCurrentTime());
	const mode = element.retime?.curve ? "curve" : "constant";
	const sourceSpan = Math.max(
		0,
		(element.sourceDuration ?? element.duration) -
			element.trimStart -
			element.trimEnd,
		element.duration * rate,
	);
	const boundary = getRetimeBoundaryStatus({
		duration: element.duration,
		sourceSpan,
		retime: element.retime,
	});
	const boundarySeconds = (time: number) => time / TICKS_PER_SECOND;

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
		displayValue: rateToDisplay({ rate }),
		parse: (input) => parseSpeedInput({ input }),
		onPreview: (nextRate) => {
			pendingRateRef.current = nextRate;
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
		<div className="flex h-full flex-col">
			<div
				className="border-border/70 grid h-[50px] shrink-0 grid-cols-3 gap-1 border-b px-3 py-2"
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
							className={
								isActive ? "bg-accent text-foreground" : "text-muted-foreground"
							}
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
			<Section sectionKey={`${element.id}:speed`} showTopBorder={false}>
				<SectionContent>
					<SectionFields>
						{mode === "constant" ? (
							<>
								<SectionField label="倍数">
									<NumberField
										icon={<HugeiconsIcon icon={DashboardSpeed02Icon} />}
										value={speedDraft.displayValue}
										suffix="x"
										scrubRanges={[
											{ from: 0.01, to: 1, pixelsPerUnit: 160 },
											{ from: 1, to: 5, pixelsPerUnit: 48 },
										]}
										scrubClamp={{
											min: MIN_RETIME_RATE,
											max: MAX_RETIME_RATE,
										}}
										onFocus={() => {
											pendingRateRef.current = rate;
											speedDraft.onFocus();
										}}
										onChange={speedDraft.onChange}
										onBlur={speedDraft.onBlur}
										onScrub={speedDraft.scrubTo}
										onScrubEnd={speedDraft.commitScrub}
										onReset={() =>
											commitRetime({
												retime: buildRetime({
													rate: DEFAULT_RETIME_RATE,
													maintainPitch,
													existing: element.retime,
												}),
											})
										}
										isDefault={rate === DEFAULT_RETIME_RATE}
									/>
								</SectionField>
								<div className="grid grid-cols-[4rem_1fr] items-center gap-3 text-sm">
									<span className="text-muted-foreground">时长</span>
									<div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
										<span>{boundarySeconds(sourceSpan).toFixed(1)}s</span>
										<span className="text-muted-foreground">→</span>
										<span>
											{mediaTimeToSeconds({
												time: element.duration,
											}).toFixed(1)}
											s
										</span>
									</div>
								</div>
							</>
						) : (
							<div className="flex flex-col gap-2">
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
											disabled={
												(element.retime?.curve?.points.length ?? 0) <= 2
											}
											onClick={() => {
												const points = (
													element.retime?.curve?.points ?? []
												).filter((_, pointIndex) => pointIndex !== index);
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
						<div className="flex items-center justify-between">
							<div>
								<div className="text-sm">声音变调</div>
								<div className="text-muted-foreground text-[10px]">
									关闭后保持原始音高
								</div>
							</div>
							<Switch
								checked={!maintainPitch}
								disabled={!isPitchPreserveAvailable || mode === "curve"}
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
						<div className="flex items-center justify-between">
							<div>
								<div className="text-sm">智能补帧</div>
								<div className="text-muted-foreground text-[10px]">
									仅对慢速片段有效 · 尚未接入
								</div>
							</div>
							<Switch disabled checked={false} />
						</div>
					</SectionFields>
				</SectionContent>
			</Section>
			{element.type === "video" ? (
				<Section sectionKey={`${element.id}:direction`}>
					<SectionHeader>
						<SectionTitle>更多</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							<div className="flex items-center justify-between">
								<span className="text-sm">倒放</span>
								<Switch
									checked={element.retime?.reverse ?? false}
									onCheckedChange={(reverse) =>
										commitRetime({
											retime: {
												...(element.retime ?? { rate: 1 }),
												reverse,
											},
										})
									}
								/>
							</div>
							<div className="flex items-center justify-between">
								<div>
									<div className="text-sm">定格</div>
									<div className="text-muted-foreground text-[10px]">
										定格当前源素材画面
									</div>
								</div>
								<Switch
									checked={element.retime?.freezeFrameAt !== undefined}
									onCheckedChange={(checked) => {
										const next = { ...(element.retime ?? { rate: 1 }) };
										if (checked) {
											delete next.freezeFrameAt;
											next.freezeFrameAt = roundMediaTime({
												time: getSourceTimeAtClipTime({
													clipTime: Math.max(
														0,
														Math.min(
															element.duration,
															currentTime - element.startTime,
														),
													),
													retime: next,
													sourceSpan,
												}),
											});
										} else {
											delete next.freezeFrameAt;
										}
										commitRetime({ retime: next });
									}}
								/>
							</div>
							{element.retime?.freezeFrameAt !== undefined ? (
								<SectionField label="定格时间">
									<NumberField
										value={mediaTimeToSeconds({
											time: element.retime.freezeFrameAt,
										}).toFixed(2)}
										suffix="s"
										onChange={() => {}}
										onBlur={(event) => {
											const seconds = Number(event.currentTarget.value);
											if (!Number.isFinite(seconds)) return;
											commitRetime({
												retime: {
													...(element.retime ?? { rate: 1 }),
													freezeFrameAt: roundMediaTime({
														time: Math.min(
															sourceSpan,
															mediaTimeFromSeconds({
																seconds: Math.max(0, seconds),
															}),
														),
													}),
												},
											});
										}}
										onScrub={() => {}}
										onScrubEnd={() => {}}
										onReset={() => {
											const next = {
												...(element.retime ?? { rate: 1 }),
											};
											delete next.freezeFrameAt;
											commitRetime({ retime: next });
										}}
										isDefault={false}
									/>
								</SectionField>
							) : null}
						</SectionFields>
					</SectionContent>
				</Section>
			) : null}
			<Section sectionKey={`${element.id}:source-boundary`}>
				<SectionHeader>
					<SectionTitle>源素材边界</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<div
						className={`rounded-md border p-2 text-xs ${
							boundary.overrun ? "text-red-500" : "text-emerald-600"
						}`}
					>
						<div className="font-medium">
							{boundary.overrun
								? "源素材时长不足"
								: `还可延长 ${boundarySeconds(boundary.remainingSourceSpan).toFixed(2)} 秒`}
						</div>
						<div className="text-muted-foreground">
							已使用 {boundarySeconds(boundary.usedSourceSpan).toFixed(2)} 秒
							{" / "}
							可用 {boundarySeconds(boundary.availableSourceSpan).toFixed(2)} 秒
						</div>
					</div>
				</SectionContent>
			</Section>
		</div>
	);
}
