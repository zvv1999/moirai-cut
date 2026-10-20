/** Read-only presentation of authored rules; Rust resolves actual sound events. */
export const startTimingLabels: Record<string, string> = {
	video_start: "视频开始", cue_start: "字幕段开始", keyword_start: "关键词开始",
	cue_end: "字幕段结束", semantic_start: "语义段开始", semantic_end: "语义段结束",
};
export const endTimingLabels: Record<string, string> = {
	automatic: "沿用开始触发方式的默认结束", event_end: "触发事件结束",
	cue_end: "所在字幕句结束", semantic_end: "所在语义段结束", video_end: "视频结束",
};

export function StyleRuleSummary({ binding, text, timing, maxSeconds, busy, onEdit }: {
	binding: string; text: boolean; timing: {anchor: string; endAnchor?: string; offsetSeconds: number};
	maxSeconds: number; busy: boolean; onEdit: () => void;
}) {
	const content = text ? ({literal: "固定文字", sentence: "字幕句子", keyword: "标注的重点词"}[binding] ?? binding) : "当前素材";
	const offset = !Number.isFinite(timing.offsetSeconds) ? "（偏移未填写）" : timing.offsetSeconds === 0 ? "" : `（${timing.offsetSeconds > 0 ? "延后" : "提前"} ${Math.abs(timing.offsetSeconds)} 秒）`;
	return <section className="tw-style-rule-summary" aria-label="当前图层规则摘要">
		<p><strong>{content}</strong> · <button type="button" className="tw-content-rule-link" disabled={busy} onClick={onEdit}>编辑应用规则</button></p>
		<p>开始：{startTimingLabels[timing.anchor] ?? timing.anchor}{offset}；结束：{endTimingLabels[timing.endAnchor ?? "automatic"] ?? timing.endAnchor}。</p>
		<p>单次最多 {Number.isFinite(maxSeconds) ? maxSeconds : "未填写"} 秒；具体时间由应用时的事件决定。</p>
	</section>;
}
