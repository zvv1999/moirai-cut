"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	MEDIA_COLOR_LABELS,
	type MediaColorLabel,
} from "@/media/organization";
import { cn } from "@/utils/ui";

const COLOR_CLASSES: Record<MediaColorLabel, string> = {
	red: "bg-red-500",
	orange: "bg-orange-500",
	yellow: "bg-yellow-400",
	green: "bg-emerald-500",
	blue: "bg-blue-500",
	purple: "bg-violet-500",
};

const COLOR_LABELS: Record<MediaColorLabel, string> = {
	red: "红色",
	orange: "橙色",
	yellow: "黄色",
	green: "绿色",
	blue: "蓝色",
	purple: "紫色",
};

type FavoriteChoice = "keep" | "favorite" | "not-favorite";
type ColorChoice = "keep" | "none" | MediaColorLabel;

export function MediaMetadataEditorDialog({
	open,
	assetCount,
	onOpenChange,
	onApply,
}: {
	open: boolean;
	assetCount: number;
	onOpenChange: (open: boolean) => void;
	onApply: (args: {
		addTags: string[];
		removeTags: string[];
		favorite?: boolean;
		colorLabel?: MediaColorLabel | null;
	}) => void;
}) {
	const [addTags, setAddTags] = useState("");
	const [removeTags, setRemoveTags] = useState("");
	const [favorite, setFavorite] = useState<FavoriteChoice>("keep");
	const [color, setColor] = useState<ColorChoice>("keep");

	useEffect(() => {
		if (!open) return;
		setAddTags("");
		setRemoveTags("");
		setFavorite("keep");
		setColor("keep");
	}, [open]);

	const apply = () => {
		onApply({
			addTags: splitTags({ value: addTags }),
			removeTags: splitTags({ value: removeTags }),
			...(favorite !== "keep" && {
				favorite: favorite === "favorite",
			}),
			...(color !== "keep" && {
				colorLabel: color === "none" ? null : color,
			}),
		});
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md" aria-label="编辑素材信息">
				<DialogHeader>
					<DialogTitle>编辑素材信息 · {assetCount} 个素材</DialogTitle>
					<DialogDescription>
						应用共享整理信息，不会修改源文件或时间线编辑。
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="gap-5">
					<div className="grid gap-2">
						<label
							htmlFor="media-add-tags"
							className="text-xs font-semibold"
						>
							添加标签
						</label>
						<Input
							id="media-add-tags"
							aria-label="添加素材标签"
							placeholder="访谈、精选、夜景"
							value={addTags}
							onChange={(event) => setAddTags(event.currentTarget.value)}
						/>
						<p className="text-muted-foreground text-[11px]">
							多个标签请用逗号分隔。
						</p>
					</div>
					<div className="grid gap-2">
						<label
							htmlFor="media-remove-tags"
							className="text-xs font-semibold"
						>
							移除标签
						</label>
						<Input
							id="media-remove-tags"
							aria-label="移除素材标签"
							placeholder="粗剪、弃用"
							value={removeTags}
							onChange={(event) => setRemoveTags(event.currentTarget.value)}
						/>
					</div>
					<fieldset className="grid gap-2">
						<legend className="text-xs font-semibold">收藏</legend>
						<div className="grid grid-cols-3 gap-1.5">
							{(
								[
									["keep", "保持不变"],
									["favorite", "收藏"],
									["not-favorite", "取消收藏"],
								] as const
							).map(([value, label]) => (
								<Button
									key={value}
									type="button"
									size="sm"
									variant={favorite === value ? "secondary" : "outline"}
									aria-pressed={favorite === value}
									onClick={() => setFavorite(value)}
								>
									{label}
								</Button>
							))}
						</div>
					</fieldset>
					<fieldset className="grid gap-2">
						<legend className="text-xs font-semibold">颜色标签</legend>
						<div className="flex flex-wrap gap-1.5">
							<Button
								type="button"
								size="sm"
								variant={color === "keep" ? "secondary" : "outline"}
								aria-pressed={color === "keep"}
								onClick={() => setColor("keep")}
							>
								保持不变
							</Button>
							<Button
								type="button"
								size="sm"
								variant={color === "none" ? "secondary" : "outline"}
								aria-pressed={color === "none"}
								onClick={() => setColor("none")}
							>
								无
							</Button>
							{MEDIA_COLOR_LABELS.map((label) => (
								<button
									key={label}
									type="button"
									aria-label={`${COLOR_LABELS[label]}颜色标签`}
									aria-pressed={color === label}
									title={`${COLOR_LABELS[label]}颜色标签`}
									className={cn(
										"size-8 rounded-full border-2 border-transparent p-1 transition-transform hover:scale-105",
										color === label && "border-primary",
									)}
									onClick={() => setColor(label)}
								>
									<span
										className={cn(
											"block size-full rounded-full",
											COLOR_CLASSES[label],
										)}
									/>
								</button>
							))}
						</div>
					</fieldset>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						取消
					</Button>
					<Button type="button" onClick={apply}>
						应用
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function splitTags({ value }: { value: string }): string[] {
	return value
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean);
}
