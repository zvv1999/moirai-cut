"use client";

import { useState } from "react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AdvancedExportPopover } from "@/components/editor/advanced-export-popover";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";

export function ExportButton() {
	const [open, setOpen] = useState(false);
	const hasProject = useEditor((editor) => !!editor.project.getActiveOrNull());

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="导出作品"
					className={cn(
						"flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-primary-foreground shadow-[0_8px_24px_rgba(50,210,230,0.16)] transition-all hover:-translate-y-px hover:brightness-110",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
					disabled={!hasProject}
				>
					<HugeiconsIcon icon={TransitionTopIcon} className="size-3.5" />
					<span className="text-xs font-semibold tracking-wide">导出</span>
				</button>
			</PopoverTrigger>
			{hasProject ? (
				<PopoverContent
					align="end"
					className="mr-4 w-auto border-0 bg-transparent p-0 shadow-none"
				>
					<AdvancedExportPopover onOpenChange={setOpen} />
				</PopoverContent>
			) : null}
		</Popover>
	);
}
