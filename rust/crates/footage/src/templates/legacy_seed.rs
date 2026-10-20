use super::legacy_model::*;
use anyhow::Result;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Observation {
    pub id: u64,
    pub name: String,
    pub accent: String,
    pub tags: Vec<String>,
    pub roles: Vec<ElementKind>,
    pub layouts: Vec<LayoutMode>,
    pub note: String,
}
pub fn observations() -> Vec<Observation> {
    serde_json::from_str(include_str!("observations.json")).expect("validated bundled observations")
}
fn region(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        x,
        y,
        width,
        height,
    }
}
pub fn from_observation(o: Observation) -> Result<Template> {
    let reference = format!("reference-{:02}", o.id);
    let observed = Evidence {
        reference_id: Some(reference.clone()),
        start_seconds: None,
        end_seconds: None,
        status: EvidenceStatus::Observed,
        description: o.note.clone(),
    };
    let authored = Evidence {
        reference_id: Some(reference),
        start_seconds: None,
        end_seconds: None,
        status: EvidenceStatus::Authored,
        description:
            "根据参考序列重建的可编辑参数；颜色、字号和关键帧为设计估计，不是原站工程参数。".into(),
    };
    let mut body = Style {
        id: "body".into(),
        description: "主字幕，清晰阅读优先".into(),
        font_family: "PingFang SC".into(),
        font_size: 48.0,
        weight: 700,
        italic: false,
        fill: "#FFFFFF".into(),
        stroke: "#202020".into(),
        stroke_width: 2.0,
        background: None,
        shadow: Some(Shadow {
            color: "#000000".into(),
            opacity: 0.5,
            blur: 3.0,
            x: 1.0,
            y: 3.0,
        }),
        line_height: 1.15,
        max_lines: 2,
    };
    if o.roles.contains(&ElementKind::Backplate) {
        body.background = Some("#242424".into());
    }
    let mut title = body.clone();
    title.id = "title".into();
    title.description = "开场标题".into();
    title.font_size = 64.0;
    title.fill = o.accent.clone();
    let mut accent = body.clone();
    accent.id = "accent".into();
    accent.description = "关键词和花字强调".into();
    accent.font_size = 60.0;
    accent.fill = o.accent;
    let mut translation = body.clone();
    translation.id = "translation".into();
    translation.description = "由真实翻译内容绑定的第二语言字幕".into();
    translation.font_size = 25.0;
    translation.weight = 400;
    let mut elements = vec![];
    let mut resources = vec![];
    for (index, kind) in [ElementKind::Title, ElementKind::Subtitle]
        .into_iter()
        .chain(o.roles)
        .enumerate()
    {
        let id = format!("element-{index}");
        let is_resource = matches!(
            kind,
            ElementKind::Icon
                | ElementKind::Sticker
                | ElementKind::Particle
                | ElementKind::Broll
                | ElementKind::SubjectOutline
                | ElementKind::Frame
        );
        let (binding, style, rect, anchor, intents) = match kind {
            ElementKind::Title => (
                Binding::Title,
                "title",
                region(0.06, 0.035, 0.88, 0.14),
                Anchor::VideoStart,
                vec![],
            ),
            ElementKind::Subtitle => (
                Binding::Sentence,
                "body",
                region(0.08, 0.69, 0.84, 0.12),
                Anchor::PhraseStart,
                vec![],
            ),
            ElementKind::Translation => (
                Binding::Translation,
                "translation",
                region(0.08, 0.82, 0.84, 0.06),
                Anchor::PhraseStart,
                vec![],
            ),
            ElementKind::SpeakerLabel => (
                Binding::Speaker,
                "translation",
                region(0.03, 0.4, 0.23, 0.12),
                Anchor::VideoStart,
                vec![],
            ),
            ElementKind::Metric => (
                Binding::Keyword,
                "accent",
                region(0.08, 0.55, 0.84, 0.12),
                Anchor::KeywordStart,
                vec![Intent::Metric],
            ),
            ElementKind::ListItem => (
                Binding::Sentence,
                "translation",
                region(0.02, 0.45, 0.3, 0.18),
                Anchor::PhraseStart,
                vec![Intent::List],
            ),
            ElementKind::Backplate => (
                Binding::Literal,
                "body",
                region(0.06, 0.68, 0.88, 0.14),
                Anchor::PhraseStart,
                vec![],
            ),
            ElementKind::Underline | ElementKind::CircleAnnotation | ElementKind::Arrow => (
                Binding::Literal,
                "accent",
                region(0.1, 0.64, 0.26, 0.035),
                Anchor::KeywordStart,
                vec![Intent::Emphasis, Intent::Metric],
            ),
            _ => (
                Binding::Keyword,
                "accent",
                region(0.69, 0.45, 0.28, 0.15),
                Anchor::KeywordStart,
                vec![Intent::Emphasis, Intent::Question, Intent::CallToAction],
            ),
        };
        let resource_id = is_resource.then(|| format!("resource-{index}"));
        if let Some(id) = &resource_id {
            resources.push(Resource {
                id: id.clone(),
                kind: kind.clone(),
                description: format!("参考中 {:?} 的可替换素材，需要绑定独立资源或分割结果", kind),
                asset_id: None,
                tags: o.tags.clone(),
                status: EvidenceStatus::Unverified,
            });
        }
        let max_seconds = if kind == ElementKind::Title { 3.0 } else { 4.0 };
        let motions = if matches!(
            kind,
            ElementKind::Emphasis | ElementKind::Callout | ElementKind::Metric
        ) {
            vec![Motion {
                property: MotionProperty::Scale,
                keys: vec![
                    MotionKey {
                        time: 0.0,
                        value: 0.85,
                        easing: Easing::EaseOut,
                    },
                    MotionKey {
                        time: 0.18,
                        value: 1.06,
                        easing: Easing::EaseInOut,
                    },
                    MotionKey {
                        time: 0.35,
                        value: 1.0,
                        easing: Easing::Linear,
                    },
                    MotionKey {
                        time: 1.0,
                        value: 1.0,
                        easing: Easing::Linear,
                    },
                ],
            }]
        } else {
            vec![]
        };
        let exclusive_group = matches!(
            kind,
            ElementKind::Emphasis
                | ElementKind::Callout
                | ElementKind::Metric
                | ElementKind::Icon
                | ElementKind::Sticker
        )
        .then(|| "accent".into());
        elements.push(Element {
            id,
            description: format!("{} / {:?}", o.name, kind),
            binding: binding.clone(),
            literal: (binding == Binding::Literal).then(|| "decoration".into()),
            style_id: Some(style.into()),
            resource_id,
            region: rect,
            z: if kind == ElementKind::Backplate {
                5
            } else {
                20
            },
            timing: Timing {
                anchor,
                offset_seconds: 0.0,
                min_seconds: 0.4,
                max_seconds,
            },
            motions,
            intents,
            priority: if kind == ElementKind::Subtitle {
                100
            } else {
                50
            },
            exclusive_group,
            evidence: vec![observed.clone(), authored.clone()],
            kind,
        });
    }
    // Audio is modeled even when the reference is silent, without fabricating an extracted asset.
    for (i, kind) in [
        ("sfx", ElementKind::SoundEffect),
        ("music", ElementKind::BackgroundMusic),
    ] {
        resources.push(Resource {
            id: i.into(),
            kind: kind.clone(),
            description: if i == "sfx" {
                "语义强调音效，需绑定审核通过的音效"
            } else {
                "低音量背景音乐，需绑定独立音乐文件"
            }
            .into(),
            asset_id: None,
            tags: vec![],
            status: EvidenceStatus::Unverified,
        });
        elements.push(Element {
            id: i.into(),
            kind,
            description: format!("可替换{i}音频槽"),
            binding: Binding::Literal,
            literal: Some(i.into()),
            style_id: None,
            resource_id: Some(i.into()),
            region: region(0.0, 0.0, 1.0, 1.0),
            z: 0,
            timing: Timing {
                anchor: if i == "sfx" {
                    Anchor::KeywordStart
                } else {
                    Anchor::VideoStart
                },
                offset_seconds: 0.0,
                min_seconds: 0.0,
                max_seconds: if i == "sfx" { 0.6 } else { 600.0 },
            },
            motions: vec![],
            intents: if i == "sfx" {
                vec![Intent::Emphasis, Intent::Metric, Intent::CallToAction]
            } else {
                vec![]
            },
            priority: 30,
            exclusive_group: None,
            evidence: vec![Evidence {
                reference_id: None,
                start_seconds: None,
                end_seconds: None,
                status: EvidenceStatus::Authored,
                description: "声音槽属于模板生产模型；不代表参考视频中一定含有此声音。".into(),
            }],
        });
    }
    let layouts = o
        .layouts
        .into_iter()
        .enumerate()
        .map(|(i, mode)| {
            let inset = matches!(mode, LayoutMode::CircleInset | LayoutMode::PictureInPicture);
            Layout {
                id: format!("layout-{i}"),
                description: format!("{:?}", mode),
                mode,
                video_region: if inset {
                    region(0.15, 0.15, 0.7, 0.5)
                } else {
                    region(0.0, 0.0, 1.0, 1.0)
                },
                caption_region: region(0.08, 0.69, 0.84, 0.12),
                secondary: None,
                safe_regions: vec![region(0.35, 0.2, 0.3, 0.22)],
                intents: if i == 0 {
                    vec![Intent::Neutral, Intent::Explanation]
                } else {
                    vec![Intent::Emphasis, Intent::Question, Intent::Metric]
                },
                transition: TransitionKind::Cut,
                transition_seconds: 0.0,
                evidence: vec![observed.clone(), authored.clone()],
            }
        })
        .collect();
    let template = Template {
        schema_version: "moirai.template.v1".into(),
        id: format!("kaipai-study-{:02}", o.id),
        revision: 1,
        name: o.name,
        description: o.note,
        tags: o.tags,
        canvas: Canvas {
            width: 1080,
            height: 1920,
            fps: 30,
        },
        elements,
        styles: vec![body, title, accent, translation],
        resources,
        layouts,
        rhythm: RhythmRules::default(),
        evidence: vec![observed, authored],
    };
    template.validate()?;
    Ok(template)
}
