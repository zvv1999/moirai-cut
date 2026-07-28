"use client";

import { useRef, useState } from "react";
import type { MediaAsset } from "@/media/types";
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

type MediaBatchOperationsDialogProps = {
	open: boolean;
	assets: MediaAsset[];
	busy: boolean;
	progress: number;
	status: string | null;
	onOpenChange: (open: boolean) => void;
	onRename: (args: { prefix: string; startIndex: number }) => void;
	onReplace: (files: File[]) => void;
	onRelinkByName: (files: File[]) => void;
	onExport: () => void;
	onGenerateProxies: () => void;
	onToggleProxies: () => void;
	onRemoveProxies: () => void;
	onRemoveAssets: () => void;
};

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaBatchOperationsDialog({
	open,
	assets,
	busy,
	progress,
	status,
	onOpenChange,
	onRename,
	onReplace,
	onRelinkByName,
	onExport,
	onGenerateProxies,
	onToggleProxies,
	onRemoveProxies,
	onRemoveAssets,
}: MediaBatchOperationsDialogProps) {
	const [prefix, setPrefix] = useState("Clip");
	const [startIndex, setStartIndex] = useState(1);
	const [confirmRemove, setConfirmRemove] = useState(false);
	const replaceInputRef = useRef<HTMLInputElement>(null);
	const relinkInputRef = useRef<HTMLInputElement>(null);
	const proxyAssets = assets.filter((asset) => asset.proxy);
	const proxySize = proxyAssets.reduce(
		(total, asset) => total + (asset.proxy?.size ?? 0),
		0,
	);
	const allProxiesEnabled =
		proxyAssets.length > 0 &&
		proxyAssets.every((asset) => asset.proxy?.enabled);

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!busy) {
					setConfirmRemove(false);
					onOpenChange(nextOpen);
				}
			}}
		>
			<DialogContent
				className="max-h-[90vh] max-w-2xl overflow-hidden"
				aria-label="Batch media operations"
			>
				<DialogHeader>
					<DialogTitle>Batch media operations</DialogTitle>
					<DialogDescription>
						{assets.length} selected {assets.length === 1 ? "asset" : "assets"}.
						Renames, replacements, proxies, and removal stay undoable.
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="max-h-[65vh] gap-5 overflow-y-auto">
					<input
						ref={replaceInputRef}
						type="file"
						accept="image/*,video/*,audio/*"
						multiple
						className="hidden"
						aria-label="Choose replacement media in selection order"
						onChange={(event) => {
							const files = Array.from(event.currentTarget.files ?? []);
							event.currentTarget.value = "";
							if (files.length > 0) onReplace(files);
						}}
					/>
					<input
						ref={relinkInputRef}
						type="file"
						accept="image/*,video/*,audio/*"
						multiple
						className="hidden"
						aria-label="Choose media to relink by filename"
						onChange={(event) => {
							const files = Array.from(event.currentTarget.files ?? []);
							event.currentTarget.value = "";
							if (files.length > 0) onRelinkByName(files);
						}}
					/>

					{busy || status ? (
						<div
							className="rounded-lg border bg-muted/30 p-3"
							aria-live="polite"
						>
							<div className="mb-2 flex items-center justify-between gap-3 text-xs">
								<span className="truncate font-medium">
									{status ?? "Working…"}
								</span>
								<span className="tabular-nums">{Math.round(progress)}%</span>
							</div>
							<Progress value={progress} />
						</div>
					) : null}

					<section className="space-y-3" aria-labelledby="batch-rename-title">
						<div>
							<h3 id="batch-rename-title" className="text-sm font-semibold">
								Sequential rename
							</h3>
							<p className="text-muted-foreground text-xs">
								Preserves each file extension and timeline identity.
							</p>
						</div>
						<div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
							<div className="space-y-1.5">
								<Label htmlFor="batch-media-prefix">Prefix</Label>
								<Input
									id="batch-media-prefix"
									value={prefix}
									onChange={(event) => setPrefix(event.target.value)}
									disabled={busy}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="batch-media-start">Start</Label>
								<Input
									id="batch-media-start"
									type="number"
									min={0}
									value={startIndex}
									onChange={(event) =>
										setStartIndex(Math.max(0, Number(event.target.value)))
									}
									disabled={busy}
								/>
							</div>
							<Button
								variant="outline"
								disabled={busy || !prefix.trim()}
								onClick={() => onRename({ prefix, startIndex })}
							>
								Rename
							</Button>
						</div>
					</section>

					<section className="space-y-3" aria-labelledby="batch-source-title">
						<div>
							<h3 id="batch-source-title" className="text-sm font-semibold">
								Source files
							</h3>
							<p className="text-muted-foreground text-xs">
								Replacement keeps edits; export downloads untouched originals.
							</p>
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => replaceInputRef.current?.click()}
							>
								Replace by order…
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => relinkInputRef.current?.click()}
							>
								Relink by filename…
							</Button>
							<Button variant="outline" disabled={busy} onClick={onExport}>
								Export originals
							</Button>
						</div>
					</section>

					<section
						className="space-y-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4"
						aria-labelledby="proxy-workflow-title"
					>
						<div className="flex items-start justify-between gap-4">
							<div>
								<h3 id="proxy-workflow-title" className="text-sm font-semibold">
									Proxy workflow
								</h3>
								<p className="text-muted-foreground text-xs">
									960px lightweight preview media. Final export always reads the
									original.
								</p>
							</div>
							<div className="shrink-0 rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-600 dark:text-sky-300">
								{proxyAssets.length}/{assets.length} ready
								{proxySize > 0 ? ` · ${formatBytes(proxySize)}` : ""}
							</div>
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
							<Button
								disabled={busy || assets.every((asset) => asset.type === "audio")}
								onClick={onGenerateProxies}
							>
								{proxyAssets.length > 0 ? "Generate / refresh" : "Generate proxies"}
							</Button>
							<Button
								variant="outline"
								disabled={busy || proxyAssets.length === 0}
								onClick={onToggleProxies}
							>
								{allProxiesEnabled ? "Disable proxies" : "Enable proxies"}
							</Button>
							<Button
								variant="outline"
								disabled={busy || proxyAssets.length === 0}
								onClick={onRemoveProxies}
							>
								Remove proxies
							</Button>
						</div>
					</section>

					<div className="max-h-32 overflow-y-auto rounded-lg border">
						{assets.map((asset) => (
							<div
								key={asset.id}
								className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs last:border-b-0"
							>
								<span className="min-w-0 truncate font-medium">{asset.name}</span>
								<span className="text-muted-foreground shrink-0">
									{asset.proxy
										? `${asset.proxy.enabled ? "Proxy on" : "Proxy off"} · ${asset.proxy.width}×${asset.proxy.height}`
										: asset.type === "audio"
											? "Original audio"
											: "Original preview"}
								</span>
							</div>
						))}
					</div>
				</DialogBody>
				<DialogFooter className="items-center sm:justify-between">
					{confirmRemove ? (
						<div className="flex w-full items-center justify-between gap-3">
							<p className="text-xs text-red-500">
								Remove source media and every timeline use?
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
										setConfirmRemove(false);
										onRemoveAssets();
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
								disabled={busy}
								onClick={() => setConfirmRemove(true)}
							>
								Remove selected…
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => onOpenChange(false)}
							>
								Done
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
