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
				aria-label="Review duplicate media"
			>
				<DialogHeader>
					<DialogTitle>Review duplicate media</DialogTitle>
					<DialogDescription>
						Exact matches use SHA-256. Probable matches only suggest similar
						files. Nothing is hidden or selected automatically.
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="max-h-[65vh] gap-4 overflow-y-auto">
					{isScanning ? (
						<div className="space-y-2 rounded-lg border bg-muted/30 p-4">
							<div className="flex items-center justify-between text-xs">
								<span className="font-medium">Scanning source media…</span>
								<span className="tabular-nums">{Math.round(progress)}%</span>
							</div>
							<Progress value={progress} />
							<p className="text-muted-foreground text-xs">
								Only equal-size candidates are hashed to avoid reading every large
								file.
							</p>
						</div>
					) : groups.length === 0 ? (
						<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
							<p className="font-semibold">No duplicates found</p>
							<p className="text-muted-foreground mt-1 text-xs">
								All {assets.length} source assets remain visible and unchanged.
							</p>
						</div>
					) : (
						groups.map((group, groupIndex) => (
							<section
								key={group.id}
								className="overflow-hidden rounded-xl border"
								aria-label={`${group.kind} duplicate group ${groupIndex + 1}`}
							>
								<div className="flex items-start justify-between gap-4 border-b bg-muted/30 px-4 py-3">
									<div>
										<p className="text-sm font-semibold">
											{group.kind === "exact"
												? "Exact duplicate"
												: "Probable duplicate"}
										</p>
										<p className="text-muted-foreground text-[11px]">
											{group.reasons.join(" · ")}
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
										{group.kind.toUpperCase()}
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
													aria-label={`Select ${asset.name} for removal`}
												/>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-medium">
														{asset.name}
													</span>
													<span className="text-muted-foreground block text-[11px]">
														{asset.file.size.toLocaleString()} bytes ·{" "}
														{usageCounts[asset.id] ?? 0} timeline{" "}
														{(usageCounts[asset.id] ?? 0) === 1 ? "use" : "uses"}
													</span>
												</span>
												<span className="text-muted-foreground text-[10px]">
													{selected ? "REMOVE" : "KEEP"}
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
								Remove {selectedIds.length} selected source{" "}
								{selectedIds.length === 1 ? "asset" : "assets"} and timeline
								uses?
							</p>
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() => setConfirmRemove(false)}
								>
									Cancel
								</Button>
								<Button
									variant="destructive"
									onClick={() => {
										onRemove(selectedIds);
										onOpenChange(false);
									}}
								>
									Confirm removal
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
								Remove selected{selectedIds.length > 0
									? ` (${selectedIds.length})`
									: ""}
							</Button>
							<Button
								variant="outline"
								disabled={isScanning}
								onClick={() => onOpenChange(false)}
							>
								Keep all &amp; close
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
