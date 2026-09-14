"use client";

import { useState } from "react";
import { Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

export interface TagEvidence {
	tag: string;
	reason: string;
	startSeconds: number;
	endSeconds: number;
	confidence: number;
}

export function TagEvidenceView({
	tag,
	evidence,
	legacyEvidence,
	stale = false,
	onSeek,
}: {
	tag: string;
	evidence: TagEvidence[];
	legacyEvidence?: string;
	stale?: boolean;
	onSeek: (seconds: number) => void;
}) {
	const [open, setOpen] = useState(false);
	const entries = evidence.filter((entry) => entry.tag === tag);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="shrink-0 text-muted-foreground"
					title={`查看${tag}依据`}
					aria-label={`查看${tag}依据`}
				>
					<Info aria-hidden="true" />
				</Button>
			</DialogTrigger>
			<DialogContent aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle className="pr-8 leading-normal tracking-normal break-words">
						标签依据 · {tag}
					</DialogTitle>
				</DialogHeader>
				<DialogBody className="max-h-[65dvh] overflow-y-auto text-sm">
					{stale && (
						<p className="text-caution" role="status">
							截取范围已变更，以下为修改前的依据，需重新核对。
						</p>
					)}
					{entries.length ? (
						<ul className="divide-y">
							{entries.map((entry) => (
								<li
									key={`${entry.startSeconds}:${entry.endSeconds}:${entry.reason}`}
									className="space-y-3 py-4 first:pt-0 last:pb-0"
								>
									<p className="whitespace-pre-wrap break-words">{entry.reason}</p>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<Button
											variant="outline"
											size="sm"
											className="tabular-nums"
											disabled={stale}
											title={stale ? "范围已变更，暂不可跳转" : "定位画面依据"}
											onClick={() => {
												onSeek(entry.startSeconds);
												setOpen(false);
											}}
										>
											<Play aria-hidden="true" />
											{entry.startSeconds.toFixed(2)} - {entry.endSeconds.toFixed(2)} s
										</Button>
										<span className="text-muted-foreground tabular-nums">
											AI 置信度 {Math.round(entry.confidence * 100)}%
										</span>
									</div>
								</li>
							))}
						</ul>
					) : (
						<>
							<p className="text-muted-foreground">暂无此标签的逐项依据。</p>
							{legacyEvidence?.trim() && (
								<div className="space-y-2 border-t pt-4">
									<p className="font-medium">历史综合证据</p>
									<p className="text-muted-foreground">
										以下为片段整体分析，未关联到此标签。
									</p>
									<p className="whitespace-pre-wrap break-words">{legacyEvidence}</p>
								</div>
							)}
						</>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
