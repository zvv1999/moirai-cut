"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import {
	requestProjectFcpxml,
	type FcpxmlClientResult,
} from "@/export/interchange-client";
import { downloadBlob } from "@/utils/browser";

async function downloadArtifact({
	url,
	name,
}: {
	url: string;
	name: string;
}): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`下载 ${name} 失败：${response.status}`);
	downloadBlob({ blob: await response.blob(), filename: name });
}

const SEVERITY_LABELS = {
	info: "提示",
	degraded: "已降级",
	omitted: "已省略",
} as const;

export function ProjectInterchangePanel() {
	const editor = useEditor();
	const project = useEditor((instance) => instance.project.getActive());
	const scene = useEditor((instance) => instance.scenes.getActiveScene());
	const [exporting, setExporting] = useState(false);
	const [result, setResult] = useState<FcpxmlClientResult | null>(null);

	const exportFcpxml = async () => {
		setExporting(true);
		try {
			const generated = await requestProjectFcpxml({
				projectId: project.metadata.id,
				projectName: project.metadata.name,
				sceneId: scene.id,
				isDirty: () => editor.save.getIsDirty(),
				flush: async () => {
					await editor.save.flush();
					const save = editor.save.getState();
					if (save.status === "error") {
						throw new Error(save.error ?? "工程保存失败");
					}
				},
				getRevision: () =>
					editor.project.getKnownFileRevision(project.metadata.id),
			});
			setResult(generated);
			toast.success(`FCPXML r${generated.revision} 已生成`);
		} catch (error) {
			toast.error("工程互通导出失败", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setExporting(false);
		}
	};

	return (
		<div className="space-y-3">
			<div>
				<div className="text-xs font-semibold">工程互通</div>
				<div className="text-muted-foreground mt-0.5 text-[9px]">
					导出可继续编辑的开放时间线，同时明确记录不等价的能力。
				</div>
			</div>

			<section className="border-border rounded-lg border p-3">
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="text-xs font-semibold">FCPXML 1.10</div>
						<p className="text-muted-foreground mt-1 max-w-md text-[9px] leading-4">
							供 Final Cut Pro 等支持 FCPXML 的 NLE
							使用，也是中国版剪映桌面端的实验性单向交接入口。 它不是剪映/CapCut
							私有工程文件；国际版 CapCut 不支持第三方工程导入。
						</p>
					</div>
					<Button
						size="sm"
						onClick={() => void exportFcpxml()}
						disabled={exporting}
					>
						{exporting ? "正在生成…" : "生成 FCPXML"}
					</Button>
				</div>
				<div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
					<div className="bg-muted/40 rounded p-2">
						<div className="font-medium">精确保留</div>
						<div className="text-muted-foreground mt-0.5">
							帧率、切点、源裁剪、主轨空隙、视频叠加和独立音频
						</div>
					</div>
					<div className="bg-muted/40 rounded p-2">
						<div className="font-medium">显式报告</div>
						<div className="text-muted-foreground mt-0.5">
							文字、转场、动画、特效、遮罩、变速和隐藏内容
						</div>
					</div>
					<div className="bg-muted/40 rounded p-2">
						<div className="font-medium">素材重连</div>
						<div className="text-muted-foreground mt-0.5">
							XML 使用本地 file:// 路径，并附带 relink manifest
						</div>
					</div>
				</div>
			</section>

			{result ? (
				<section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="truncate text-[10px] font-semibold">
								{result.name}
							</div>
							<div className="text-muted-foreground mt-0.5 text-[8px]">
								工程 r{result.revision} · 发布前 revision 已校验
							</div>
						</div>
						<div className="flex shrink-0 gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									void downloadArtifact({
										url: result.reportDownloadUrl,
										name: result.reportName,
									})
								}
							>
								下载报告
							</Button>
							<Button
								size="sm"
								onClick={() =>
									void downloadArtifact({
										url: result.downloadUrl,
										name: result.name,
									})
								}
							>
								下载 XML
							</Button>
						</div>
					</div>
					{result.report.issues.length > 0 ? (
						<ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
							{result.report.issues.map((issue, index) => (
								<li
									key={`${issue.code}-${issue.trackId ?? ""}-${issue.elementId ?? ""}-${index}`}
									className="bg-background/80 rounded p-2 text-[9px]"
								>
									<span className="mr-1 font-medium">
										{SEVERITY_LABELS[issue.severity]}
									</span>
									{issue.message ?? issue.code}
								</li>
							))}
						</ul>
					) : (
						<p className="mt-3 text-[9px] text-emerald-700">
							未发现需要降级或省略的时间线能力。
						</p>
					)}
				</section>
			) : (
				<div className="border-border rounded-lg border border-dashed p-6 text-center text-[10px] opacity-55">
					生成后会在这里显示已校验的 revision 和逐项互通报告。
				</div>
			)}
		</div>
	);
}
