import { HugeiconsIcon } from "@hugeicons/react";
import { Settings05Icon } from "@hugeicons/core-free-icons";

export function EmptyView() {
	return (
		<div className="bg-background flex h-full flex-col items-center justify-center gap-4 p-6">
			<HugeiconsIcon
				icon={Settings05Icon}
				className="text-primary/55 size-10"
				strokeWidth={1}
			/>
			<div className="flex flex-col gap-2 text-center">
				<p className="text-sm font-semibold tracking-wide">
					请选择时间线中的素材
				</p>
				<p className="text-muted-foreground max-w-64 text-xs leading-5 text-balance">
					选中视频、图片、文字或音频后，可在这里调整参数
				</p>
			</div>
		</div>
	);
}
