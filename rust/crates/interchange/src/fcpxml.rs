use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use time::TICKS_PER_SECOND;
use url::Url;

use crate::{
    model::{MediaAsset, ProjectDocument, Scene, TimelineElement, Track},
    report::{
        AdapterReport, ErrorCode, ExportSource, InterchangeError, InterchangeExport,
        InterchangeIssue, InterchangeReport, InterchangeTarget, IssueSeverity, RelinkAsset,
        RelinkReport,
    },
};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub enum FcpxmlVersion {
    #[default]
    #[serde(rename = "1.10")]
    V1_10,
}

impl FcpxmlVersion {
    fn as_str(self) -> &'static str {
        match self {
            Self::V1_10 => "1.10",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FcpxmlExportOptions {
    #[serde(default)]
    pub expected_revision: Option<u64>,
    #[serde(default)]
    pub scene_id: Option<String>,
    #[serde(default)]
    pub version: FcpxmlVersion,
    pub target: InterchangeTarget,
}

#[derive(Clone, Debug)]
struct ResolvedAsset {
    id: String,
    metadata: MediaAsset,
    path: PathBuf,
    uri: String,
    duration_ticks: i64,
    resource_id: String,
}

#[derive(Clone, Debug)]
struct ConnectedNode {
    timeline_start: i64,
    lane: i32,
    node: XmlNode,
}

#[derive(Clone, Debug)]
enum StoryKind<'a> {
    Gap,
    Clip(&'a TimelineElement),
}

#[derive(Clone, Debug)]
struct StorySegment<'a> {
    timeline_start: i64,
    duration: i64,
    source_start: i64,
    kind: StoryKind<'a>,
    connected: Vec<ConnectedNode>,
}

#[derive(Clone, Debug)]
struct XmlNode {
    name: &'static str,
    attributes: Vec<(&'static str, String)>,
    children: Vec<XmlNode>,
}

impl XmlNode {
    fn new(name: &'static str) -> Self {
        Self {
            name,
            attributes: Vec::new(),
            children: Vec::new(),
        }
    }

    fn attr(mut self, name: &'static str, value: impl Into<String>) -> Self {
        self.attributes.push((name, value.into()));
        self
    }

    fn optional_attr(mut self, name: &'static str, value: Option<impl Into<String>>) -> Self {
        if let Some(value) = value {
            self.attributes.push((name, value.into()));
        }
        self
    }

    fn child(mut self, child: XmlNode) -> Self {
        self.children.push(child);
        self
    }

    fn children(mut self, children: impl IntoIterator<Item = XmlNode>) -> Self {
        self.children.extend(children);
        self
    }
}

pub fn export_fcpxml(
    project: &Value,
    media_index: &Value,
    media_root: &Path,
    options: FcpxmlExportOptions,
) -> Result<InterchangeExport, InterchangeError> {
    let project: ProjectDocument = serde_json::from_value(project.clone()).map_err(|error| {
        InterchangeError::new(
            ErrorCode::InvalidProject,
            format!("Invalid Moirai Cut project document: {error}"),
        )
    })?;
    validate_project(&project)?;

    if let Some(expected) = options.expected_revision
        && expected != project.revision
    {
        return Err(InterchangeError::new(
            ErrorCode::RevisionConflict,
            format!(
                "Project {} is at revision {}, not {}. Re-read it before exporting.",
                project.metadata.id, project.revision, expected
            ),
        ));
    }

    let scene = select_scene(&project, options.scene_id.as_deref())?;
    validate_scene_timing(scene)?;
    let mut issues = collect_loss_issues(scene);
    let referenced = referenced_media(scene, &mut issues)?;
    let assets = resolve_assets(media_index, media_root, &referenced)?;
    let asset_by_id: HashMap<&str, &ResolvedAsset> = assets
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect();

    let duration = timeline_duration(scene)?;
    let mut story = build_storyline(scene, duration)?;
    attach_connected_clips(scene, &asset_by_id, &mut story, &mut issues)?;
    attach_markers(scene, &mut story, &mut issues)?;

    let root = build_document(
        &project,
        scene,
        &assets,
        &asset_by_id,
        &story,
        duration,
        options.version,
    )?;
    let document = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE fcpxml>\n{}\n",
        serialize_xml(&root, 0)?
    );

    Ok(InterchangeExport {
        document,
        report: InterchangeReport {
            schema: "moirai-cut.interchange-report.v1".to_owned(),
            source: ExportSource {
                project_id: project.metadata.id.clone(),
                project_name: project.metadata.name.clone(),
                revision: project.revision,
                scene_id: scene.id.clone(),
                scene_name: scene.name.clone(),
            },
            adapter: AdapterReport {
                format: "fcpxml".to_owned(),
                version: options.version.as_str().to_owned(),
                target: options.target,
            },
            issues,
            relink: RelinkReport {
                assets: assets
                    .iter()
                    .map(|asset| RelinkAsset {
                        id: asset.id.clone(),
                        name: asset.metadata.name.clone(),
                        path: asset.path.to_string_lossy().into_owned(),
                        uri: asset.uri.clone(),
                        exists: true,
                    })
                    .collect(),
            },
        },
    })
}

fn validate_project(project: &ProjectDocument) -> Result<(), InterchangeError> {
    let fps = project.settings.fps;
    let canvas = project.settings.canvas_size;
    if project.metadata.id.trim().is_empty() || project.metadata.name.trim().is_empty() {
        return Err(InterchangeError::new(
            ErrorCode::InvalidProject,
            "Project id and name are required for FCPXML export.",
        ));
    }
    if fps.numerator == 0 || fps.denominator == 0 {
        return Err(InterchangeError::new(
            ErrorCode::InvalidProject,
            "Project frame rate must have a non-zero numerator and denominator.",
        ));
    }
    if canvas.width == 0 || canvas.height == 0 {
        return Err(InterchangeError::new(
            ErrorCode::InvalidProject,
            "Project canvas dimensions must be positive.",
        ));
    }
    Ok(())
}

fn select_scene<'a>(
    project: &'a ProjectDocument,
    requested: Option<&str>,
) -> Result<&'a Scene, InterchangeError> {
    if let Some(id) = requested {
        return project
            .scenes
            .iter()
            .find(|scene| scene.id == id)
            .ok_or_else(|| {
                InterchangeError::new(
                    ErrorCode::InvalidOptions,
                    format!("No scene {id} exists in the project."),
                )
            });
    }

    project
        .scenes
        .iter()
        .find(|scene| scene.id == project.current_scene_id)
        .or_else(|| project.scenes.iter().find(|scene| scene.is_main))
        .ok_or_else(|| {
            InterchangeError::new(
                ErrorCode::InvalidOptions,
                "The project has no exportable scene.",
            )
        })
}

fn timeline_duration(scene: &Scene) -> Result<i64, InterchangeError> {
    // The cached project duration can include hidden content. Derive every
    // sequence end from the selected scene's visible elements instead.
    let mut duration = 0;
    for track in std::iter::once(&scene.tracks.main)
        .chain(scene.tracks.overlay.iter())
        .chain(scene.tracks.audio.iter())
    {
        if track.hidden {
            continue;
        }
        for element in &track.elements {
            if element.hidden {
                continue;
            }
            let end = element.end().ok_or_else(|| {
                InterchangeError::new(
                    ErrorCode::InvalidProject,
                    format!(
                        "Element {} timing overflows the supported range.",
                        element.id
                    ),
                )
            })?;
            duration = duration.max(end);
        }
    }
    if duration <= 0 {
        return Err(InterchangeError::new(
            ErrorCode::UnsupportedTimeline,
            "The selected scene has no positive-duration timeline content.",
        ));
    }
    Ok(duration)
}

fn validate_scene_timing(scene: &Scene) -> Result<(), InterchangeError> {
    for track in std::iter::once(&scene.tracks.main)
        .chain(scene.tracks.overlay.iter())
        .chain(scene.tracks.audio.iter())
    {
        if track.hidden {
            continue;
        }
        for element in &track.elements {
            if element.hidden {
                continue;
            }
            if element.transition_in.is_some() {
                return Err(InterchangeError::new(
                    ErrorCode::UnsupportedTimeline,
                    format!(
                        "Element {} has a transition. Remove it before FCPXML export so the incoming clip is not moved to the overlap start as a hard cut.",
                        element.id
                    ),
                ));
            }
            if TimelineElement::has_nonempty_value(&element.compound) {
                return Err(InterchangeError::new(
                    ErrorCode::UnsupportedTimeline,
                    format!(
                        "Element {} is a compound clip. Break it apart before FCPXML export so child edits are not silently replaced by the container's first source.",
                        element.id
                    ),
                ));
            }
            if element.duration <= 0 || element.start_time < 0 || element.trim_start < 0 {
                return Err(InterchangeError::new(
                    ErrorCode::InvalidProject,
                    format!(
                        "Element {} has invalid negative or zero timing.",
                        element.id
                    ),
                ));
            }
            element.end().ok_or_else(|| {
                InterchangeError::new(
                    ErrorCode::InvalidProject,
                    format!(
                        "Element {} timeline range overflows the supported range.",
                        element.id
                    ),
                )
            })?;
            source_end(element)?;
        }
    }
    Ok(())
}

fn source_end(element: &TimelineElement) -> Result<i64, InterchangeError> {
    element
        .trim_start
        .checked_add(element.duration)
        .ok_or_else(|| {
            InterchangeError::new(
                ErrorCode::InvalidProject,
                format!(
                    "Element {} source range overflows the supported range.",
                    element.id
                ),
            )
        })
}

fn audio_capable(track: &Track) -> bool {
    matches!(track.kind.as_str(), "video" | "audio")
}

fn scene_has_solo_track(scene: &Scene) -> bool {
    std::iter::once(&scene.tracks.main)
        .chain(scene.tracks.overlay.iter())
        .chain(scene.tracks.audio.iter())
        .any(|track| !track.hidden && audio_capable(track) && track.solo)
}

fn track_is_audible(track: &Track, has_solo_track: bool) -> bool {
    !track.hidden && audio_capable(track) && !track.muted && (!has_solo_track || track.solo)
}

fn source_audio_is_enabled(
    track: &Track,
    element: &TimelineElement,
    asset: &ResolvedAsset,
    has_solo_track: bool,
) -> bool {
    asset.metadata.has_audio
        && track_is_audible(track, has_solo_track)
        && element.source_audio_enabled()
        && !element.audio_muted()
}

fn referenced_media(
    scene: &Scene,
    issues: &mut Vec<InterchangeIssue>,
) -> Result<Vec<(String, i64)>, InterchangeError> {
    let mut ordered = Vec::new();
    let mut seen = HashSet::new();
    let has_solo_track = scene_has_solo_track(scene);
    let mut visit = |track: &Track, element: &TimelineElement| -> Result<(), InterchangeError> {
        if !matches!(element.kind.as_str(), "video" | "image" | "audio") {
            return Ok(());
        }
        if element.kind == "audio" && element.source_type.as_deref() == Some("library") {
            issues.push(
                InterchangeIssue::new(
                    "library_audio_omitted",
                    IssueSeverity::Omitted,
                    format!(
                        "Library audio '{}' has no local media id and was omitted.",
                        element.name
                    ),
                )
                .on_track(&track.id)
                .on_element(&element.id),
            );
            return Ok(());
        }
        let media_id = element.media_id.as_ref().ok_or_else(|| {
            InterchangeError::new(
                ErrorCode::MissingMedia,
                format!("Element {} has no media id to relink.", element.id),
            )
        })?;
        let required_duration = source_end(element)?;
        if seen.insert(media_id.clone()) {
            ordered.push((media_id.clone(), required_duration));
        } else if let Some((_, current)) = ordered.iter_mut().find(|(id, _)| id == media_id) {
            *current = (*current).max(required_duration);
        }
        Ok(())
    };

    if !scene.tracks.main.hidden {
        for element in &scene.tracks.main.elements {
            if !element.hidden {
                visit(&scene.tracks.main, element)?;
            }
        }
    }
    for track in &scene.tracks.overlay {
        if track.hidden {
            continue;
        }
        for element in &track.elements {
            if !element.hidden {
                visit(track, element)?;
            }
        }
    }
    for track in &scene.tracks.audio {
        if !track_is_audible(track, has_solo_track) {
            continue;
        }
        for element in &track.elements {
            if !element.hidden && !element.audio_muted() {
                visit(track, element)?;
            }
        }
    }
    Ok(ordered)
}

fn resolve_assets(
    media_index: &Value,
    media_root: &Path,
    referenced: &[(String, i64)],
) -> Result<Vec<ResolvedAsset>, InterchangeError> {
    let index = media_index.as_object().ok_or_else(|| {
        InterchangeError::new(
            ErrorCode::InvalidProject,
            "Media index must be an asset-id object.",
        )
    })?;
    let mut assets = Vec::with_capacity(referenced.len());
    for (position, (id, required_duration)) in referenced.iter().enumerate() {
        if !safe_component(id) {
            return Err(InterchangeError::new(
                ErrorCode::InvalidProject,
                format!("Unsafe media id cannot be relinked: {id}"),
            ));
        }
        let value = index.get(id).ok_or_else(|| {
            InterchangeError::new(
                ErrorCode::MissingMedia,
                format!("Referenced media {id} is absent from media/index.json."),
            )
        })?;
        let mut metadata: MediaAsset = serde_json::from_value(value.clone()).map_err(|error| {
            InterchangeError::new(
                ErrorCode::InvalidProject,
                format!("Media index entry {id} is invalid: {error}"),
            )
        })?;
        if !safe_extension(&metadata.ext) {
            return Err(InterchangeError::new(
                ErrorCode::InvalidProject,
                format!("Media {id} has an unsafe extension: {}", metadata.ext),
            ));
        }
        if metadata.id.is_empty() {
            metadata.id = id.clone();
        }
        if metadata.name.is_empty() {
            metadata.name = format!("{id}.{}", metadata.ext);
        }
        let path = media_root.join(format!("{id}.{}", metadata.ext));
        if !path.is_file() {
            return Err(InterchangeError::new(
                ErrorCode::MissingMedia,
                format!("Referenced media {id} is missing at {}.", path.display()),
            ));
        }
        let uri = Url::from_file_path(&path).map_err(|()| {
            InterchangeError::new(
                ErrorCode::SerializationFailed,
                format!("Cannot encode media path as a file URL: {}", path.display()),
            )
        })?;
        let indexed_duration = match metadata
            .duration
            .filter(|duration| duration.is_finite() && *duration > 0.0)
        {
            Some(duration) => {
                let ticks = (duration * TICKS_PER_SECOND as f64).round();
                if !ticks.is_finite() || ticks >= i64::MAX as f64 {
                    return Err(InterchangeError::new(
                        ErrorCode::InvalidProject,
                        format!("Media {id} duration overflows the supported range."),
                    ));
                }
                ticks as i64
            }
            None => 0,
        };
        assets.push(ResolvedAsset {
            id: id.clone(),
            metadata,
            path,
            uri: uri.into(),
            duration_ticks: indexed_duration.max(*required_duration),
            resource_id: format!("r{}", position + 2),
        });
    }
    Ok(assets)
}

fn safe_component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn safe_extension(value: &str) -> bool {
    !value.is_empty() && value.len() <= 8 && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

fn build_storyline<'a>(
    scene: &'a Scene,
    duration: i64,
) -> Result<Vec<StorySegment<'a>>, InterchangeError> {
    let mut clips: Vec<&TimelineElement> = if scene.tracks.main.hidden {
        Vec::new()
    } else {
        scene
            .tracks
            .main
            .elements
            .iter()
            .filter(|element| !element.hidden && matches!(element.kind.as_str(), "video" | "image"))
            .collect()
    };
    clips.sort_by_key(|element| (element.start_time, element.id.as_str()));

    let mut story = Vec::new();
    let mut cursor = 0_i64;
    for clip in clips {
        if clip.start_time < cursor {
            return Err(InterchangeError::new(
                ErrorCode::UnsupportedTimeline,
                format!(
                    "Main-track element {} overlaps the preceding storyline at {} ticks.",
                    clip.id, clip.start_time
                ),
            ));
        }
        if clip.start_time > cursor {
            story.push(StorySegment {
                timeline_start: cursor,
                duration: clip.start_time - cursor,
                source_start: 0,
                kind: StoryKind::Gap,
                connected: Vec::new(),
            });
        }
        story.push(StorySegment {
            timeline_start: clip.start_time,
            duration: clip.duration,
            source_start: clip.trim_start,
            kind: StoryKind::Clip(clip),
            connected: Vec::new(),
        });
        cursor = clip.start_time.checked_add(clip.duration).ok_or_else(|| {
            InterchangeError::new(
                ErrorCode::InvalidProject,
                format!("Main-track element {} timing overflows.", clip.id),
            )
        })?;
    }
    if cursor < duration {
        story.push(StorySegment {
            timeline_start: cursor,
            duration: duration - cursor,
            source_start: 0,
            kind: StoryKind::Gap,
            connected: Vec::new(),
        });
    }
    if story.is_empty() {
        story.push(StorySegment {
            timeline_start: 0,
            duration,
            source_start: 0,
            kind: StoryKind::Gap,
            connected: Vec::new(),
        });
    }
    Ok(story)
}

fn attach_connected_clips(
    scene: &Scene,
    asset_by_id: &HashMap<&str, &ResolvedAsset>,
    story: &mut [StorySegment<'_>],
    issues: &mut Vec<InterchangeIssue>,
) -> Result<(), InterchangeError> {
    let has_solo_track = scene_has_solo_track(scene);
    let exportable_overlay_tracks: Vec<&Track> = scene
        .tracks
        .overlay
        .iter()
        .filter(|track| {
            !track.hidden
                && track.elements.iter().any(|element| {
                    !element.hidden && matches!(element.kind.as_str(), "video" | "image")
                })
        })
        .collect();
    for (track_index, track) in exportable_overlay_tracks.iter().enumerate() {
        for element in &track.elements {
            if element.hidden {
                continue;
            }
            if !matches!(element.kind.as_str(), "video" | "image") {
                continue;
            }
            let asset = asset_for(element, asset_by_id)?;
            let lane =
                i32::try_from(exportable_overlay_tracks.len() - track_index).map_err(|_| {
                    InterchangeError::new(
                        ErrorCode::UnsupportedTimeline,
                        "The overlay track count exceeds the FCPXML lane range.",
                    )
                })?;
            let connection = media_clip_node(
                element,
                asset,
                lane,
                false,
                source_audio_is_enabled(track, element, asset, has_solo_track),
            );
            connect(
                story,
                element.start_time,
                connection,
                issues,
                track,
                element,
            )?;
        }
    }
    for (track_index, track) in scene.tracks.audio.iter().enumerate() {
        if !track_is_audible(track, has_solo_track) {
            continue;
        }
        for element in &track.elements {
            if element.hidden
                || element.kind != "audio"
                || (element.source_type.as_deref() == Some("library") && element.media_id.is_none())
                || element.audio_muted()
            {
                continue;
            }
            let asset = asset_for(element, asset_by_id)?;
            let lane = i32::try_from(track_index + 1)
                .ok()
                .and_then(i32::checked_neg)
                .ok_or_else(|| {
                    InterchangeError::new(
                        ErrorCode::UnsupportedTimeline,
                        "The audio track count exceeds the FCPXML lane range.",
                    )
                })?;
            let connection = media_clip_node(element, asset, lane, true, true);
            connect(
                story,
                element.start_time,
                connection,
                issues,
                track,
                element,
            )?;
        }
    }
    for segment in story {
        segment
            .connected
            .sort_by_key(|connected| (connected.timeline_start, connected.lane));
    }
    Ok(())
}

fn asset_for<'a>(
    element: &TimelineElement,
    asset_by_id: &'a HashMap<&str, &ResolvedAsset>,
) -> Result<&'a ResolvedAsset, InterchangeError> {
    let media_id = element.media_id.as_deref().ok_or_else(|| {
        InterchangeError::new(
            ErrorCode::MissingMedia,
            format!("Element {} has no media id to relink.", element.id),
        )
    })?;
    asset_by_id.get(media_id).copied().ok_or_else(|| {
        InterchangeError::new(
            ErrorCode::MissingMedia,
            format!("No localized media resource exists for {media_id}."),
        )
    })
}

fn media_clip_node(
    element: &TimelineElement,
    asset: &ResolvedAsset,
    lane: i32,
    audio_only: bool,
    source_audio_enabled: bool,
) -> XmlNode {
    let mut node = XmlNode::new("asset-clip")
        .attr("name", asset.metadata.name.clone())
        .attr("ref", asset.resource_id.clone())
        .attr("lane", lane.to_string())
        // Filled with the parent-local value by `connect`.
        .attr("offset", "0s")
        .attr("start", rational_ticks(element.trim_start))
        .attr("duration", rational_ticks(element.duration));
    if audio_only {
        if asset.metadata.kind != "audio" {
            node = node.attr("srcEnable", "audio");
        }
        node = node.attr("audioRole", "dialogue");
    } else if element.kind == "video" && asset.metadata.has_audio {
        node = if source_audio_enabled {
            node.attr("audioRole", "dialogue")
        } else {
            node.attr("srcEnable", "video")
        };
    }
    node
}

fn connect(
    story: &mut [StorySegment<'_>],
    timeline_start: i64,
    mut node: XmlNode,
    issues: &mut Vec<InterchangeIssue>,
    track: &Track,
    element: &TimelineElement,
) -> Result<(), InterchangeError> {
    let mut parent_index = None;
    for (index, segment) in story.iter().enumerate() {
        let segment_end = segment
            .timeline_start
            .checked_add(segment.duration)
            .ok_or_else(|| {
                InterchangeError::new(
                    ErrorCode::InvalidProject,
                    "A storyline segment range overflows the supported range.",
                )
            })?;
        if timeline_start >= segment.timeline_start && timeline_start < segment_end {
            parent_index = Some(index);
            break;
        }
    }
    let Some(parent_index) = parent_index else {
        issues.push(
            InterchangeIssue::new(
                "connection_outside_sequence",
                IssueSeverity::Omitted,
                format!(
                    "Element '{}' starts outside the exported sequence and was omitted.",
                    element.name
                ),
            )
            .on_track(&track.id)
            .on_element(&element.id),
        );
        return Ok(());
    };
    let parent = &mut story[parent_index];
    let relative_start = timeline_start
        .checked_sub(parent.timeline_start)
        .ok_or_else(|| {
            InterchangeError::new(
                ErrorCode::InvalidProject,
                format!("Element {} connection time overflows.", element.id),
            )
        })?;
    let local_offset = parent
        .source_start
        .checked_add(relative_start)
        .ok_or_else(|| {
            InterchangeError::new(
                ErrorCode::InvalidProject,
                format!("Element {} connection time overflows.", element.id),
            )
        })?;
    if let Some((_, offset)) = node
        .attributes
        .iter_mut()
        .find(|(name, _)| *name == "offset")
    {
        *offset = rational_ticks(local_offset);
    }
    let lane = node
        .attributes
        .iter()
        .find(|(name, _)| *name == "lane")
        .and_then(|(_, value)| value.parse().ok())
        .unwrap_or(0);
    parent.connected.push(ConnectedNode {
        timeline_start,
        lane,
        node,
    });
    Ok(())
}

fn attach_markers(
    scene: &Scene,
    story: &mut [StorySegment<'_>],
    issues: &mut Vec<InterchangeIssue>,
) -> Result<(), InterchangeError> {
    for bookmark in &scene.bookmarks {
        if bookmark.time < 0 || bookmark.duration.is_some_and(|duration| duration <= 0) {
            return Err(InterchangeError::new(
                ErrorCode::InvalidProject,
                format!("Bookmark {} has invalid timing.", bookmark.id),
            ));
        }
        if bookmark.scope.as_deref() == Some("clip") {
            let issue = InterchangeIssue::new(
                "clip_bookmark_flattened",
                IssueSeverity::Degraded,
                format!(
                    "Clip bookmark {} was exported as a timeline marker.",
                    bookmark.id
                ),
            )
            .on_element(bookmark.element_id.as_deref().unwrap_or(&bookmark.id));
            issues.push(match bookmark.track_id.as_deref() {
                Some(track_id) => issue.on_track(track_id),
                None => issue,
            });
        }
        let mut parent_index = None;
        for (index, segment) in story.iter().enumerate() {
            let segment_end = segment
                .timeline_start
                .checked_add(segment.duration)
                .ok_or_else(|| {
                    InterchangeError::new(
                        ErrorCode::InvalidProject,
                        "A storyline segment range overflows the supported range.",
                    )
                })?;
            if bookmark.time >= segment.timeline_start && bookmark.time < segment_end {
                parent_index = Some(index);
                break;
            }
        }
        let Some(parent_index) = parent_index else {
            issues.push(InterchangeIssue::new(
                "bookmark_outside_sequence",
                IssueSeverity::Omitted,
                format!(
                    "Bookmark {} falls outside the exported sequence.",
                    bookmark.id
                ),
            ));
            continue;
        };
        let parent = &mut story[parent_index];
        let relative_start = bookmark
            .time
            .checked_sub(parent.timeline_start)
            .ok_or_else(|| {
                InterchangeError::new(
                    ErrorCode::InvalidProject,
                    format!("Bookmark {} timing overflows.", bookmark.id),
                )
            })?;
        let local_start = parent
            .source_start
            .checked_add(relative_start)
            .ok_or_else(|| {
                InterchangeError::new(
                    ErrorCode::InvalidProject,
                    format!("Bookmark {} timing overflows.", bookmark.id),
                )
            })?;
        let marker = XmlNode::new("marker")
            .attr("start", rational_ticks(local_start))
            .optional_attr("duration", bookmark.duration.map(rational_ticks))
            .attr(
                "value",
                bookmark.name.clone().unwrap_or_else(|| "Marker".to_owned()),
            )
            .optional_attr("note", bookmark.note.clone());
        parent.connected.push(ConnectedNode {
            timeline_start: bookmark.time,
            lane: 0,
            node: marker,
        });
    }
    Ok(())
}

fn build_document(
    project: &ProjectDocument,
    scene: &Scene,
    assets: &[ResolvedAsset],
    asset_by_id: &HashMap<&str, &ResolvedAsset>,
    story: &[StorySegment<'_>],
    duration: i64,
    version: FcpxmlVersion,
) -> Result<XmlNode, InterchangeError> {
    let fps = project.settings.fps;
    let canvas = project.settings.canvas_size;
    let mut resources = vec![
        XmlNode::new("format")
            .attr("id", "r1")
            .attr("name", "FFVideoFormatRateUndefined")
            .attr(
                "frameDuration",
                rational(i64::from(fps.denominator), i64::from(fps.numerator)),
            )
            .attr("width", canvas.width.to_string())
            .attr("height", canvas.height.to_string())
            .attr("colorSpace", "1-1-1 (Rec. 709)"),
    ];
    resources.extend(assets.iter().map(|asset| {
        let audio_only = asset.metadata.kind == "audio";
        let node = XmlNode::new("asset")
            .attr("id", asset.resource_id.clone())
            .attr("name", asset.metadata.name.clone())
            .attr("start", "0s")
            .attr("duration", rational_ticks(asset.duration_ticks))
            .attr("hasVideo", if audio_only { "0" } else { "1" })
            .attr(
                "hasAudio",
                if asset.metadata.has_audio || audio_only {
                    "1"
                } else {
                    "0"
                },
            );
        node.child(
            XmlNode::new("media-rep")
                .attr("kind", "original-media")
                .attr("src", asset.uri.clone()),
        )
    }));

    let has_solo_track = scene_has_solo_track(scene);
    let spine_children = story
        .iter()
        .map(|segment| -> Result<XmlNode, InterchangeError> {
            Ok(match &segment.kind {
                StoryKind::Gap => XmlNode::new("gap")
                    .attr("name", "Gap")
                    .attr("offset", rational_ticks(segment.timeline_start))
                    .attr("duration", rational_ticks(segment.duration))
                    .children(
                        segment
                            .connected
                            .iter()
                            .map(|connected| connected.node.clone()),
                    ),
                StoryKind::Clip(element) => {
                    let asset = asset_for(element, asset_by_id)?;
                    let mut node = XmlNode::new("asset-clip")
                        .attr("name", asset.metadata.name.clone())
                        .attr("ref", asset.resource_id.clone())
                        .attr("offset", rational_ticks(segment.timeline_start))
                        .attr("start", rational_ticks(element.trim_start))
                        .attr("duration", rational_ticks(segment.duration));
                    if element.kind == "video" && asset.metadata.has_audio {
                        node = if source_audio_is_enabled(
                            &scene.tracks.main,
                            element,
                            asset,
                            has_solo_track,
                        ) {
                            node.attr("audioRole", "dialogue")
                        } else {
                            node.attr("srcEnable", "video")
                        };
                    }
                    node.children(
                        segment
                            .connected
                            .iter()
                            .map(|connected| connected.node.clone()),
                    )
                }
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let spine = XmlNode::new("spine").children(spine_children);

    let drop_frame = matches!(
        (fps.numerator, fps.denominator),
        (30_000, 1_001) | (60_000, 1_001)
    );
    Ok(XmlNode::new("fcpxml")
        .attr("version", version.as_str())
        .child(XmlNode::new("resources").children(resources))
        .child(
            XmlNode::new("library").child(
                XmlNode::new("event").attr("name", "Moirai Cut").child(
                    XmlNode::new("project")
                        .attr("name", project.metadata.name.clone())
                        .child(
                            XmlNode::new("sequence")
                                .attr("format", "r1")
                                .attr("duration", rational_ticks(duration))
                                .attr("tcStart", "0s")
                                .attr("tcFormat", if drop_frame { "DF" } else { "NDF" })
                                .attr("audioLayout", "stereo")
                                .attr("audioRate", "48k")
                                .child(spine),
                        ),
                ),
            ),
        ))
}

fn collect_loss_issues(scene: &Scene) -> Vec<InterchangeIssue> {
    let mut issues = Vec::new();
    let has_solo_track = scene_has_solo_track(scene);
    let tracks = std::iter::once(&scene.tracks.main)
        .chain(scene.tracks.overlay.iter())
        .chain(scene.tracks.audio.iter());
    for track in tracks {
        if track.hidden && !track.elements.is_empty() {
            issues.push(
                InterchangeIssue::new(
                    "hidden_track_omitted",
                    IssueSeverity::Omitted,
                    format!("Hidden track '{}' was omitted.", track.name),
                )
                .on_track(&track.id),
            );
            continue;
        }
        if track.muted && audio_capable(track) && !track.elements.is_empty() {
            let (code, message) = if track.kind == "audio" {
                (
                    "muted_track_omitted",
                    format!("Muted audio track '{}' was omitted.", track.name),
                )
            } else {
                (
                    "muted_track_audio_omitted",
                    format!(
                        "Source audio on muted video track '{}' was omitted.",
                        track.name
                    ),
                )
            };
            issues.push(
                InterchangeIssue::new(code, IssueSeverity::Omitted, message).on_track(&track.id),
            );
            if track.kind == "audio" {
                continue;
            }
        } else if has_solo_track
            && audio_capable(track)
            && !track.solo
            && !track.elements.is_empty()
        {
            issues.push(
                InterchangeIssue::new(
                    "unsoloed_track_audio_omitted",
                    IssueSeverity::Omitted,
                    format!(
                        "Audio on non-solo track '{}' was omitted while another track is soloed.",
                        track.name
                    ),
                )
                .on_track(&track.id),
            );
            if track.kind == "audio" {
                continue;
            }
        }
        for element in &track.elements {
            if element.hidden {
                issues.push(
                    InterchangeIssue::new(
                        "hidden_element_omitted",
                        IssueSeverity::Omitted,
                        format!("Hidden element '{}' was omitted.", element.name),
                    )
                    .on_track(&track.id)
                    .on_element(&element.id),
                );
                continue;
            }
            if track_is_audible(track, has_solo_track) && element.audio_muted() {
                issues.push(
                    InterchangeIssue::new(
                        "muted_element_audio_omitted",
                        IssueSeverity::Omitted,
                        format!("Muted audio on '{}' was omitted.", element.name),
                    )
                    .on_track(&track.id)
                    .on_element(&element.id),
                );
                if element.kind == "audio" {
                    continue;
                }
            }
            if !matches!(element.kind.as_str(), "video" | "image" | "audio") {
                issues.push(
                    InterchangeIssue::new(
                        format!("unsupported_{}", element.kind),
                        IssueSeverity::Omitted,
                        format!(
                            "{} element '{}' is not represented by the FCPXML v1 adapter.",
                            element.kind, element.name
                        ),
                    )
                    .on_track(&track.id)
                    .on_element(&element.id),
                );
            }
            if element.group_id.is_some() {
                issue_for_optional(
                    &mut issues,
                    track,
                    element,
                    "group_relation_omitted",
                    "Edit-group membership was omitted.",
                    true,
                );
            }
            if element.link_group_id.is_some() {
                issue_for_optional(
                    &mut issues,
                    track,
                    element,
                    "linked_media_relation_omitted",
                    "Linked source relationship was omitted.",
                    true,
                );
            }
            issue_for_optional(
                &mut issues,
                track,
                element,
                "retime_omitted",
                "Retime data was omitted.",
                TimelineElement::has_nonempty_value(&element.retime),
            );
            issue_for_optional(
                &mut issues,
                track,
                element,
                "animations_omitted",
                "Keyframe animations were omitted.",
                TimelineElement::has_nonempty_value(&element.animations),
            );
            issue_for_optional(
                &mut issues,
                track,
                element,
                "motion_tracking_omitted",
                "Motion tracking data was omitted.",
                TimelineElement::has_nonempty_value(&element.motion_tracking),
            );
            issue_for_optional(
                &mut issues,
                track,
                element,
                "stabilization_omitted",
                "Stabilization data was omitted.",
                TimelineElement::has_nonempty_value(&element.stabilization),
            );
            if !element.effects.is_empty() {
                issue_for_optional(
                    &mut issues,
                    track,
                    element,
                    "effects_omitted",
                    "Effects were omitted.",
                    true,
                );
            }
            if !element.masks.is_empty() {
                issue_for_optional(
                    &mut issues,
                    track,
                    element,
                    "masks_omitted",
                    "Masks were omitted.",
                    true,
                );
            }
            if non_default_params(&element.kind, &element.params) {
                issue_for_optional(
                    &mut issues,
                    track,
                    element,
                    "static_params_omitted",
                    "Static transform, appearance, or audio parameters were omitted.",
                    true,
                );
            }
            if element.trim_end != 0 {
                // trimStart + duration is authoritative in the exchange model.
                issues.push(
                    InterchangeIssue::new(
                        "trim_end_recomputed",
                        IssueSeverity::Info,
                        format!(
                            "trimEnd for '{}' was recomputed from source range.",
                            element.name
                        ),
                    )
                    .on_track(&track.id)
                    .on_element(&element.id),
                );
            }
            if let Some(source_duration) = element.source_duration
                && source_end(element).is_ok_and(|source_end| source_end > source_duration)
            {
                issues.push(
                    InterchangeIssue::new(
                        "source_range_overrun",
                        IssueSeverity::Degraded,
                        format!(
                            "'{}' extends past its recorded source duration.",
                            element.name
                        ),
                    )
                    .on_track(&track.id)
                    .on_element(&element.id),
                );
            }
            if element.kind == "audio"
                && element.source_type.as_deref() == Some("library")
                && element.source_url.is_some()
            {
                // The omission itself is added while media references are resolved.
            }
        }
    }
    issues
}

fn issue_for_optional(
    issues: &mut Vec<InterchangeIssue>,
    track: &Track,
    element: &TimelineElement,
    code: &str,
    message: &str,
    present: bool,
) {
    if present {
        issues.push(
            InterchangeIssue::new(
                code,
                IssueSeverity::Degraded,
                format!("{} Element: '{}'.", message, element.name),
            )
            .on_track(&track.id)
            .on_element(&element.id),
        );
    }
}

#[derive(Clone, Copy)]
enum DefaultParamValue {
    Number(f64),
    Bool(bool),
    Text(&'static str),
}

fn default_param(kind: &str, key: &str) -> Option<DefaultParamValue> {
    let visual = matches!(kind, "video" | "image" | "text" | "sticker" | "graphic");
    let media_geometry = matches!(kind, "video" | "image" | "graphic");
    let audio = matches!(kind, "video" | "audio");
    let text = kind == "text";

    match key {
        "transform.positionX" | "transform.positionY" | "transform.rotate" if visual => {
            Some(DefaultParamValue::Number(0.0))
        }
        "transform.scaleX" | "transform.scaleY" | "opacity" if visual => {
            Some(DefaultParamValue::Number(1.0))
        }
        "blendMode" if visual => Some(DefaultParamValue::Text("normal")),
        "geometry.mirrorX" | "geometry.mirrorY" | "geometry.shadow.enabled" if media_geometry => {
            Some(DefaultParamValue::Bool(false))
        }
        "crop.left"
        | "crop.right"
        | "crop.top"
        | "crop.bottom"
        | "geometry.cornerRadius"
        | "geometry.shadow.blur"
        | "geometry.shadow.offsetX"
        | "geometry.stroke.width"
            if media_geometry =>
        {
            Some(DefaultParamValue::Number(0.0))
        }
        "geometry.shadow.offsetY" if media_geometry => Some(DefaultParamValue::Number(8.0)),
        "geometry.shadow.color" if media_geometry => Some(DefaultParamValue::Text("#00000080")),
        "geometry.stroke.color" if media_geometry => Some(DefaultParamValue::Text("#ffffff")),
        "volume" | "audioFadeIn" | "audioFadeOut" if audio => Some(DefaultParamValue::Number(0.0)),
        "muted" if audio => Some(DefaultParamValue::Bool(false)),
        "content" if text => Some(DefaultParamValue::Text("Default text")),
        "fontFamily" if text => Some(DefaultParamValue::Text("Arial")),
        "fontSize" if text => Some(DefaultParamValue::Number(15.0)),
        "color" if text => Some(DefaultParamValue::Text("#ffffff")),
        "textAlign" if text => Some(DefaultParamValue::Text("center")),
        "fontWeight" | "fontStyle" if text => Some(DefaultParamValue::Text("normal")),
        "textDecoration" if text => Some(DefaultParamValue::Text("none")),
        "letterSpacing"
        | "background.cornerRadius"
        | "background.offsetX"
        | "background.offsetY"
            if text =>
        {
            Some(DefaultParamValue::Number(0.0))
        }
        "lineHeight" if text => Some(DefaultParamValue::Number(1.2)),
        "background.enabled" if text => Some(DefaultParamValue::Bool(false)),
        "background.color" if text => Some(DefaultParamValue::Text("#000000")),
        "background.paddingX" if text => Some(DefaultParamValue::Number(30.0)),
        "background.paddingY" if text => Some(DefaultParamValue::Number(42.0)),
        _ => None,
    }
}

fn matches_default(value: &Value, expected: DefaultParamValue) -> bool {
    match expected {
        DefaultParamValue::Number(expected) => value
            .as_f64()
            .is_some_and(|actual| (actual - expected).abs() <= 0.000_001),
        DefaultParamValue::Bool(expected) => value.as_bool() == Some(expected),
        DefaultParamValue::Text(expected) => value.as_str() == Some(expected),
    }
}

fn non_default_params(kind: &str, params: &Value) -> bool {
    let Some(params) = params.as_object() else {
        return !params.is_null();
    };
    params.iter().any(|(key, value)| {
        default_param(kind, key).is_none_or(|expected| !matches_default(value, expected))
            && !value.is_null()
    })
}

fn rational_ticks(ticks: i64) -> String {
    rational(ticks, TICKS_PER_SECOND)
}

fn rational(numerator: i64, denominator: i64) -> String {
    if numerator == 0 {
        return "0s".to_owned();
    }
    let divisor = gcd(numerator, denominator);
    let numerator = numerator / divisor;
    let denominator = denominator / divisor;
    if denominator == 1 {
        format!("{numerator}s")
    } else {
        format!("{numerator}/{denominator}s")
    }
}

fn gcd(left: i64, right: i64) -> i64 {
    let mut left = left.unsigned_abs();
    let mut right = right.unsigned_abs();
    while right != 0 {
        (left, right) = (right, left % right);
    }
    i64::try_from(left.max(1)).unwrap_or(1)
}

fn serialize_xml(node: &XmlNode, depth: usize) -> Result<String, InterchangeError> {
    let indentation = "  ".repeat(depth);
    let mut attributes = String::new();
    for (name, value) in &node.attributes {
        if let Some(character) = value.chars().find(|character| !is_xml_1_0_char(*character)) {
            return Err(InterchangeError::new(
                ErrorCode::SerializationFailed,
                format!(
                    "Cannot serialize XML 1.0: <{}> attribute '{}' contains forbidden code point U+{:04X}.",
                    node.name, name, character as u32
                ),
            ));
        }
        attributes.push_str(&format!(" {name}=\"{}\"", escape_xml(value)));
    }
    if node.children.is_empty() {
        return Ok(format!("{indentation}<{}{attributes}/>", node.name));
    }
    let children = node
        .children
        .iter()
        .map(|child| serialize_xml(child, depth + 1))
        .collect::<Result<Vec<_>, _>>()?
        .join("\n");
    Ok(format!(
        "{indentation}<{}{attributes}>\n{children}\n{indentation}</{}>",
        node.name, node.name
    ))
}

fn is_xml_1_0_char(character: char) -> bool {
    matches!(
        character as u32,
        0x9 | 0xA | 0xD | 0x20..=0xD7FF | 0xE000..=0xFFFD | 0x10000..=0x10FFFF
    )
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[allow(dead_code)]
fn object(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}
