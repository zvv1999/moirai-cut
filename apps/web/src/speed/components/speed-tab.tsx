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
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>Retime</SectionTitle>
			</div>
			<Section sectionKey={`${element.id}:speed`} showTopBorder={false}>
				<SectionHeader>
					<SectionTitle>Speed mode</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<div className="grid grid-cols-2 gap-1.5">
							<Button
								size="sm"
								variant={mode === "constant" ? "default" : "outline"}
								onClick={() =>
									commitRetime({
										retime: buildRetime({
											rate,
											maintainPitch,
											existing: element.retime,
										}),
									})
								}
							>
								Constant
							</Button>
							<Button
								size="sm"
								variant={mode === "curve" ? "default" : "outline"}
								disabled={element.type === "audio"}
								onClick={() => applyCurvePreset({ preset: "hero" })}
							>
								Speed curve
							</Button>
						</div>
						{mode === "constant" ? (
							<SectionField label="Speed">
								<NumberField
									icon={<HugeiconsIcon icon={DashboardSpeed02Icon} />}
									value={speedDraft.displayValue}
									suffix="x"
									scrubRanges={[
										{ from: 0.01, to: 1, pixelsPerUnit: 160 },
										{ from: 1, to: 5, pixelsPerUnit: 48 },
									]}
									scrubClamp={{ min: MIN_RETIME_RATE, max: MAX_RETIME_RATE }}
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
						) : (
							<div className="flex flex-col gap-2">
								<div className="grid grid-cols-3 gap-1">
									<Button
										size="sm"
										variant="outline"
										onClick={() => applyCurvePreset({ preset: "ease-in" })}
									>
										Ease in
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => applyCurvePreset({ preset: "ease-out" })}
									>
										Ease out
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => applyCurvePreset({ preset: "hero" })}
									>
										Hero
									</Button>
								</div>
								{(element.retime?.curve?.points ?? []).map((point, index) => (
									<div
										key={`${point.time}:${index}`}
										className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5"
									>
										<label className="flex flex-col gap-1 text-xs">
											<span className="text-muted-foreground">Time</span>
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
											<span className="text-muted-foreground">Speed</span>
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
									Add point at playhead
								</Button>
							</div>
						)}
						<div className="flex items-center justify-between">
							<span className="text-sm">Change pitch</span>
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
					</SectionFields>
				</SectionContent>
			</Section>
			{element.type === "video" ? (
				<Section sectionKey={`${element.id}:direction`}>
					<SectionHeader>
						<SectionTitle>Direction and hold</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							<div className="flex items-center justify-between">
								<span className="text-sm">Reverse</span>
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
									<div className="text-sm">Freeze frame</div>
									<div className="text-muted-foreground text-[10px]">
										Hold current source frame
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
								<SectionField label="Held source time">
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
					<SectionTitle>Source boundary</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<div
						className={`rounded-md border p-2 text-xs ${
							boundary.overrun ? "text-red-500" : "text-emerald-600"
						}`}
					>
						<div className="font-medium">
							{boundary.overrun
								? "Source overrun"
								: `${boundarySeconds(boundary.remainingSourceSpan).toFixed(2)}s source handle remains`}
						</div>
						<div className="text-muted-foreground">
							Uses {boundarySeconds(boundary.usedSourceSpan).toFixed(2)}s{" / "}
							{boundarySeconds(boundary.availableSourceSpan).toFixed(2)}s
							available
						</div>
					</div>
				</SectionContent>
			</Section>
		</div>
	);
}
