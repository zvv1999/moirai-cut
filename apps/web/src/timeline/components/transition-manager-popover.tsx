"use client";

import { useEffect, useMemo, useState } from "react";
import { Exchange01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
	RemoveTimelineTransitionCommand,
	SetTimelineTransitionCommand,
} from "@/commands";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
	planTimelineTransition,
	type TimelineTransitionPlan,
} from "@/timeline/transitions";
import type { TimelineTransitionType } from "@/timeline";
import { generateUUID } from "@/utils/id";
import {
	mediaTimeToSeconds,
	mediaTimeFromSeconds,
	type MediaTime,
} from "@/wasm";

const DEFAULT_DURATION_SECONDS = 0.5;
const TRANSITION_LABELS: Record<TimelineTransitionType, string> = {
	"cross-dissolve": "交叉溶解",
	"fade-through-black": "黑场淡化",
};

export function TransitionManagerPopover() {
	const editor = useEditor();
	const tracks = useEditor(
		(currentEditor) => currentEditor.scenes.getActiveScene().tracks,
	);
	const { selectedElements } = useElementSelection();
	const [durationSeconds, setDurationSeconds] = useState(
		DEFAULT_DURATION_SECONDS,
	);
	const [type, setType] =
		useState<TimelineTransitionType>("cross-dissolve");
	const duration = mediaTimeFromSeconds({ seconds: durationSeconds });
	const plan = useMemo(
		() =>
			planTimelineTransition({
				tracks,
				selection: selectedElements,
				duration,
			}),
		[duration, selectedElements, tracks],
	);
	const selectedTransition =
		plan.available && plan.action === "edit" ? plan.transition : undefined;
	const transitionCount = useMemo(
		() =>
			[...tracks.overlay, tracks.main, ...tracks.audio].reduce(
				(count, track) =>
					count +
					track.elements.filter((element) => element.transitionIn).length,
				0,
			),
		[tracks],
	);

	useEffect(() => {
		if (!selectedTransition) return;
		setType(selectedTransition.type);
		setDurationSeconds(
			mediaTimeToSeconds({ time: selectedTransition.duration }),
		);
	}, [selectedTransition]);

	const maxDurationSeconds = plan.available
		? mediaTimeToSeconds({ time: plan.maxDuration })
		: DEFAULT_DURATION_SECONDS;
	const durationIsValid =
		plan.available &&
		durationSeconds > 0 &&
		durationSeconds < maxDurationSeconds;
	const applyTransition = () => {
		if (!plan.available || !durationIsValid) return;
		editor.command.execute({
			command: new SetTimelineTransitionCommand({
				from: plan.from,
				to: plan.to,
				type,
				duration: mediaTimeFromSeconds({ seconds: durationSeconds }),
				transitionId: plan.transition?.id ?? generateUUID(),
				overlayTrackId:
					plan.action === "edit" ? plan.to.trackId : generateUUID(),
			}),
		});
	};
	const removeTransition = () => {
		if (!selectedTransition) return;
		editor.command.execute({
			command: new RemoveTimelineTransitionCommand(selectedTransition.id),
		});
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="relative rounded-sm"
					aria-label={`打开转场管理器（${transitionCount}）`}
				>
					<HugeiconsIcon icon={Exchange01Icon} />
					{transitionCount > 0 ? (
						<span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-3 rounded-full px-0.5 text-[8px] leading-3">
							{transitionCount}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				className="flex w-80 flex-col gap-4 p-3"
			>
				<div>
					<p className="text-sm font-semibold">剪辑点转场</p>
					<p className="text-muted-foreground text-[11px]">
						选择两个相邻素材以添加转场，或选择已有转场进行替换或移除。
					</p>
				</div>

				<div className="grid grid-cols-2 gap-2" role="radiogroup">
					{(
						Object.entries(TRANSITION_LABELS) as Array<
							[TimelineTransitionType, string]
						>
					).map(([value, label]) => (
						<Button
							key={value}
							type="button"
							size="sm"
							variant={type === value ? "default" : "outline"}
							role="radio"
							aria-checked={type === value}
							onClick={() => setType(value)}
						>
							{label}
						</Button>
					))}
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between text-xs">
						<span>转场时长</span>
						<span className="font-mono">{durationSeconds.toFixed(2)} 秒</span>
					</div>
					<Slider
						aria-label="转场时长"
						min={0.1}
						max={Math.max(0.1, Math.min(3, maxDurationSeconds - 0.01))}
						step={0.05}
						value={[durationSeconds]}
						disabled={!plan.available}
						onValueChange={([value]) =>
							setDurationSeconds(Number(value.toFixed(2)))
						}
					/>
					<div className="grid grid-cols-2 gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={!plan.available}
							onClick={() =>
								setDurationSeconds((value) =>
									Math.max(0.1, Number((value - 0.05).toFixed(2))),
								)
							}
						>
							− 0.05 秒
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={!plan.available}
							onClick={() =>
								setDurationSeconds((value) =>
									Math.min(
										Math.max(0.1, maxDurationSeconds - 0.01),
										Number((value + 0.05).toFixed(2)),
									),
								)
							}
						>
							+ 0.05 秒
						</Button>
					</div>
				</div>

				<TransitionFeedback
					plan={plan}
					durationIsValid={durationIsValid}
					duration={duration}
				/>

				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						size="sm"
						disabled={!durationIsValid}
						onClick={applyTransition}
					>
						{selectedTransition ? "替换转场" : "添加转场"}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!selectedTransition}
						onClick={removeTransition}
					>
						移除
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function TransitionFeedback({
	plan,
	durationIsValid,
	duration,
}: {
	plan: TimelineTransitionPlan;
	durationIsValid: boolean;
	duration: MediaTime;
}) {
	if (!plan.available) {
		return (
			<p
				className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-2 text-xs"
				role="status"
			>
				{plan.reason}
			</p>
		);
	}
	if (!durationIsValid) {
		return (
			<p
				className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-2 text-xs"
				role="status"
			>
				转场时长超出了素材可用余量。
			</p>
		);
	}
	return (
		<p
			className="border-border bg-muted/30 rounded-md border p-2 text-xs"
			role="status"
		>
			{plan.action === "edit" ? "正在编辑" : "剪辑点有效"} ·{" "}
			{mediaTimeToSeconds({ time: duration }).toFixed(2)} 秒 ·{" "}
			{plan.from.elementId.slice(0, 8)} → {plan.to.elementId.slice(0, 8)}
		</p>
	);
}
