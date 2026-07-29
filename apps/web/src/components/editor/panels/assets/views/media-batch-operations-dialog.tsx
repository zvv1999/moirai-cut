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
	const [prefix, setPrefix] = useState("素材");
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
				aria-label="批量素材操作"
			>
				<DialogHeader>
					<DialogTitle>批量素材操作</DialogTitle>
					<DialogDescription>
						已选择 {assets.length} 个素材。重命名、替换、代理和移除操作均可撤销。
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="max-h-[65vh] gap-5 overflow-y-auto">
					<input
						ref={replaceInputRef}
						type="file"
						accept="image/*,video/*,audio/*"
						multiple
						className="hidden"
						aria-label="按选择顺序选取替换素材"
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
						aria-label="选择按文件名重新链接的素材"
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
									{status ?? "处理中…"}
								</span>
								<span className="tabular-nums">{Math.round(progress)}%</span>
							</div>
							<Progress value={progress} />
						</div>
					) : null}

					<section className="space-y-3" aria-labelledby="batch-rename-title">
						<div>
							<h3 id="batch-rename-title" className="text-sm font-semibold">
								连续重命名
							</h3>
							<p className="text-muted-foreground text-xs">
								保留每个文件的扩展名和时间线标识。
							</p>
						</div>
						<div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
							<div className="space-y-1.5">
								<Label htmlFor="batch-media-prefix">前缀</Label>
								<Input
									id="batch-media-prefix"
									value={prefix}
									onChange={(event) => setPrefix(event.target.value)}
									disabled={busy}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="batch-media-start">起始序号</Label>
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
								重命名
							</Button>
						</div>
					</section>

					<section className="space-y-3" aria-labelledby="batch-source-title">
						<div>
							<h3 id="batch-source-title" className="text-sm font-semibold">
								源文件
							</h3>
							<p className="text-muted-foreground text-xs">
								替换会保留编辑，导出会下载未经修改的原始文件。
							</p>
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => replaceInputRef.current?.click()}
							>
								按顺序替换…
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => relinkInputRef.current?.click()}
							>
								按文件名重新链接…
							</Button>
							<Button variant="outline" disabled={busy} onClick={onExport}>
								导出原始文件
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
									代理工作流
								</h3>
								<p className="text-muted-foreground text-xs">
									使用 960 像素轻量代理预览，最终导出始终读取原始素材。
								</p>
							</div>
							<div className="shrink-0 rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-600 dark:text-sky-300">
								{proxyAssets.length}/{assets.length} 已就绪
								{proxySize > 0 ? ` · ${formatBytes(proxySize)}` : ""}
							</div>
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
							<Button
								disabled={busy || assets.every((asset) => asset.type === "audio")}
								onClick={onGenerateProxies}
							>
								{proxyAssets.length > 0 ? "生成 / 刷新" : "生成代理"}
							</Button>
							<Button
								variant="outline"
								disabled={busy || proxyAssets.length === 0}
								onClick={onToggleProxies}
							>
								{allProxiesEnabled ? "停用代理" : "启用代理"}
							</Button>
							<Button
								variant="outline"
								disabled={busy || proxyAssets.length === 0}
								onClick={onRemoveProxies}
							>
								移除代理
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
										? `${asset.proxy.enabled ? "代理已启用" : "代理已停用"} · ${asset.proxy.width}×${asset.proxy.height}`
										: asset.type === "audio"
											? "原始音频"
											: "原始预览"}
								</span>
							</div>
						))}
					</div>
				</DialogBody>
				<DialogFooter className="items-center sm:justify-between">
					{confirmRemove ? (
						<div className="flex w-full items-center justify-between gap-3">
							<p className="text-xs text-red-500">
								要移除源素材及其在时间线中的所有用法吗？
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
										setConfirmRemove(false);
										onRemoveAssets();
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
								disabled={busy}
								onClick={() => setConfirmRemove(true)}
							>
								移除所选素材…
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => onOpenChange(false)}
							>
								完成
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
