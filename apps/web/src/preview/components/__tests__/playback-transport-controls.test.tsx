import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaybackTransportControls } from "../playback-transport-controls";

describe("PlaybackTransportControls", () => {
	test("keeps the complete human playback workflow visible and labelled in Chinese", () => {
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

		expect(html).toContain('aria-label="回到时间线开头（Home）"');
		expect(html).toContain('aria-label="上一帧（←）"');
		expect(html).toContain('aria-label="播放（空格）"');
		expect(html).toContain('aria-label="下一帧（→）"');
		expect(html).toContain('aria-label="前往时间线结尾（End）"');
		expect(html).toContain('aria-label="循环播放"');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('aria-label="播放速度"');
		expect(html).toContain('aria-label="预览画质"');
		expect(html).toContain(">1×<");
		expect(html).toContain(">流畅<");
	});

	test("names the primary action Pause in Chinese while playback is active", () => {
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

		expect(html).toContain('aria-label="暂停（空格）"');
		expect(html).toContain(">2×<");
		expect(html).toContain(">完整<");
	});
});
