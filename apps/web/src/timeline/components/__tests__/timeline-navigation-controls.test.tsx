import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	TimelineNavigationControls,
	TimelineOverview,
} from "@/timeline/components/timeline-navigation";

test("timeline navigation stays visible and named", () => {
	const markup = renderToStaticMarkup(
		<>
			<TimelineNavigationControls
				onFitTimeline={() => {}}
				onRevealPlayhead={() => {}}
			/>
			<TimelineOverview
				items={[
					{ id: "opening", startRatio: 0, durationRatio: 0.25, lane: 0 },
					{ id: "ending", startRatio: 0.75, durationRatio: 0.25, lane: 1 },
				]}
				laneCount={2}
				scrollLeft={250}
				scrollWidth={1_000}
				viewportWidth={500}
				onNavigate={() => {}}
				onFitTimeline={() => {}}
				onRevealPlayhead={() => {}}
			/>
		</>,
	);

	expect(markup).toContain('aria-label="适应整个时间线"');
	expect(markup).toContain('aria-label="定位播放头"');
	expect(markup).toContain('aria-label="时间线概览"');
	expect(markup).toContain('aria-label="当前可见时间线范围"');
	expect(markup).toContain('data-overview-item="opening"');
	expect(markup).toContain('data-overview-item="ending"');
});
