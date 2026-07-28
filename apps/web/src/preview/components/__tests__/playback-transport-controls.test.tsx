import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaybackTransportControls } from "../playback-transport-controls";

describe("PlaybackTransportControls", () => {
	test("keeps the complete human playback workflow visible and labelled", () => {
		const html = renderToStaticMarkup(
			<PlaybackTransportControls
				isPlaying={false}
				loopEnabled
				playbackRate={1}
				previewQuality="balanced"
				onGoToStart={() => undefined}
				onStepBackward={() => undefined}
				onTogglePlay={() => undefined}
				onStepForward={() => undefined}
				onGoToEnd={() => undefined}
				onToggleLoop={() => undefined}
				onPlaybackRateChange={() => undefined}
				onPreviewQualityChange={() => undefined}
			/>,
		);

		expect(html).toContain('aria-label="Go to timeline start (Home)"');
		expect(html).toContain('aria-label="Previous frame (Left Arrow)"');
		expect(html).toContain('aria-label="Play (Space)"');
		expect(html).toContain('aria-label="Next frame (Right Arrow)"');
		expect(html).toContain('aria-label="Go to timeline end (End)"');
		expect(html).toContain('aria-label="Loop playback"');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('aria-label="Playback speed"');
		expect(html).toContain('aria-label="Preview quality"');
		expect(html).toContain(">1×<");
		expect(html).toContain(">Balanced<");
	});

	test("names the primary action Pause while playback is active", () => {
		const html = renderToStaticMarkup(
			<PlaybackTransportControls
				isPlaying
				loopEnabled={false}
				playbackRate={2}
				previewQuality="full"
				onGoToStart={() => undefined}
				onStepBackward={() => undefined}
				onTogglePlay={() => undefined}
				onStepForward={() => undefined}
				onGoToEnd={() => undefined}
				onToggleLoop={() => undefined}
				onPlaybackRateChange={() => undefined}
				onPreviewQualityChange={() => undefined}
			/>,
		);

		expect(html).toContain('aria-label="Pause (Space)"');
		expect(html).toContain(">2×<");
		expect(html).toContain(">Full<");
	});
});
