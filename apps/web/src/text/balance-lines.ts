/** Choose measured line breaks without splitting an already grouped token. */
export function balanceMeasuredLines(
 segments: string[], lineCount: number, maxWidth: number, measure: (text: string) => number,
): string[] | undefined {
 // Long imported paragraphs retain the bounded greedy fallback. Subtitle-sized
 // paragraphs use exact search; this runs only once, after font fitting.
 if (segments.length > 128 || lineCount > 8) return undefined;
 const target = measure(segments.join("")) / lineCount;
 type State = { cost: number; lines: string[] };
 let previous: (State | undefined)[] = Array(segments.length + 1);
 previous[0] = {cost: 0, lines: []};
 for (let line = 1; line <= lineCount; line++) {
  const next: (State | undefined)[] = Array(segments.length + 1);
  for (let start = 0; start < segments.length; start++) {
   const prefix = previous[start]; if (!prefix) continue;
   let content = "";
   for (let end = start + 1; end <= segments.length; end++) {
    content += segments[end - 1];
    const visible = start === 0 ? content.trimEnd() : content.trim();
    if (!visible.trim()) continue;
    const width = measure(visible);
    if (width > maxWidth) continue;
    const cost = prefix.cost + (width - target) ** 2;
    if (!next[end] || cost < next[end]!.cost - 1e-6) next[end] = {cost, lines: [...prefix.lines, visible]};
   }
  }
  previous = next;
 }
 return previous[segments.length]?.lines;
}
