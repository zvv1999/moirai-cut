"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	getMediaBinAssetCount,
	getMediaBinTree,
	type MediaBin,
	type MediaBinSelection,
	type MediaOrganization,
} from "@/media/organization";
import { cn } from "@/utils/ui";
import {
	Add01Icon,
	Folder03Icon,
	MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type EditingState =
	| { mode: "create"; parentId: string | null }
	| { mode: "rename"; binId: string; value: string }
	| null;

export function MediaBinBrowserView({
	bins,
	assetBinIds,
	assetIds,
	activeBinId,
	onSelect,
	onCreate,
	onRename,
	onMove,
	onDelete,
}: {
	bins: MediaBin[];
	assetBinIds: Record<string, string>;
	assetIds: string[];
	activeBinId: MediaBinSelection;
	onSelect: (binId: MediaBinSelection) => void;
	onCreate: (args: { name: string; parentId: string | null }) => void;
	onRename: (args: { binId: string; name: string }) => void;
	onMove: (args: {
		binId: string;
		parentId: string | null;
		index: number;
	}) => void;
	onDelete: (args: { binId: string }) => void;
}) {
	const [editing, setEditing] = useState<EditingState>(null);
	const organization = useMemo<MediaOrganization>(
		() => ({ bins, assetBinIds }),
		[assetBinIds, bins],
	);
	const tree = useMemo(() => getMediaBinTree({ organization }), [organization]);

	return (
		<section className="border-border/70 border-b pb-2" aria-label="素材文件夹">
			<div className="mb-1 flex items-center justify-between px-0.5">
				<p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.12em]">
					素材库
				</p>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-6"
					aria-label="新建素材文件夹"
					title="新建素材文件夹"
					onClick={() => setEditing({ mode: "create", parentId: null })}
				>
					<HugeiconsIcon icon={Add01Icon} className="size-3.5" />
				</Button>
			</div>
			<div className="space-y-0.5" role="tree">
				<BinNavigationRow
					label="全部素材"
					count={assetIds.length}
					active={activeBinId === "all"}
					ariaLabel="查看全部素材"
					onClick={() => onSelect("all")}
				/>
				<BinNavigationRow
					label="未分类"
					count={getMediaBinAssetCount({
						organization,
						assetIds,
						binId: "unfiled",
					})}
					active={activeBinId === "unfiled"}
					ariaLabel="查看未分类素材"
					onClick={() => onSelect("unfiled")}
				/>
				{editing?.mode === "create" && editing.parentId === null ? (
					<BinNameEditor
						depth={0}
						initialValue="新建文件夹"
						ariaLabel="命名新的素材文件夹"
						onCancel={() => setEditing(null)}
						onCommit={({ name }) => {
							onCreate({ name, parentId: null });
							setEditing(null);
						}}
					/>
				) : null}
				{tree.map(({ bin, depth }) => (
					<div key={bin.id}>
						{editing?.mode === "rename" && editing.binId === bin.id ? (
							<BinNameEditor
								depth={depth}
								initialValue={editing.value}
								ariaLabel={`重命名素材文件夹 ${bin.name}`}
								onCancel={() => setEditing(null)}
								onCommit={({ name }) => {
									onRename({ binId: bin.id, name });
									setEditing(null);
								}}
							/>
						) : (
							<MediaBinRow
								bin={bin}
								bins={bins}
								depth={depth}
								count={getMediaBinAssetCount({
									organization,
									assetIds,
									binId: bin.id,
								})}
								active={activeBinId === bin.id}
								onSelect={() => onSelect(bin.id)}
								onCreateChild={() =>
									setEditing({ mode: "create", parentId: bin.id })
								}
								onRename={() =>
									setEditing({
										mode: "rename",
										binId: bin.id,
										value: bin.name,
									})
								}
								onMove={onMove}
								onDelete={() => onDelete({ binId: bin.id })}
							/>
						)}
						{editing?.mode === "create" && editing.parentId === bin.id ? (
							<BinNameEditor
								depth={depth + 1}
								initialValue="新建文件夹"
								ariaLabel={`在 ${bin.name} 内命名新的素材文件夹`}
								onCancel={() => setEditing(null)}
								onCommit={({ name }) => {
									onCreate({ name, parentId: bin.id });
									setEditing(null);
								}}
							/>
						) : null}
					</div>
				))}
			</div>
		</section>
	);
}

function BinNavigationRow({
	label,
	count,
	active,
	ariaLabel,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	ariaLabel: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="treeitem"
			aria-level={1}
			aria-label={ariaLabel}
			aria-current={active ? "page" : undefined}
			className={cn(
				"text-muted-foreground hover:bg-muted/70 flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-xs",
				active && "bg-primary/10 text-primary",
			)}
			onClick={onClick}
		>
			<HugeiconsIcon icon={Folder03Icon} className="size-3.5 shrink-0" />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<span className="text-[10px] tabular-nums opacity-70">{count}</span>
		</button>
	);
}

function MediaBinRow({
	bin,
	bins,
	depth,
	count,
	active,
	onSelect,
	onCreateChild,
	onRename,
	onMove,
	onDelete,
}: {
	bin: MediaBin;
	bins: MediaBin[];
	depth: number;
	count: number;
	active: boolean;
	onSelect: () => void;
	onCreateChild: () => void;
	onRename: () => void;
	onMove: (args: {
		binId: string;
		parentId: string | null;
		index: number;
	}) => void;
	onDelete: () => void;
}) {
	const siblings = bins
		.filter((candidate) => candidate.parentId === bin.parentId)
		.sort((a, b) => a.order - b.order);
	const siblingIndex = siblings.findIndex(
		(candidate) => candidate.id === bin.id,
	);
	const invalidParentIds = getInvalidParentIds({ bins, binId: bin.id });
	const parentCandidates = bins.filter(
		(candidate) => !invalidParentIds.has(candidate.id),
	);

	return (
		<div
			className={cn(
				"group/bin hover:bg-muted/70 flex h-7 items-center rounded",
				active && "bg-primary/10 text-primary",
			)}
			style={{ paddingLeft: `${depth * 12 + 6}px` }}
		>
			<button
				type="button"
				role="treeitem"
				aria-level={depth + 1}
				aria-label={`查看素材文件夹 ${bin.name}`}
				aria-current={active ? "page" : undefined}
				className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs"
				onClick={onSelect}
			>
				<HugeiconsIcon icon={Folder03Icon} className="size-3.5 shrink-0" />
				<span className="min-w-0 flex-1 truncate">{bin.name}</span>
				<span className="text-[10px] tabular-nums opacity-70">{count}</span>
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-6 shrink-0 opacity-70 hover:opacity-100"
						aria-label={`管理素材文件夹 ${bin.name}`}
						title={`管理素材文件夹 ${bin.name}`}
					>
						<HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuLabel>{bin.name}</DropdownMenuLabel>
					<DropdownMenuItem onSelect={onCreateChild}>
						新建子文件夹
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={onRename}>重命名</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={siblingIndex <= 0}
						onSelect={() =>
							onMove({
								binId: bin.id,
								parentId: bin.parentId,
								index: siblingIndex - 1,
							})
						}
					>
						上移
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={siblingIndex === siblings.length - 1}
						onSelect={() =>
							onMove({
								binId: bin.id,
								parentId: bin.parentId,
								index: siblingIndex + 1,
							})
						}
					>
						下移
					</DropdownMenuItem>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>移动到</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								disabled={bin.parentId === null}
								onSelect={() =>
									onMove({
										binId: bin.id,
										parentId: null,
										index: Number.MAX_SAFE_INTEGER,
									})
								}
							>
								根目录
							</DropdownMenuItem>
							{parentCandidates.map((candidate) => (
								<DropdownMenuItem
									key={candidate.id}
									disabled={bin.parentId === candidate.id}
									onSelect={() =>
										onMove({
											binId: bin.id,
											parentId: candidate.id,
											index: Number.MAX_SAFE_INTEGER,
										})
									}
								>
									{candidate.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onSelect={onDelete}>
						删除文件夹 · 保留素材
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function BinNameEditor({
	depth,
	initialValue,
	ariaLabel,
	onCommit,
	onCancel,
}: {
	depth: number;
	initialValue: string;
	ariaLabel: string;
	onCommit: (args: { name: string }) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState(initialValue);
	const commit = () => onCommit({ name: value });

	return (
		<div
			className="flex h-7 items-center gap-1"
			style={{ paddingLeft: `${depth * 12 + 6}px` }}
		>
			<HugeiconsIcon
				icon={Folder03Icon}
				className="text-muted-foreground size-3.5 shrink-0"
			/>
			<input
				autoFocus
				aria-label={ariaLabel}
				className="border-primary/40 bg-background h-6 min-w-0 flex-1 rounded border px-1.5 text-xs outline-none"
				value={value}
				onFocus={(event) => event.currentTarget.select()}
				onChange={(event) => setValue(event.currentTarget.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						commit();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				}}
			/>
		</div>
	);
}

function getInvalidParentIds({
	bins,
	binId,
}: {
	bins: MediaBin[];
	binId: string;
}): Set<string> {
	const invalid = new Set([binId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const bin of bins) {
			if (
				bin.parentId !== null &&
				invalid.has(bin.parentId) &&
				!invalid.has(bin.id)
			) {
				invalid.add(bin.id);
				changed = true;
			}
		}
	}
	return invalid;
}
