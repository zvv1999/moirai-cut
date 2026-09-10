"use client";

import { useState } from "react";
import { Database, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import type { MediaAsset } from "@/media/types";
import type { Shot } from "./types";

export function EditorFootageLibrary() {
	const editor = useEditor();
	const [open, setOpen] = useState(false);
	const [releases, setReleases] = useState<
		Array<{ id: string; current: boolean; shot: Shot }>
	>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const show = async () => {
		setOpen(true);
		setBusy(true);
		setError("");
		try {
			const response = await fetch("/api/footage/releases");
			const value = await response.json();
			if (!response.ok) throw new Error(value.error);
			setReleases(value.releases);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	const importRelease = async (id: string) => {
		const projectId = editor.project.getActiveOrNull()?.metadata.id;
		if (!projectId) return;
		setBusy(true);
		setError("");
		try {
			if (editor.media.getAssets().some((a) => a.footage?.releaseId === id)) {
				toast.info("此版本已在工程中");
				return;
			}
			const response = await fetch(`/api/footage/releases/${id}`);
			const value = await response.json();
			if (!response.ok) throw new Error(value.error);
			const { mediaUrl, ...metadata } = value as Omit<
				MediaAsset,
				"id" | "file"
			> & { mediaUrl: string };
			const media = await fetch(mediaUrl);
			if (!media.ok) throw new Error("读取入库视频失败");
			const bytes = await media.arrayBuffer();
			const hash = Array.from(
				new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
				(n) => n.toString(16).padStart(2, "0"),
			).join("");
			if (hash !== metadata.footage?.outputSha256)
				throw new Error("视频与发布版本不一致");
			if (editor.project.getActiveOrNull()?.metadata.id !== projectId)
				throw new Error("工程已切换，请重新导入");
			const file = new File([bytes], metadata.name, { type: "video/mp4" });
			const url = URL.createObjectURL(file);
			const asset = await editor.media.addMediaAsset({
				projectId,
				asset: { ...metadata, file, url },
			});
			if (!asset) {
				URL.revokeObjectURL(url);
				throw new Error("工程素材保存失败");
			}
			toast.success("已关联到工程素材库");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				title="产品素材库"
				aria-label="产品素材库"
				onClick={() => void show()}
			>
				<Database />
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[80vh] overflow-y-auto p-6">
					<DialogHeader>
						<DialogTitle>产品素材库</DialogTitle>
					</DialogHeader>
					<a
						href="/footage"
						target="_blank"
						rel="noreferrer"
						className="flex items-center gap-2 text-sm"
					>
						<ExternalLink size={14} />
						查看与审核
					</a>
					<input
						aria-label="搜索入库分镜"
						placeholder="搜索名称、描述、标签"
						className="w-full rounded border p-2"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					{error && (
						<p role="alert" className="text-sm text-red-600">
							{error}
						</p>
					)}
					{busy && (
						<p role="status" className="text-sm">
							正在读取...
						</p>
					)}
					{!busy && !releases.some((r) => r.current) && (
						<p className="text-sm text-muted-foreground">暂无已入库分镜</p>
					)}
					{releases
						.filter(
							(r) =>
								r.current &&
								`${r.shot.name} ${r.shot.description} ${r.shot.tags.join(" ")}`.includes(
									query,
								),
						)
						.map((r) => (
							<div key={r.id} className="flex items-center gap-3 border-b py-3">
								<div className="min-w-0 flex-1">
									<p className="break-words text-sm font-medium">
										{r.shot.name} · v{r.shot.revision}
									</p>
									<p className="break-words text-xs text-muted-foreground">
										{r.shot.description}
									</p>
								</div>
								<Button
									size="icon"
									variant="outline"
									disabled={busy}
									title="关联到工程"
									aria-label={`关联 ${r.shot.name}`}
									onClick={() => void importRelease(r.id)}
								>
									<Plus />
								</Button>
							</div>
						))}
				</DialogContent>
			</Dialog>
		</>
	);
}
