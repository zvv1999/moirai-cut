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
	return (
		<div
			className="flex shrink-0 items-center gap-px"
			role="group"
			aria-label={`${label}关键帧`}
		>
			<Button
				type="button"
				variant="text"
				size="icon"
				className="text-muted-foreground size-5 rounded-sm hover:text-foreground"
				aria-label={`上一个${label}关键帧`}
				title={
					canGoPrevious
						? `跳转到上一个${label}关键帧`
						: `没有上一个${label}关键帧`
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
				className="text-muted-foreground size-5 rounded-sm hover:text-foreground"
				aria-label={`${isActive ? "删除" : "添加"}播放头处的${label}关键帧`}
				aria-pressed={isActive}
				title={
					isDisabled
						? "请将播放头移到素材范围内再添加关键帧"
						: `在播放头处切换${label}关键帧`
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
				className="text-muted-foreground size-5 rounded-sm hover:text-foreground"
				aria-label={`下一个${label}关键帧`}
				title={
					canGoNext ? `跳转到下一个${label}关键帧` : `没有下一个${label}关键帧`
				}
				disabled={!canGoNext}
				onClick={onNext}
			>
				<HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
			</Button>
			<span className="sr-only">{keyframeCount} 个关键帧</span>
		</div>
	);
}
