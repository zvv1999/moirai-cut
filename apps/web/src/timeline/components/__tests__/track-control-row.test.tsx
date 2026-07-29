import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TrackControlRowView } from "@/timeline/components/track-control-row";
import { buildEmptyTrack } from "@/timeline/placement/track-factory";

test("track headers expose identity, compatibility, and direct controls", () => {
	const track = {
		...buildEmptyTrack({
			id: "dialogue",
			type: "audio",
			name: "Dialogue",
		}),
		solo: true,
		locked: true,
	};
	const markup = renderToStaticMarkup(
		<TrackControlRowView
			track={track}
			isMainTrack={false}
			onRename={() => {}}
			onToggleLock={() => {}}
			onToggleSolo={() => {}}
			onToggleMute={() => {}}
			onToggleVisibility={() => {}}
			onSetHeight={() => {}}
			onDelete={() => {}}
		/>,
	);

	expect(markup).toContain("Dialogue");
	expect(markup).toContain("音频素材");
	expect(markup).toContain('aria-label="重命名 Dialogue"');
	expect(markup).toContain('aria-label="解锁 Dialogue"');
	expect(markup).toContain('aria-label="取消独奏 Dialogue"');
	expect(markup).toContain('aria-label="静音 Dialogue"');
	expect(markup).toContain('aria-label="调整 Dialogue 高度"');
	expect(markup).toContain('aria-label="删除 Dialogue"');
	expect(markup).toContain('aria-pressed="true"');
});

test("main track cannot be deleted and incompatible controls stay absent", () => {
	const track = buildEmptyTrack({
		id: "main",
		type: "video",
		name: "Main story",
	});
	const markup = renderToStaticMarkup(
		<TrackControlRowView
			track={track}
			isMainTrack={true}
			onRename={() => {}}
			onToggleLock={() => {}}
			onToggleSolo={() => {}}
			onToggleMute={() => {}}
			onToggleVisibility={() => {}}
			onSetHeight={() => {}}
			onDelete={() => {}}
		/>,
	);

	expect(markup).toContain("Main");
	expect(markup).toContain('aria-label="隐藏 Main story"');
	expect(markup).not.toContain('aria-label="删除 Main story"');
});
