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
	expect(markup).toContain("Audio clips");
	expect(markup).toContain('aria-label="Rename Dialogue"');
	expect(markup).toContain('aria-label="Unlock Dialogue"');
	expect(markup).toContain('aria-label="Disable solo for Dialogue"');
	expect(markup).toContain('aria-label="Mute Dialogue"');
	expect(markup).toContain('aria-label="Resize Dialogue"');
	expect(markup).toContain('aria-label="Delete Dialogue"');
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
	expect(markup).toContain('aria-label="Hide Main story"');
	expect(markup).not.toContain('aria-label="Delete Main story"');
});
