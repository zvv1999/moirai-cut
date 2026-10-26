"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { backgroundJobs } from "@/project/background-jobs";
import {
	PROJECT_EXPORT_TARGETS,
	type ProjectExportResult,
	type ProjectExportTarget,
} from "@/export/project-interchange";
import { exportInterchangeProject } from "@/export/render-project-interchange";
import type { TProject } from "@/project/types";

export function ProjectBundlePanel({ disabled }: { disabled: boolean }) {
	const editor = useEditor();
	const [target, setTarget] = useState<ProjectExportTarget>("jianying");
	const [result, setResult] = useState<ProjectExportResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [running, setRunning] = useState(false);
	const [installing, setInstalling] = useState(false);
	const [saved, setSaved] = useState<ProjectExportResult[]>([]);
	const projectId = editor.project.getActive().metadata.id;
	useEffect(() => {
		const controller = new AbortController();
		void fetch(`/api/project-interchange/${encodeURIComponent(projectId)}`, {
			signal: controller.signal,
		})
			.then(async (response) => {
				if (response.ok) {
					const payload = await response.json();
					setSaved(payload.data ?? []);
				}
			})
			.catch(() => {});
		return () => controller.abort();
	}, [projectId]);
	const install = async () => {
		if (!result) return;
		setInstalling(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/project-interchange/${encodeURIComponent(projectId)}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ action: "install", id: result.id }),
				},
			);
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error);
			toast.success("已添加到草稿库，请重新打开剪映／CapCut", {
				description: payload.data.folder,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setInstalling(false);
		}
	};
	const run = async () => {
		if (
			backgroundJobs
				.list()
				.some((j) => j.kind === "export" && j.status === "running")
		)
			return;
		setError(null);
		setResult(null);
		setRunning(true);
		// Capture live scenes, including unsaved edits, without writing over disk or changing the timeline.
		const project: TProject = JSON.parse(
			JSON.stringify(
				{
					...editor.project.getActive(),
					currentSceneId: editor.scenes.getActiveScene().id,
					scenes: editor.scenes.getScenes(),
				},
				(key, value) => (key === "buffer" ? undefined : value),
			),
		);
		const assets = [...editor.media.getAssets()];
		const handle = backgroundJobs.start({
			kind: "export",
			label: PROJECT_EXPORT_TARGETS[target],
			run: async ({ signal, update }) => {
				try {
					const output = await exportInterchangeProject({
						project,
						mediaAssets: assets,
						target,
						signal,
						update,
					});
					setResult(output);
					setSaved((previous) => [output, ...previous]);
					toast.success("剪辑工程已导出", { description: output.folder });
				} catch (err) {
					if (!signal.aborted)
						setError(err instanceof Error ? err.message : String(err));
					throw err;
				}
			},
		});
		await handle.done;
		setRunning(false);
	};
	return (
		<div className="space-y-4 text-xs">
			<div>
				<div className="font-semibold">继续在其他剪辑软件中编辑</div>
				<p className="text-muted-foreground mt-1 leading-relaxed">
					导出当前场景及原素材。剪切点、多轨、位置、缩放和声音保留为剪辑片段；无法直接转换的特效会渲染成独立素材，完成后列出转换报告。
				</p>
			</div>
			<label className="block space-y-2">
				<span>目标软件</span>
				<select
					className="border-border bg-background w-full rounded-md border p-2"
					value={target}
					onChange={(e) => setTarget(e.target.value as ProjectExportTarget)}
					disabled={running || disabled}
				>
					{Object.entries(PROJECT_EXPORT_TARGETS).map(([key, label]) => (
						<option key={key} value={key}>
							{label}
						</option>
					))}
				</select>
			</label>
			<div className="bg-muted/40 rounded-lg p-3 leading-relaxed">
				{target === "premiere"
					? "输出 timeline.xml，供 Premiere Pro／DaVinci Resolve 导入。文字外观作为透明素材保留，同时附带可编辑 SRT 字幕。"
					: target === "fcpxml"
						? "输出 timeline.fcpxml。基础文字可继续编辑；字体与换行请在 Final Cut Pro 中核对。"
						: "输出完整草稿目录，包含 draft_info.json、draft_content.json 和素材。基础文字可继续编辑；草稿兼容性取决于剪映／CapCut 的版本。"}
				<p className="text-muted-foreground mt-2">
					复杂转场、跨轨效果与复合片段可能合成为整段画面。原工程快照与字幕文件随包保存。导出期间请保持页面打开。
				</p>
			</div>
			<Button
				className="w-full"
				onClick={() => void run()}
				disabled={disabled || running}
			>
				{running ? "正在导出工程…" : "导出剪辑工程与素材"}
			</Button>
			{error && (
				<p role="alert" className="text-destructive whitespace-pre-wrap">
					{error}
				</p>
			)}
			{saved.length > 0 && (
				<label className="block space-y-2">
					<span>已保存的工程导出</span>
					<select
						className="border-border bg-background w-full rounded-md border p-2"
						value={result?.id ?? ""}
						onChange={(e) =>
							setResult(
								saved.find((item) => item.id === e.target.value) ?? null,
							)
						}
					>
						<option value="">选择历史导出</option>
						{saved.map((item) => (
							<option key={item.id} value={item.id}>
								{PROJECT_EXPORT_TARGETS[item.target]} ·{" "}
								{new Date(item.createdAt).toLocaleString()}
							</option>
						))}
					</select>
				</label>
			)}
			{result && (
				<div
					role="status"
					className="border-border space-y-3 rounded-lg border p-3"
				>
					<div className="font-medium">
						已导出 {PROJECT_EXPORT_TARGETS[result.target]}
					</div>
					<p className="text-muted-foreground break-all">{result.folder}</p>
					<a
						className="text-primary underline"
						download={result.archiveName}
						href={`/api/project-interchange/${encodeURIComponent(projectId)}?id=${encodeURIComponent(result.id)}&download=1`}
					>
						下载工程与素材 ZIP
					</a>
					{(result.target === "jianying" || result.target === "capcut") && (
						<Button
							variant="outline"
							className="w-full"
							onClick={() => void install()}
							disabled={installing}
						>
							{installing ? "正在写入草稿库…" : "添加到本机草稿库"}
						</Button>
					)}
					<p className="leading-relaxed">
						{result.target === "premiere"
							? "在 Premiere 中选择「文件 → 导入」，打开目录里的 timeline.xml；Resolve 使用「导入时间线」。"
							: result.target === "fcpxml"
								? "在 Final Cut Pro 中选择「文件 → 导入 → XML」，打开 timeline.fcpxml。"
								: "退出剪映／CapCut，将整个目录放入应用设置中的草稿目录，再启动应用。同机请保留原导出目录，让素材路径继续有效。"}{" "}
						跨电脑使用时，解压完整包并重新链接 media 目录。
					</p>
					{result.warnings.length > 0 && (
						<details>
							<summary className="cursor-pointer">
								转换说明（{result.warnings.length} 项）
							</summary>
							<ul className="mt-2 list-disc space-y-1 pl-4">
								{result.warnings.map((warning, i) => (
									<li key={`${i}-${warning}`}>{warning}</li>
								))}
							</ul>
						</details>
					)}
				</div>
			)}
		</div>
	);
}
