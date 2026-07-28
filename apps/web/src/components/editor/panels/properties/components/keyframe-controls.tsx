import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	KeyframeIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

export function KeyframeControls({
	label,
	isActive,
	isDisabled = false,
	keyframeCount,
	canGoPrevious,
	canGoNext,
	onPrevious,
	onToggle,
	onNext,
}: {
	label: string;
	isActive: boolean;
	isDisabled?: boolean;
	keyframeCount: number;
	canGoPrevious: boolean;
	canGoNext: boolean;
	onPrevious: () => void;
	onToggle: () => void;
	onNext: () => void;
}) {
	const normalizedLabel = label.toLocaleLowerCase();

	return (
		<div
			className="flex shrink-0 items-center"
			role="group"
			aria-label={`${label} keyframes`}
		>
			<Button
				type="button"
				variant="text"
				size="icon"
				className="size-5"
				aria-label={`Previous ${normalizedLabel} keyframe`}
				title={
					canGoPrevious
						? `Go to previous ${normalizedLabel} keyframe`
						: `No previous ${normalizedLabel} keyframe`
				}
				disabled={!canGoPrevious}
				onClick={onPrevious}
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} className="size-3" />
			</Button>
			<Button
				type="button"
				variant="text"
				size="icon"
				className="size-5"
				aria-label={`${isActive ? "Delete" : "Add"} ${normalizedLabel} keyframe at playhead`}
				aria-pressed={isActive}
				title={
					isDisabled
						? "Move the playhead inside the clip to add a keyframe"
						: `Toggle ${normalizedLabel} keyframe`
				}
				disabled={isDisabled}
				onClick={onToggle}
			>
				<HugeiconsIcon
					icon={KeyframeIcon}
					className={cn("size-3.5", isActive && "fill-primary text-primary")}
				/>
			</Button>
			<Button
				type="button"
				variant="text"
				size="icon"
				className="size-5"
				aria-label={`Next ${normalizedLabel} keyframe`}
				title={
					canGoNext
						? `Go to next ${normalizedLabel} keyframe`
						: `No next ${normalizedLabel} keyframe`
				}
				disabled={!canGoNext}
				onClick={onNext}
			>
				<HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
			</Button>
			<span className="sr-only">
				{keyframeCount} {keyframeCount === 1 ? "keyframe" : "keyframes"}
			</span>
		</div>
	);
}
