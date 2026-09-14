"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export function PublishedVideo({
	release,
	name,
	changed,
	onOpen,
}: {
	release: { id: string; revision: number };
	name: string;
	changed: boolean;
	onOpen: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [failed, setFailed] = useState(false);
	const [selected, setSelected] = useState(release);
	const previous = changed || selected.id !== release.id;
	return (
		<>
			<Button
				variant="outline"
				onClick={() => {
					onOpen();
					setSelected(release);
					setFailed(false);
					setOpen(true);
				}}
			>
				<Play />
				查看已入库视频
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="footage-published-dialog"
					aria-describedby="published-video-version"
				>
					<DialogHeader>
						<DialogTitle>已入库视频 · {name}</DialogTitle>
					</DialogHeader>
					<p id="published-video-version" className="footage-subtle">
						{previous ? "上次入库版本" : "已入库版本"} · v{selected.revision}
						{previous ? " · 不含当前修改" : ""}
					</p>
					{open && (
						<>
							{/* Source footage does not have authored captions. */}
							{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
							<video
								key={selected.id}
								controls
								playsInline
								preload="metadata"
								src={`/api/footage/media/release/${encodeURIComponent(selected.id)}/master`}
								onError={() => setFailed(true)}
							/>
						</>
					)}
					{failed && (
						<p role="alert" className="footage-error">
							已入库视频暂时无法播放，请检查文件是否可用。
						</p>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
