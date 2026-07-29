"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
	detectMediaDuplicates,
	type MediaDuplicateGroup,
} from "@/media/duplicates";
import type { MediaAsset } from "@/media/types";
import { cn } from "@/utils/ui";

const DUPLICATE_REASON_LABELS: Record<string, string> = {
	"Matching normalized filename": "标准化文件名相同",
	"Matching dimensions and similar file size": "画面尺寸相同且文件大小接近",
	"Matching dimensions and duration": "画面尺寸和时长相同",
	"Identical SHA-256 content": "SHA-256 内容完全相同",
	"Identical byte size": "字节大小完全相同",
};

export function MediaDuplicateReviewDialog({
	open,
	assets,
	usageCounts,
	onOpenChange,
	onRemove,
}: {
	open: boolean;
	assets: MediaAsset[];
	usageCounts: Record<string, number>;
	onOpenChange: (open: boolean) => void;
	onRemove: (assetIds: string[]) => void;
}) {
	const [groups, setGroups] = useState<MediaDuplicateGroup[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [progress, setProgress] = useState(0);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [confirmRemove, setConfirmRemove] = useState(false);
	const assetMap = useMemo(
		() => new Map(assets.map((asset) => [asset.id, asset])),
		[assets],
	);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		const scan = async () => {
			await Promise.resolve();
			if (cancelled) return;
			setIsScanning(true);
			setProgress(0);
			setGroups([]);
			setSelectedIds([]);
			setConfirmRemove(false);
			try {
				const nextGroups = await detectMediaDuplicates({
					assets,
					onProgress: (value) => {
						if (!cancelled) setProgress(value * 100);
					},
				});
				if (!cancelled) setGroups(nextGroups);
			} finally {
				if (!cancelled) {
					setProgress(100);
					setIsScanning(false);
				}
			}
		};
		void scan();
		return () => {
			cancelled = true;
		};
	}, [assets, open]);

	const toggleAsset = ({ assetId }: { assetId: string }) => {
		setSelectedIds((current) =>
			current.includes(assetId)
				? current.filter((id) => id !== assetId)
				: [...current, assetId],
		);
		setConfirmRemove(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!isScanning) onOpenChange(nextOpen);
			}}
		>
			<DialogContent
				className="max-h-[90vh] max-w-2xl overflow-hidden"
				aria-label="检查重复素材"
			>
				<DialogHeader>
					<DialogTitle>检查重复素材</DialogTitle>
					<DialogDescription>
						精确匹配使用 SHA-256；可能重复仅提示相似文件，不会自动隐藏或选择任何素材。
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="max-h-[65vh] gap-4 overflow-y-auto">
					{isScanning ? (
						<div className="space-y-2 rounded-lg border bg-muted/30 p-4">
							<div className="flex items-center justify-between text-xs">
								<span className="font-medium">正在扫描源素材…</span>
								<span className="tabular-nums">{Math.round(progress)}%</span>
							</div>
							<Progress value={progress} />
							<p className="text-muted-foreground text-xs">
								仅对大小相同的候选文件计算哈希，避免读取所有大型文件。
							</p>
						</div>
					) : groups.length === 0 ? (
						<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
							<p className="font-semibold">未发现重复素材</p>
							<p className="text-muted-foreground mt-1 text-xs">
								全部 {assets.length} 个源素材仍保持可见且未被修改。
							</p>
						</div>
					) : (
						groups.map((group, groupIndex) => (
							<section
								key={group.id}
								className="overflow-hidden rounded-xl border"
								aria-label={`${group.kind === "exact" ? "精确" : "可能"}重复组 ${groupIndex + 1}`}
							>
								<div className="flex items-start justify-between gap-4 border-b bg-muted/30 px-4 py-3">
									<div>
										<p className="text-sm font-semibold">
											{group.kind === "exact"
												? "精确重复"
												: "可能重复"}
										</p>
										<p className="text-muted-foreground text-[11px]">
											{group.reasons
												.map((reason) => DUPLICATE_REASON_LABELS[reason] ?? reason)
												.join(" · ")}
										</p>
									</div>
									<span
										className={cn(
											"rounded-full px-2 py-1 text-[10px] font-bold tracking-wide",
											group.kind === "exact"
												? "bg-red-500/10 text-red-500"
												: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
										)}
									>
										{group.kind === "exact" ? "精确" : "可能"}
									</span>
								</div>
								<div>
									{group.assetIds.map((assetId) => {
										const asset = assetMap.get(assetId);
										if (!asset) return null;
										const selected = selectedIds.includes(assetId);
										return (
											<label
												key={assetId}
												className={cn(
													"flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0",
													selected && "bg-red-500/5",
												)}
											>
												<Checkbox
													checked={selected}
													onCheckedChange={() => toggleAsset({ assetId })}
													aria-label={`选择移除 ${asset.name}`}
												/>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-medium">
														{asset.name}
													</span>
													<span className="text-muted-foreground block text-[11px]">
														{asset.file.size.toLocaleString()} 字节 · 时间线使用{" "}
														{usageCounts[asset.id] ?? 0} 次
													</span>
												</span>
												<span className="text-muted-foreground text-[10px]">
													{selected ? "移除" : "保留"}
												</span>
											</label>
										);
									})}
								</div>
							</section>
						))
					)}
				</DialogBody>
				<DialogFooter className="items-center sm:justify-between">
					{confirmRemove ? (
						<div className="flex w-full items-center justify-between gap-3">
							<p className="text-xs text-red-500">
								要移除选中的 {selectedIds.length} 个源素材及其时间线用法吗？
							</p>
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() => setConfirmRemove(false)}
								>
									取消
								</Button>
								<Button
									variant="destructive"
									onClick={() => {
										onRemove(selectedIds);
										onOpenChange(false);
									}}
								>
									确认移除
								</Button>
							</div>
						</div>
					) : (
						<>
							<Button
								variant="destructive"
								disabled={isScanning || selectedIds.length === 0}
								onClick={() => setConfirmRemove(true)}
							>
								移除所选素材{selectedIds.length > 0
									? ` (${selectedIds.length})`
									: ""}
							</Button>
							<Button
								variant="outline"
								disabled={isScanning}
								onClick={() => onOpenChange(false)}
							>
								全部保留并关闭
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
