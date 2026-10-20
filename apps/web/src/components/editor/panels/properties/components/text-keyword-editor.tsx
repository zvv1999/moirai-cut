"use client";

import { useState } from "react";
import { hasKeyframesForPath } from "@/animation";
import { Button } from "@/components/ui/button";
import { TextSelectionArea } from "@/components/ui/text-selection-area";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { readTextHighlight } from "@/text/highlight";
import type { TextElement } from "@/timeline";

export function TextKeywordEditor({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const [selection, setSelection] = useState({ content: "", start: 0, end: 0 });
	const content = String(renderElement.params.content ?? "");
	const highlight = readTextHighlight(renderElement.params);
	const animated = hasKeyframesForPath({
		animations: renderElement.animations,
		propertyPath: "text.highlightRange",
	});
	const valid =
		selection.content === content && selection.end > selection.start;
	const update = (clear: boolean) => {
		previewUpdates({
			params: {
				...renderElement.params,
				"text.highlightEnabled": !clear,
				"text.highlightColor":
					renderElement.params["text.highlightColor"] ?? "#ffcf4a",
				"text.highlightRange": clear ? "" : JSON.stringify(selection),
			},
		});
		commit();
	};
	return (
		<section className="border-t p-4 space-y-3" aria-label="关键词范围">
			<h3 className="text-sm font-medium">关键词范围</h3>
			<TextSelectionArea
				aria-label="选择关键词文字"
				value={content}
				onSelectionChange={setSelection}
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					disabled={!valid || animated}
					onClick={() => update(false)}
				>
					设为关键词
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={animated || !highlight}
					onClick={() => update(true)}
				>
					清除关键词
				</Button>
			</div>
			<output className="block break-words text-xs text-muted-foreground">
				{animated
					? "逐词动画控制中"
					: highlight
						? `当前关键词：${content.slice(highlight.start, highlight.end)}`
						: "未设置关键词"}
			</output>
		</section>
	);
}
