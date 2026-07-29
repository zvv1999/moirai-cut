"use client";

import { AlertCircleIcon, Link04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { MediaType } from "@/media/types";
import { cn } from "@/utils/ui";

type MissingMediaPlaceholderProps = {
	surface: "library" | "timeline" | "canvas";
	mediaId: string;
	name: string;
	type: MediaType;
	usageCount?: number;
	onRelink?: () => void;
	className?: string;
};

function formatMediaType({ type }: { type: MediaType }): string {
	const labels: Record<MediaType, string> = {
		video: "视频",
		image: "图片",
		audio: "音频",
	};
	return labels[type];
}

export function MissingMediaPlaceholder({
	surface,
	mediaId,
	name,
	type,
	usageCount,
	onRelink,
	className,
}: MissingMediaPlaceholderProps) {
	if (surface === "timeline") {
		return (
			<div
				data-missing-media={mediaId}
				role="status"
				className={cn(
					"flex size-full min-w-0 items-center gap-1.5 overflow-hidden border border-red-300/55 bg-red-950/85 px-2 text-red-50",
					className,
				)}
				style={{
					backgroundImage:
						"repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 6px, transparent 6px 12px)",
				}}
			>
				<HugeiconsIcon icon={AlertCircleIcon} className="size-3 shrink-0" />
				<span className="truncate text-xs font-semibold">素材丢失 · {name}</span>
			</div>
		);
	}

	if (surface === "canvas") {
		return (
			<div
				data-missing-media={mediaId}
				role="status"
				aria-live="polite"
				className={cn(
					"pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden border-2 border-red-400 bg-red-950/95 p-6 text-center text-white",
					className,
				)}
				style={{
					backgroundImage:
						"repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 12px, transparent 12px 24px)",
				}}
			>
				<div className="max-w-sm rounded-xl border border-red-300/35 bg-black/45 px-6 py-5 shadow-2xl backdrop-blur-sm">
					<HugeiconsIcon
						icon={AlertCircleIcon}
						className="mx-auto mb-3 size-8 text-red-300"
					/>
					<p className="text-xs font-black tracking-[0.18em] text-red-200">
						素材已离线
					</p>
					<p className="mt-2 truncate text-base font-semibold">{name}</p>
					<p className="mt-1 text-xs text-red-100/75">
						请在素材面板中重新链接此文件
					</p>
				</div>
			</div>
		);
	}

	const formattedType = formatMediaType({ type });
	const usageLabel =
		usageCount === undefined
			? formattedType
			: `${formattedType} · 时间线使用 ${usageCount} 次`;

	return (
		<div
			data-missing-media={mediaId}
			role="status"
			className={cn(
				"overflow-hidden rounded-lg border border-red-500/40 bg-red-950/35",
				className,
			)}
		>
			<div
				className="h-16 border-b border-red-500/25"
				style={{
					backgroundImage:
						"repeating-linear-gradient(135deg, rgba(248,113,113,.18) 0 9px, transparent 9px 18px)",
				}}
			>
				<div className="flex size-full items-center justify-center text-red-300">
					<HugeiconsIcon icon={AlertCircleIcon} className="size-6" />
				</div>
			</div>
			<div className="space-y-3 p-3">
				<div className="min-w-0">
					<p className="text-xs font-bold text-red-300">素材丢失</p>
					<p
						className="truncate text-sm font-semibold text-red-50"
						title={name}
					>
						{name}
					</p>
					<p className="mt-0.5 text-[11px] text-red-100/65">{usageLabel}</p>
				</div>
				{onRelink ? (
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="w-full border-red-400/35 bg-red-950/55 text-red-100 hover:bg-red-900/60 hover:text-white"
						aria-label={`重新链接 ${name}`}
						onClick={onRelink}
					>
						<HugeiconsIcon icon={Link04Icon} />
						重新链接
					</Button>
				) : null}
			</div>
		</div>
	);
}
