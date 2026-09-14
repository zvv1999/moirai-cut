"use client";
import { useState } from "react";
import { libraryHeaders } from "./library-session";
import {
	FolderOpen,
	HardDrive,
	Loader2,
	Server,
	Settings2,
	Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { StorageLocation } from "./types";

async function request(path: string, body?: unknown) {
	const response = await fetch(`/api/footage/storage-location${path}`, {
		method: "POST",
		headers: {
			...libraryHeaders(),
			"x-requested-with": "moirai-footage",
			"content-type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const value = await response.json();
	if (!response.ok)
		throw new Error(
			value.error === "revision_conflict"
				? "存储配置已更新，请关闭后重新设置"
				: (value.error ?? "操作失败"),
		);
	return value;
}

export function StorageSettings({
	location,
	disabled,
}: {
	location?: StorageLocation;
	disabled: boolean;
	onRefresh: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<"nas" | "folder">("nas");
	const [nas, setNas] = useState("");
	const [folder, setFolder] = useState("");
	const [revision, setRevision] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [checked, setChecked] = useState(false);
	const path = mode === "nas" ? nas : folder;
	const setPath = (value: string) => {
		if (mode === "nas") setNas(value);
		else setFolder(value);
		setChecked(false);
		setError("");
	};
	const begin = () => {
		setMode(location?.mode ?? "nas");
		setNas(location?.nasRoot ?? "");
		setFolder(location?.folderRoot ?? "");
		setRevision(location?.revision ?? 0);
		setError("");
		setChecked(false);
		setOpen(true);
	};
	const perform = async (action: "pick" | "check" | "save") => {
		setBusy(true);
		setError("");
		try {
			if (action === "pick") {
				const result = await request("/pick");
				if (result.path) setPath(result.path);
			} else if (action === "check") {
				setChecked(false);
				await request("/check", { mode, path });
				setChecked(true);
			} else {
				const value = await request("", { mode, path, baseRevision: revision });
				sessionStorage.setItem(
					"footage-library-open-result",
					JSON.stringify(value),
				);
				const url = new URL(window.location.href);
				for (const key of ["q", "status", "role", "shot"]) {
					url.searchParams.delete(key);
				}
				window.history.replaceState(window.history.state, "", url);
				window.location.reload();
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "操作失败");
		} finally {
			setBusy(false);
		}
	};
	return (
		<>
			<Button
				variant="outline"
				disabled={disabled}
				onClick={begin}
				title="打开 NAS 或本机素材库"
			>
				<Settings2 />
				存储设置
			</Button>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					if (!busy) setOpen(value);
				}}
			>
				<DialogContent
					className="footage-storage-dialog"
					aria-describedby={undefined}
					onDragEnter={(e) => e.stopPropagation()}
					onDragOver={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onDrop={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
				>
					<DialogHeader>
						<DialogTitle style={{ letterSpacing: 0 }}>打开素材库</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<p className="footage-subtle">
							空目录将新建素材库，已有素材库将直接加载；普通视频目录将新建库并导入其中的视频。
						</p>
						<div
							className="footage-storage-modes"
							role="radiogroup"
							aria-label="存储位置"
						>
							{(
								[
									{ value: "nas", label: "NAS", Icon: Server },
									{ value: "folder", label: "本机文件夹", Icon: HardDrive },
								] as const
							).map(({ value, label, Icon }) => (
								<label
									key={value}
									className={mode === value ? "is-selected" : ""}
								>
									<input
										type="radio"
										name="storage-mode"
										value={value}
										checked={mode === value}
										disabled={busy}
										onChange={() => {
											setMode(value);
											setError("");
											setChecked(false);
										}}
									/>
									<Icon size={16} />
									{label}
								</label>
							))}
						</div>
						<label htmlFor="storage-path" className="footage-product-label">
							{mode === "nas" ? "NAS 挂载路径" : "本机文件夹路径"}
							<div className="footage-storage-path">
								<Input
									id="storage-path"
									value={path}
									disabled={busy}
									onChange={(e) => setPath(e.target.value)}
									placeholder={
										mode === "nas"
											? "/Volumes/共享目录/素材库"
											: "/Users/用户名/Movies/素材库"
									}
								/>
								<Button
									variant="outline"
									size="icon"
									title="选择文件夹"
									aria-label="选择文件夹"
									disabled={busy}
									onClick={() => void perform("pick")}
								>
									<FolderOpen />
								</Button>
							</div>
						</label>
						<div className="footage-storage-check">
							<Button
								variant="outline"
								disabled={busy || !path.trim()}
								onClick={() => void perform("check")}
							>
								{checked ? <Check /> : <HardDrive />}检查连接
							</Button>
							{checked && <span className="footage-online">目录可读写</span>}
						</div>
						{busy && (
							<p role="status" className="footage-subtle">
								正在打开素材库，首次导入视频可能需要一些时间…
							</p>
						)}
						{error && (
							<p className="footage-error" role="alert">
								{error}
							</p>
						)}
					</DialogBody>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => setOpen(false)}
						>
							取消
						</Button>
						<Button
							disabled={busy || !path.trim()}
							onClick={() => void perform("save")}
						>
							{busy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
							打开素材库
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
