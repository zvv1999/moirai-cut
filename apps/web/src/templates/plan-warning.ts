// Presentation only: thresholds and warning generation belong to Rust.
export function formatPlanWarning(warning: string): string {
    if (warning.startsWith("exit_sampling:")) {
        try {
            const diagnostic = JSON.parse(warning.slice("exit_sampling:".length));
            const row = diagnostic.record ?? diagnostic;
            if (typeof row.elementId === "string" && Number.isInteger(row.exitFrames) && Number.isInteger(row.postFrames) && Number.isInteger(row.required?.minExitFrames) && Number.isInteger(row.required?.minPostFrames)) {
                return `退场时间预检 ${row.templateElementId ?? row.elementId}：预计退场 ${row.exitFrames} / 要求 ${row.required.minExitFrames} 帧，结束后 ${row.postFrames} / 要求 ${row.required.minPostFrames} 帧。请查看退场检查明细并调整显示区间；这不是成片实测结果。`;
            }
        } catch { /* Keep an unrecognized diagnostic visible. */ }
    }
    if(warning.startsWith("authored_default_blurred_fill:"))return "已用原片模糊铺满背景，前景保留完整画面比例。";
    const opacity = /^text_opacity_hold_short:(.+):([0-9.]+):([0-9.]+):([0-9.]+):([0-9.]+)$/.exec(warning);
    if(opacity) return `文字动效 ${Number(opacity[2]).toFixed(2)}–${Number(opacity[3]).toFixed(2)} 秒：全不透明稳定段仅 ${Number(opacity[4]).toFixed(2)} 秒，低于建议的 ${Number(opacity[5]).toFixed(2)} 秒。可缩短淡入淡出，或让主文字保持清晰、仅装饰层渐变。此项不包含遮挡和其他效果的检查。`;
	const cue = /^cue-(\d+):(.*)$/.exec(warning);
	if (cue) {
		const messages: Record<string, string> = {
			reading_speed_exceeds_limit: "阅读速度超过当前设置。请试听对应句子；可精简文案或放慢配音后重新试映。",
			caption_exceeds_phrase_duration: "整句显示时间超过当前设置。可在「字幕分段」中拆成较短的句子。",
			aligned_word_exceeds_phrase_duration: "单个转写词的时间超过当前设置。请检查该词的时间对齐；拆分其他词不能缩短它。",
			caption_exceeds_character_budget: "整句文字长度超过当前设置。请检查换行，可在「字幕分段」中调整范围。",
			aligned_word_exceeds_character_budget: "单个转写词的长度超过当前设置。请检查文字与换行；分段不会从这个词中间拆开。",
		};
		if (messages[cue[2]]) return `字幕分段第 ${Number(cue[1]) + 1} 句：${messages[cue[2]]}`;
	}
	if (warning.startsWith("content_missing_keyword:")) return warning.slice("content_missing_keyword:".length);
	if (warning === "Semantic units use sentence/speaker boundaries and lexical intent; review meaning.") {
		return "已按句子和说话人自动划分内容段落，请检查分段含义并标注重点。";
	}
	return warning;
}

export function formatPlanWarnings(warnings: string[]): string[] {
	const groups = new Map<string, { positions: number[]; text: string }>();
	const order: string[] = [];
	for (const [index, warning] of warnings.entries()) {
		const text = formatPlanWarning(warning);
		const cue = /^cue-(\d+):(.*)$/.exec(warning);
		const knownCue = cue && text !== warning;
		const key = knownCue ? cue[2] : warning.startsWith("text_opacity_hold_short:") ? text : `unknown-${index}`;
		if (!groups.has(key)) {
			groups.set(key, { positions: [], text });
			order.push(key);
		}
		if (knownCue) {
			const positions = groups.get(key)!.positions;
			const position = Number(cue[1]) + 1;
			if (!positions.includes(position)) positions.push(position);
		}
	}
	return order.map(key => {
		const group = groups.get(key)!;
		return group.positions.length > 1
			? group.text.replace(/^字幕分段第 \d+ 句/, `字幕分段第 ${group.positions.join("、")} 句`)
			: group.text;
	});
}
