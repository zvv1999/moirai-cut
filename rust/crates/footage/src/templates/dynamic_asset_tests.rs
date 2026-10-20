use super::{composition_tests, dynamic_asset::*, model::*};
use crate::store::Store;
use crate::templates::composition;
use serde_json::json;
use std::collections::BTreeMap;

#[test]
fn transparent_text_does_not_hide_a_later_decoration_in_preview_selection() {
    let mut definition = create(Create {
        name: "Mixed".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::DecorativeText),
    })
    .unwrap();
    let mut decoration = None;
    for layer in &mut definition.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            let mut graphic = element.clone();
            graphic.id = "visible-decoration".into();
            graphic.features.representation = Representation::Rectangle;
            graphic.timing.offset_seconds = 0.7;
            decoration = Some(Layer {
                parent_id: layer.parent_id.clone(),
                content: LayerContent::Element { element: graphic },
            });
            for motion in &mut element.motions {
                if matches!(motion.property, MotionProperty::Opacity) {
                    for key in &mut motion.keys {
                        key.value = 0.;
                    }
                }
            }
        }
    }
    definition.layers.push(decoration.unwrap());
    let compiled = preview(Preview {
        definition,
        inputs: BTreeMap::new(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    let time = compiled["previewTimeSeconds"].as_f64().unwrap();
    assert!(time > 0.7 && time < 2.);
    let graphic = compiled["tracks"]["overlay"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|track| track["elements"].as_array().unwrap())
        .find(|e| e["type"] == "graphic")
        .unwrap();
    let local = (time * crate::domain::TICKS as f64).round() as i64
        - graphic["startTime"].as_i64().unwrap();
    assert!(
        crate::templates::treatments::sample(&graphic["animations"]["opacity"], local, 1.) > 0.99
    );
}

#[test]
fn graphic_only_preview_selects_visible_frame_instead_of_transparent_start() {
    let definition = create(Create {
        name: "Decoration".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    assert!(definition.inputs.is_empty());
    assert!(definition.purposes == vec![CreatePurpose::Decoration]);
    for layer in &definition.layers {
        if let LayerContent::Element { element } = &layer.content {
            assert!(element.features.representation == Representation::Rectangle);
            assert!((element.region.width - element.region.height).abs() < 1e-9);
        }
    }
    let compiled = preview(Preview {
        definition,
        inputs: BTreeMap::new(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    let time = compiled["previewTimeSeconds"].as_f64().unwrap();
    assert!(time > 0. && time < 2.);
    let element = &compiled["tracks"]["overlay"][0]["elements"][0];
    assert_eq!(element["type"], "graphic");
    let local = (time * crate::domain::TICKS as f64).round() as i64
        - element["startTime"].as_i64().unwrap();
    assert!(
        crate::templates::treatments::sample(&element["animations"]["opacity"], local, 1.) > 0.99
    );
}

#[test]
fn preview_frame_is_visible_inside_keyword_interval() {
    let definition = create(Create {
        name: "Poster".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Keyword),
    })
    .unwrap();
    let compiled = preview(Preview {
        definition,
        inputs: BTreeMap::new(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    let time = compiled["previewTimeSeconds"].as_f64().unwrap();
    let text = compiled["tracks"]["overlay"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|track| track["elements"].as_array().unwrap())
        .find(|e| e["type"] == "text")
        .unwrap();
    let local =
        (time * crate::domain::TICKS as f64).round() as i64 - text["startTime"].as_i64().unwrap();
    assert!(local >= 0 && local < text["duration"].as_i64().unwrap());
    assert!(crate::templates::treatments::sample(&text["animations"]["opacity"], local, 1.) > 0.99);
}

#[test]
fn numeric_font_weights_survive_compilation() {
    let typography = super::treatments::capabilities()["typography"].clone();
    assert_eq!(typography["fontWeights"], "integer_100_to_900");
    assert_eq!(
        typography["fontWeightRange"],
        json!({"min":100,"max":900,"step":1})
    );
    let schema = serde_json::to_value(schemars::schema_for!(Style)).unwrap();
    assert_eq!(schema["properties"]["weight"]["minimum"], 100);
    assert_eq!(schema["properties"]["weight"]["maximum"], 900);
    for weight in [100, 400, 550, 600, 800, 900] {
        let mut definition = fixture();
        for style in &mut definition.styles {
            style.weight = weight;
        }
        let compiled = preview(Preview {
            definition,
            inputs: BTreeMap::new(),
            duration_seconds: 2.,
            example: None,
        })
        .unwrap();
        assert!(
            !serde_json::to_string(&compiled)
                .unwrap()
                .contains("font_weight_quantized")
        );
        let texts: Vec<_> = compiled["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|track| track["elements"].as_array().unwrap())
            .filter(|element| element["type"] == "text")
            .collect();
        assert!(!texts.is_empty());
        for text in texts {
            assert_eq!(text["params"]["fontWeight"], json!(weight.to_string()));
        }
    }
    for weight in [99, 901] {
        let mut definition = fixture();
        for style in &mut definition.styles {
            style.weight = weight;
        }
        assert!(definition.project(&BTreeMap::new()).is_err());
    }
}

#[test]
fn duplicate_style_preserves_graph_and_saves_independently() {
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    let source = save(
        &db,
        Save {
            definition: fixture(),
            base_revision: 0,
            idempotency_key: "source-copy-test".into(),
        },
    )
    .unwrap();
    let mut edited = source.clone();
    edited.purposes = vec![CreatePurpose::Keyword, CreatePurpose::DecorativeText];
    let draft = duplicate(Duplicate {
        definition: edited.clone(),
        name: "Independent style".into(),
    })
    .unwrap();
    assert_ne!(draft.id, source.id);
    assert_eq!(draft.revision, 0);
    let mut expected = serde_json::to_value(edited).unwrap();
    expected["id"] = json!(draft.id);
    expected["revision"] = json!(0);
    expected["name"] = json!("Independent style");
    assert_eq!(serde_json::to_value(&draft).unwrap(), expected);
    let saved = save(
        &db,
        Save {
            definition: draft,
            base_revision: 0,
            idempotency_key: "independent-copy-test".into(),
        },
    )
    .unwrap();
    assert_eq!(saved.revision, 1);
    let original: Definition = db.get(RECORD, &source.id).unwrap();
    assert_eq!(
        serde_json::to_value(original).unwrap(),
        serde_json::to_value(&source).unwrap()
    );
    assert!(
        duplicate(Duplicate {
            definition: source,
            name: " ".into()
        })
        .is_err()
    );
}

#[test]
fn discovery_purposes_round_trip_without_changing_execution() {
    let mut definition = fixture();
    let baseline = serde_json::to_value(definition.project(&BTreeMap::new()).unwrap()).unwrap();
    definition.purposes = vec![CreatePurpose::Keyword, CreatePurpose::DecorativeText];
    let encoded = serde_json::to_value(&definition).unwrap();
    assert_eq!(encoded["purposes"], json!(["keyword", "decorative_text"]));
    let restored: Definition = serde_json::from_value(encoded.clone()).unwrap();
    assert!(restored.purposes == definition.purposes);
    assert_eq!(
        serde_json::to_value(restored.project(&BTreeMap::new()).unwrap()).unwrap(),
        baseline
    );
    let mut legacy = encoded.clone();
    legacy.as_object_mut().unwrap().remove("purposes");
    assert!(
        serde_json::from_value::<Definition>(legacy)
            .unwrap()
            .purposes
            .is_empty()
    );
    let mut invalid = encoded;
    invalid["purposes"] = json!(["made_up"]);
    assert!(serde_json::from_value::<Definition>(invalid).is_err());
}

#[test]
fn creation_purposes_have_executable_content_bindings_without_fixed_speech_timing() {
    for (purpose, binding, anchor) in [
        (
            CreatePurpose::DecorativeText,
            Binding::Literal,
            Anchor::VideoStart,
        ),
        (
            CreatePurpose::Keyword,
            Binding::Keyword,
            Anchor::KeywordStart,
        ),
        (CreatePurpose::Caption, Binding::Sentence, Anchor::CueStart),
    ] {
        let definition = create(Create {
            name: "Style".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: Some(purpose),
        })
        .unwrap();
        assert!(definition.purposes == vec![purpose]);
        let projected = definition.project(&BTreeMap::new()).unwrap();
        let element = &projected.elements[0];
        assert_eq!(element.binding, binding);
        assert_eq!(
            serde_json::to_value(&element.timing.anchor).unwrap(),
            serde_json::to_value(anchor).unwrap()
        );
        assert!(element.motion_timing.is_some());
        if binding != Binding::Literal {
            assert_eq!(element.timing.max_seconds, 600.0);
        }
        for duration in [0.5, 3.0] {
            let preview = preview(Preview {
                definition: definition.clone(),
                inputs: BTreeMap::new(),
                duration_seconds: duration,
                example: None,
            })
            .unwrap();
            assert!(!preview["tracks"]["overlay"].as_array().unwrap().is_empty());
        }
        if matches!(purpose, CreatePurpose::Caption) {
            assert!(definition.treatments.iter().any(|t| matches!(
                t.operation,
                composition::TreatmentOperation::TextHighlight {
                    mode: composition::TextHighlightMode::ActiveWord,
                    ..
                }
            )));
        }
    }
    let legacy = create(
        serde_json::from_value(
            json!({"name":"Legacy","canvas":{"width":720,"height":720,"fps":30}}),
        )
        .unwrap(),
    )
    .unwrap();
    assert!(
        legacy.project(&BTreeMap::new()).unwrap().elements[0]
            .motion_timing
            .is_none()
    );
}

#[test]
fn new_style_roles_do_not_inherit_the_subtitle_seed() {
    for (purpose, role) in [
        (CreatePurpose::Keyword, Some(Role::Emphasis)),
        (CreatePurpose::Caption, Some(Role::Subtitle)),
        (CreatePurpose::Decoration, Some(Role::Decoration)),
        (CreatePurpose::DecorativeText, None),
    ] {
        let definition = create(Create {
            name: "Semantic defaults".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: Some(purpose),
        })
        .unwrap();
        let projected = definition.project(&BTreeMap::new()).unwrap();
        assert_eq!(projected.elements[0].features.role, role);
        // Discovery categories can be combined without rewriting the authored role.
        let mut reclassified = definition.clone();
        reclassified.purposes = vec![CreatePurpose::Keyword, CreatePurpose::DecorativeText];
        assert_eq!(
            reclassified.project(&BTreeMap::new()).unwrap().elements[0]
                .features
                .role,
            role
        );
    }
}

#[test]
fn standalone_preview_uses_example_inputs_without_audio_or_mutating_definition() {
    let template = super::element_edit::create(super::element_edit::Create {
        name: "Preview".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
    })
    .unwrap();
    let definition = draft(template).unwrap();
    let before = serde_json::to_value(&definition).unwrap();
    for duration in [0.5, 3.] {
        let result = preview(Preview {
            definition: definition.clone(),
            inputs: BTreeMap::from([("text".into(), "New words".into())]),
            duration_seconds: duration,
            example: None,
        })
        .unwrap();
        assert_eq!(result["tracks"]["audio"], json!([]));
        let elements = result["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|track| track["elements"].as_array().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(elements.len(), 1);
        assert_eq!(elements[0]["params"]["content"], "New words");
        assert!(
            elements[0]["duration"].as_i64().unwrap()
                <= (duration * crate::domain::TICKS as f64).round() as i64
        );
        assert_eq!(serde_json::to_value(&definition).unwrap(), before);
    }
    assert!(
        preview(Preview {
            definition,
            inputs: BTreeMap::new(),
            duration_seconds: 0.,
            example: None
        })
        .is_err()
    );
}

#[test]
fn fixed_envelope_survives_preview_and_saved_asset_projection() {
    use super::dynamic_asset_edit::{Edit, Operation, edit};
    let definition = create(Create {
        name: "Envelope".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    let sentence = edit(Edit {
        definition,
        operation: Operation::TextPresentation {
            layer_id: "headline".into(),
            binding: Binding::Sentence,
            highlight: None,
        },
    })
    .unwrap();
    let value = edit(Edit {
        definition: serde_json::from_value(sentence["definition"].clone()).unwrap(),
        operation: Operation::Envelope {
            layer_id: "headline".into(),
            entrance: super::element_edit::Entrance::Pop,
            enter_seconds: 0.2,
            exit_seconds: 0.15,
        },
    })
    .unwrap();
    let definition: Definition = serde_json::from_value(value["definition"].clone()).unwrap();
    assert!(
        definition.project(&BTreeMap::new()).unwrap().elements[0]
            .motion_timing
            .is_some()
    );
    for duration in [0.125, 1., 4.] {
        let output = preview(Preview {
            definition: definition.clone(),
            inputs: BTreeMap::new(),
            duration_seconds: duration,
            example: None,
        })
        .unwrap();
        let clip = &output["tracks"]["overlay"][0]["elements"][0];
        let keys = clip["animations"]["opacity"]["keys"].as_array().unwrap();
        let times: Vec<_> = keys
            .iter()
            .map(|key| key["time"].as_i64().unwrap())
            .collect();
        assert!(times.windows(2).all(|pair| pair[0] < pair[1]));
        let length = clip["duration"].as_i64().unwrap();
        assert_eq!(times[0], 0);
        assert_eq!(*times.last().unwrap(), length);
        if duration >= 1. {
            assert_eq!(times[1], 24000);
            assert_eq!(times[times.len() - 2], length - 18000);
        } else {
            assert_eq!(times.len(), 3);
            assert!((times[1] as f64 / length as f64 - 4. / 7.).abs() < 0.001);
        }
    }
    assert_eq!(
        serde_json::to_value(&definition).unwrap(),
        value["definition"]
    );
}

#[test]
fn timed_text_preview_schedules_keyword_and_active_word_styles_from_examples() {
    use super::{
        composition::TextHighlightMode,
        dynamic_asset_edit::{self, Edit, Highlight, Operation},
    };
    let definition = draft(
        super::element_edit::create(super::element_edit::Create {
            name: "Timed".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
        })
        .unwrap(),
    )
    .unwrap();
    for (binding, mode) in [
        (Binding::Keyword, TextHighlightMode::Keyword),
        (Binding::Sentence, TextHighlightMode::ActiveWord),
    ] {
        let keyword_only = binding == Binding::Keyword;
        let definition = create(Create {
            name: "Timed".into(),
            canvas: definition.canvas.clone(),
            purpose: Some(if keyword_only {
                CreatePurpose::Keyword
            } else {
                CreatePurpose::Caption
            }),
        })
        .unwrap();
        let value = dynamic_asset_edit::edit(Edit {
            definition: definition.clone(),
            operation: Operation::TextPresentation {
                layer_id: "headline".into(),
                binding,
                highlight: Some(Highlight {
                    mode,
                    color: "#FFE064".into(),
                    stroke: None,
                }),
            },
        })
        .unwrap();
        let styled: Definition = serde_json::from_value(value["definition"].clone()).unwrap();
        for duration in [1., 4.] {
            let result = preview(Preview {
                definition: styled.clone(),
                inputs: BTreeMap::new(),
                duration_seconds: duration,
                example: Some(PreviewExample {
                    intent: None,
                    text: "让重点表达更清楚".into(),
                    keyword: "重点".into(),
                    keyword_occurrence: 0,
                    layout_phrases: vec![],
                }),
            })
            .unwrap();
            assert_eq!(result["example"]["timingSource"], "synthetic_example");
            assert_eq!(result["tracks"]["audio"], json!([]));
            let clips: Vec<_> = result["tracks"]["overlay"]
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|track| track["elements"].as_array().unwrap())
                .collect();
            assert_eq!(clips.len(), 1);
            let clip = clips[0];
            assert_eq!(
                clip["params"]["content"],
                if keyword_only {
                    "重点"
                } else {
                    "让重点表达更清楚"
                }
            );
            assert_eq!(clip["params"]["text.highlightColor"], "#FFE064");
            if keyword_only {
                assert!(
                    (clip["startTime"].as_f64().unwrap() / crate::domain::TICKS as f64
                        - duration * 0.2)
                        .abs()
                        < 0.0001
                );
            } else {
                assert!(
                    (clip["duration"].as_f64().unwrap() / crate::domain::TICKS as f64
                        - duration * 0.8)
                        .abs()
                        < 0.0001
                );
                let keys = clip["animations"]["text.highlightRange"]["keys"]
                    .as_array()
                    .unwrap();
                assert!(keys.len() >= 8);
                assert_ne!(keys[0]["value"], keys[1]["value"]);
            }
        }
        assert_eq!(serde_json::to_value(&styled).unwrap(), value["definition"]);
        let restored = dynamic_asset_edit::edit(Edit {
            definition: styled,
            operation: Operation::TextPresentation {
                layer_id: "headline".into(),
                binding: Binding::Literal,
                highlight: None,
            },
        })
        .unwrap();
        assert!(
            restored["definition"]["applications"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
}

#[test]
fn preview_keyword_selection_is_explicit_and_respects_unicode_word_boundaries() {
    let definition = draft(
        super::element_edit::create(super::element_edit::Create {
            name: "Example".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
        })
        .unwrap(),
    )
    .unwrap();
    for (text, keyword, occurrence, valid) in [
        ("one two one", "one", 1, true),
        ("one two one", "one", 2, false),
        ("重点重点", "重点", 1, true),
        ("one two", "on", 0, false),
        ("hello", "missing", 0, false),
        ("", "", 0, false),
    ] {
        let result = preview(Preview {
            definition: definition.clone(),
            inputs: BTreeMap::new(),
            duration_seconds: 2.,
            example: Some(PreviewExample {
                intent: None,
                text: text.into(),
                keyword: keyword.into(),
                keyword_occurrence: occurrence,
                layout_phrases: vec![],
            }),
        });
        assert_eq!(result.is_ok(), valid, "{text}, {keyword}: {result:?}");
    }
}

fn fixture() -> Definition {
    let mut template: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    let mut element = template.elements.remove(0);
    element.binding = Binding::Literal;
    element.literal = Some("Example".into());
    element.region = Rect {
        x: 0.1,
        y: 0.2,
        width: 0.6,
        height: 0.5,
    };
    Definition {
        schema_version: SCHEMA.into(),
        id: "impact".into(),
        revision: 0,
        name: "Impact".into(),
        purposes: vec![],
        usage_guide: None,
        min_display_seconds: None,
        canvas: template.canvas,
        layers: vec![
            Layer {
                parent_id: Some("root".into()),
                content: LayerContent::Element { element },
            },
            Layer {
                parent_id: None,
                content: LayerContent::Group {
                    composite: false,
                    separate_instances: false,
                    id: "root".into(),
                    region: Rect {
                        x: 0.2,
                        y: 0.1,
                        width: 0.5,
                        height: 0.8,
                    },
                },
            },
        ],
        styles: template.styles,
        resource_slots: vec![],
        resource_bindings: vec![],
        treatments: vec![],
        applications: vec![],
        spatial_relations: vec![],
        reading_replicas: vec![],
        inputs: vec![TextInput {
            id: "headline".into(),
            label: "Headline".into(),
            default: "Example".into(),
            max_characters: 20,
            layer_ids: vec!["caption".into()],
        }],
        provenance: "Authored test fixture".into(),
        evidence: vec![],
    }
}

#[test]
fn hierarchy_is_order_independent_and_inputs_compile_to_editable_text() {
    let asset = fixture();
    let inputs = BTreeMap::from([("headline".into(), "Replacement".into())]);
    let projected = asset.project(&inputs).unwrap();
    assert!((projected.elements[0].region.x - 0.25).abs() < 1e-9);
    assert!((projected.elements[0].region.y - 0.26).abs() < 1e-9);
    assert!((projected.elements[0].region.width - 0.3).abs() < 1e-9);
    let mut request = composition_tests::request(composition_tests::input());
    request.input.template = projected;
    let output = super::compiler::compile(request).unwrap();
    assert!(
        serde_json::to_string(&output)
            .unwrap()
            .contains("Replacement")
    );
    assert_eq!(
        asset.inspect().unwrap()["capabilities"]["temporalAuthority"],
        true
    );
}

#[test]
fn invalid_graphs_and_unsupported_operations_are_rejected() {
    let mut asset = fixture();
    asset.layers[1].parent_id = Some("root".into());
    assert!(asset.project(&BTreeMap::new()).is_err());
    asset.layers[1].parent_id = Some("missing".into());
    assert!(asset.project(&BTreeMap::new()).is_err());
    asset = fixture();
    asset.layers[1].parent_id = Some("caption".into());
    assert!(asset.project(&BTreeMap::new()).is_err());
    asset = fixture();
    asset.layers.push(asset.layers[0].clone());
    assert!(asset.project(&BTreeMap::new()).is_err());
    asset = fixture();
    assert!(
        asset
            .project(&BTreeMap::from([("unknown".into(), "text".into())]))
            .is_err()
    );
    assert!(
        asset
            .project(&BTreeMap::from([("headline".into(), "x".repeat(21))]))
            .is_err()
    );
    if let LayerContent::Element { element } = &mut asset.layers[0].content {
        element.features.representation = Representation::Particles;
    }
    assert!(asset.project(&BTreeMap::new()).is_err());
}

#[test]
fn insertion_namespaces_references_preserves_template_and_rejects_collisions() {
    let asset = fixture();
    let template: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    let before = serde_json::to_value(&template.elements).unwrap();
    let output = insert(template, &asset, "one", &BTreeMap::new(), None).unwrap();
    let result: Template = serde_json::from_value(output["template"].clone()).unwrap();
    assert_eq!(serde_json::to_value(&result.elements[..1]).unwrap(), before);
    assert_eq!(result.elements[1].id, "one--caption");
    assert!(
        result.elements[1]
            .style_id
            .as_ref()
            .unwrap()
            .starts_with("one--")
    );
    assert!(insert(result.clone(), &asset, "one", &BTreeMap::new(), None).is_err());
    assert!(insert(result.clone(), &asset, "two", &BTreeMap::new(), None).is_ok());
    let mut other = result;
    other.canvas.width += 1;
    assert!(insert(other, &asset, "three", &BTreeMap::new(), None).is_err());
}

#[test]
fn proportional_placement_preserves_geometry_style_and_time_across_canvases() {
    let mut asset = fixture();
    asset.canvas = Canvas {
        width: 720,
        height: 720,
        fps: 30,
    };
    if let LayerContent::Element { element } = &mut asset.layers[0].content {
        element.style_id = Some(asset.styles[0].id.clone());
        element.motions = vec![Motion {
            property: MotionProperty::Y,
            keys: vec![
                MotionKey {
                    time: 0.,
                    value: 40.,
                    easing: Easing::EaseOut,
                },
                MotionKey {
                    time: 1.,
                    value: 0.,
                    easing: Easing::Linear,
                },
            ],
        }];
        element.motion_timing = Some(MotionTiming {
            coverage: None,
            enter_end: 0.2,
            exit_start: 0.8,
            enter_seconds: 0.2,
            exit_seconds: 0.15,
        });
    }
    asset.styles[0].font_size = 60.;
    asset.styles[0].background_corner_radius = Some(35.);
    asset.styles[0].stroke_width = 4.;
    asset.styles[0].letter_spacing = 2.;
    asset.styles[0].shadow = Some(Shadow {
        color: "#000000".into(),
        opacity: 0.5,
        blur: 8.,
        x: 4.,
        y: 6.,
    });
    asset.treatments = vec![
        composition::Treatment {
            id: "clip".into(),
            operation: composition::TreatmentOperation::CanvasClip {
                region: Rect {
                    x: 0.1,
                    y: 0.1,
                    width: 0.8,
                    height: 0.8,
                },
            },
        },
        composition::Treatment {
            id: "move".into(),
            operation: composition::TreatmentOperation::Motion {
                motion_timing: None,
                channels: vec![Motion {
                    property: MotionProperty::X,
                    keys: vec![
                        MotionKey {
                            time: 0.,
                            value: 20.,
                            easing: Easing::Linear,
                        },
                        MotionKey {
                            time: 0.5,
                            value: 0.,
                            easing: Easing::Linear,
                        },
                        MotionKey {
                            time: 1.,
                            value: 20.,
                            easing: Easing::Linear,
                        },
                    ],
                }],
                repeat_seconds: Some(0.5),
            },
        },
    ];
    asset.applications = ["clip", "move"]
        .into_iter()
        .map(|id| composition::TreatmentApplication {
            treatment_id: id.into(),
            target: composition::Target::Group("root".into()),
            enabled: true,
        })
        .collect();
    let source = asset.project(&BTreeMap::new()).unwrap();
    let before = serde_json::to_value(&asset).unwrap();
    for (width, height, fps) in [(1280, 720, 24), (720, 1280, 60)] {
        let mut host: Template =
            serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
        host.canvas = Canvas { width, height, fps };
        let original = serde_json::to_value(&host).unwrap();
        let placement = Rect {
            x: 0.1,
            y: 0.5,
            width: 0.8,
            height: 0.4,
        };
        let output = insert(host, &asset, "fit", &BTreeMap::new(), Some(&placement)).unwrap();
        let result: Template = serde_json::from_value(output["template"].clone()).unwrap();
        let scale = (0.8 * width as f64 / 720.).min(0.4 * height as f64 / 720.);
        let element = result.elements.last().unwrap();
        let style = result
            .styles
            .iter()
            .find(|style| style.id == format!("fit--{}", asset.styles[0].id))
            .unwrap();
        let near = |a: f64, b: f64| assert!((a - b).abs() < 1e-8, "{a} != {b}");
        near(
            element.region.width * width as f64,
            source.elements[0].region.width * 720. * scale,
        );
        near(
            element.region.height * height as f64,
            source.elements[0].region.height * 720. * scale,
        );
        assert!(element.region.x >= placement.x && element.region.y >= placement.y);
        assert!(element.region.x + element.region.width <= placement.x + placement.width);
        assert!(element.region.y + element.region.height <= placement.y + placement.height);
        near(style.font_size, 60. * scale);
        assert_eq!(style.background_corner_radius, Some(35.));
        near(style.stroke_width, 4. * scale);
        near(style.letter_spacing, 2. * scale);
        near(style.shadow.as_ref().unwrap().blur, 8. * scale);
        near(element.motions[0].keys[0].value, 40. * scale);
        near(element.motion_timing.as_ref().unwrap().enter_seconds, 0.2);
        near(element.motion_timing.as_ref().unwrap().exit_seconds, 0.15);
        let clip = result
            .composition
            .treatments
            .iter()
            .find(|item| item.id == "fit--clip")
            .unwrap();
        let composition::TreatmentOperation::CanvasClip { region } = &clip.operation else {
            panic!("missing clip")
        };
        near(region.width * width as f64, 0.8 * 720. * scale);
        near(region.height * height as f64, 0.8 * 720. * scale);
        let motion = result
            .composition
            .treatments
            .iter()
            .find(|item| item.id == "fit--move")
            .unwrap();
        let composition::TreatmentOperation::Motion {
            channels,
            repeat_seconds,
            ..
        } = &motion.operation
        else {
            panic!("missing motion")
        };
        near(channels[0].keys[0].value, 20. * scale);
        assert_eq!(*repeat_seconds, Some(0.5));
        assert_eq!(output["template"]["layouts"], original["layouts"]);
        assert_eq!(output["template"]["elements"][0], original["elements"][0]);
        assert_eq!(output["template"]["canvas"]["fps"], fps);
        assert_eq!(serde_json::to_value(&asset).unwrap(), before);
    }
    let host: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    assert!(
        insert(
            host,
            &asset,
            "invalid",
            &BTreeMap::new(),
            Some(&Rect {
                x: 0.,
                y: 0.,
                width: 0.,
                height: 1.
            })
        )
        .is_err()
    );
}

#[test]
fn dynamic_relations_preserve_projection_editing_and_namespaces() {
    use super::{
        composition::{SpatialPlacement, SpatialRelation},
        dynamic_asset_edit::{Edit, Operation, ResizeCorner, edit},
    };
    let mut asset = create(Create {
        name: "Attachment".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::DecorativeText),
    })
    .unwrap();
    let mut child = asset
        .layers
        .iter()
        .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
        .unwrap()
        .clone();
    if let LayerContent::Element { element } = &mut child.content {
        element.id = "icon".into();
        element.features.representation = Representation::Rectangle;
        element.region = Rect {
            x: 0.4,
            y: 0.2,
            width: 0.08,
            height: 0.08,
        };
        element.motions.clear();
        element.motion_timing = None;
    }
    asset.layers.push(child);
    let relation = SpatialRelation {
        size_binding: None,
        reference_bounds: Default::default(),
        element_id: "icon".into(),
        relative_to: "headline".into(),
        placement: SpatialPlacement::Above,
        gap: 0.03,
        offset_x: 0.,
        offset_y: 0.,
        follow_motion: true,
    };
    asset = serde_json::from_value(
        edit(Edit {
            definition: asset,
            operation: Operation::SpatialRelation {
                layer_id: "icon".into(),
                relation: Some(relation),
            },
        })
        .unwrap()["definition"]
            .clone(),
    )
    .unwrap();
    let projected = asset.project(&BTreeMap::new()).unwrap();
    let old = projected
        .elements
        .iter()
        .find(|e| e.id == "icon")
        .unwrap()
        .region
        .clone();
    let preview = preview(Preview {
        definition: asset.clone(),
        inputs: BTreeMap::new(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    let clips: Vec<_> = preview["tracks"]["overlay"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|t| t["elements"].as_array().unwrap())
        .collect();
    let icon = clips
        .iter()
        .find(|e| e["params"]["template.elementId"] == "icon")
        .unwrap();
    assert!(icon["params"]["template.attachedTo"].is_string());
    assert!(
        icon["animations"]["transform.scaleX"]["keys"]
            .as_array()
            .unwrap()
            .len()
            > 2
    );
    for operation in [
        Operation::Move {
            layer_id: "icon".into(),
            delta_x: 0.04,
            delta_y: 0.02,
        },
        Operation::Resize {
            layer_id: "icon".into(),
            corner: ResizeCorner::BottomRight,
            delta_x: 0.03,
            delta_y: 0.02,
        },
    ] {
        let changed: Definition = serde_json::from_value(
            edit(Edit {
                definition: asset.clone(),
                operation,
            })
            .unwrap()["definition"]
                .clone(),
        )
        .unwrap();
        let p = changed.project(&BTreeMap::new()).unwrap();
        let region = &p.elements.iter().find(|e| e.id == "icon").unwrap().region;
        assert!(region.x != old.x || region.width != old.width);
        let detached: Definition = serde_json::from_value(
            edit(Edit {
                definition: changed,
                operation: Operation::SpatialRelation {
                    layer_id: "icon".into(),
                    relation: None,
                },
            })
            .unwrap()["definition"]
                .clone(),
        )
        .unwrap();
        let p = detached.project(&BTreeMap::new()).unwrap();
        let after = &p.elements.iter().find(|e| e.id == "icon").unwrap().region;
        assert!((region.x - after.x).abs() < 1e-10 && (region.y - after.y).abs() < 1e-10);
    }
    let copied = edit(Edit {
        definition: asset.clone(),
        operation: Operation::Duplicate {
            layer_id: "root".into(),
        },
    })
    .unwrap();
    let copied: Definition = serde_json::from_value(copied["definition"].clone()).unwrap();
    assert_eq!(copied.spatial_relations.len(), 2);
    assert_ne!(copied.spatial_relations[1].relative_to, "headline");
    let removed = edit(Edit {
        definition: asset.clone(),
        operation: Operation::Remove {
            layer_id: "headline".into(),
        },
    })
    .unwrap();
    let removed: Definition = serde_json::from_value(removed["definition"].clone()).unwrap();
    assert!(removed.spatial_relations.is_empty());
    let projected_removed = removed.project(&BTreeMap::new()).unwrap();
    let remaining = &projected_removed
        .elements
        .iter()
        .find(|e| e.id == "icon")
        .unwrap()
        .region;
    assert_eq!(
        serde_json::to_value(remaining).unwrap(),
        serde_json::to_value(&old).unwrap()
    );
    let mut cycle = asset.clone();
    cycle.spatial_relations.push(SpatialRelation {
        size_binding: None,
        reference_bounds: Default::default(),
        element_id: "headline".into(),
        relative_to: "icon".into(),
        placement: SpatialPlacement::Overlay,
        gap: 0.,
        offset_x: 0.,
        offset_y: 0.,
        follow_motion: true,
    });
    assert!(cycle.project(&BTreeMap::new()).is_err());
}

#[test]
fn content_background_padding_compiles_scales_and_validates() {
    let mut asset = create(Create {
        name: "Background".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    asset.styles[0].background = Some("#DDFC74".into());
    asset.styles[0].background_padding = Some(TextBackgroundPadding { x: 24., y: 12. });
    let mut request: Application = serde_json::from_value(json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":1440,"height":1440,"fps":30},"placement":{"x":0,"y":0,"width":1,"height":1}})).unwrap();
    let scaled = application(&asset, &request).unwrap();
    assert_eq!(scaled.styles[0].background_padding.as_ref().unwrap().x, 48.);
    let preview = preview_application(ApplicationPreview {
        template: scaled.clone(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    let params = &preview["tracks"]["overlay"][0]["elements"][0]["params"];
    assert_eq!(params["background.enabled"], true);
    let actual = params["background.paddingX"].as_f64().unwrap()
        * params["fontSize"].as_f64().unwrap()
        / 15.;
    assert!((actual - 48.).abs() < 1e-10);
    assert_eq!(
        params["text.maxWidth"],
        json!(scaled.elements[0].region.width * 1440. - 2. * (scaled.styles[0].stroke_width + 48.))
    );
    request.canvas.width = 720;
    request.canvas.height = 720;
    for invalid in [-1., 257., f64::NAN] {
        asset.styles[0].background_padding.as_mut().unwrap().x = invalid;
        assert!(application(&asset, &request).is_err());
    }
}

#[test]
fn caption_width_reflows_only_sentence_text_without_mutating_style() {
    let mut asset = create(Create {
        name: "Caption layout".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    let mut keyword = asset
        .layers
        .iter()
        .find(|layer| matches!(layer.content, LayerContent::Element { .. }))
        .unwrap()
        .clone();
    if let LayerContent::Element { element } = &mut keyword.content {
        element.id = "keyword-copy".into();
        element.binding = Binding::Keyword;
    }
    asset.layers.push(keyword);
    let before = serde_json::to_value(&asset).unwrap();
    for (width, height) in [(1280, 720), (720, 1280)] {
        let mut request: Application = serde_json::from_value(json!({
            "assetId":asset.id,"assetRevision":asset.revision,
            "canvas":{"width":width,"height":height,"fps":30},
            "placement":{"x":0,"y":0,"width":1,"height":1}
        }))
        .unwrap();
        let original = application(&asset, &request).unwrap();
        request.caption_width = Some(0.85);
        let expanded = application(&asset, &request).unwrap();
        assert_ne!(original.id, expanded.id);
        assert_eq!(
            serde_json::to_value(&original.styles).unwrap(),
            serde_json::to_value(&expanded.styles).unwrap()
        );
        for (old, new) in original.elements.iter().zip(&expanded.elements) {
            if old.binding == Binding::Sentence {
                assert_eq!(new.region.width, 0.85);
                assert!(
                    (old.region.x + old.region.width / 2. - new.region.x - new.region.width / 2.)
                        .abs()
                        < 1e-10
                );
                assert_eq!(old.region.y, new.region.y);
                assert_eq!(
                    serde_json::to_value(&old.motions).unwrap(),
                    serde_json::to_value(&new.motions).unwrap()
                );
            } else {
                assert_eq!(
                    serde_json::to_value(old).unwrap(),
                    serde_json::to_value(new).unwrap()
                );
            }
        }
        for invalid in [0., 1.1, f64::NAN] {
            request.caption_width = Some(invalid);
            assert!(application(&asset, &request).is_err());
        }
        request.caption_width = Some(1.);
        request.transform = Some(ApplicationTransform {
            rotation_degrees: None,
            scale: 1.,
            center_x: 0.8,
            center_y: 0.5,
        });
        assert!(application(&asset, &request).is_err());
    }
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
}

#[test]
fn application_draft_pins_revision_and_keeps_source_layout_independent() {
    let mut asset = fixture();
    // Exercise the typography actually referenced by the text, not an unused style.
    if let LayerContent::Element { element } = &mut asset.layers[0].content {
        element.style_id = Some(asset.styles[0].id.clone());
    }
    asset.canvas = Canvas {
        width: 720,
        height: 720,
        fps: 30,
    };
    for style in &mut asset.styles {
        style.font_size = 60.;
    }
    let before = serde_json::to_value(&asset).unwrap();
    let mut request = Application {
        min_display_seconds: None,
        intents: None,
        asset_id: asset.id.clone(),
        asset_revision: asset.revision,
        canvas: Canvas {
            width: 1280,
            height: 720,
            fps: 30,
        },
        placement: Rect {
            x: 0.,
            y: 0.5,
            width: 1.,
            height: 0.5,
        },
        inputs: BTreeMap::new(),
        transform: None,
        caption_width: None,
        text_widths: Default::default(),
        video_region: None,
        blurred_background: None,
    };
    let result = application(&asset, &request).unwrap();
    assert_eq!(result.elements.len(), 1);
    assert_eq!(result.revision, 0);
    assert_eq!(result.layouts[0].video_region.width, 1.);
    assert_eq!(result.layouts[0].video_region.height, 1.);
    assert!(result.elements[0].region.y >= 0.5);
    assert_eq!(result.id, application(&asset, &request).unwrap().id);
    request.video_region = Some(Rect {
        x: 0.,
        y: 0.,
        width: 1.,
        height: 0.8,
    });
    let framed = application(&asset, &request).unwrap();
    assert_eq!(framed.layouts[0].video_region.height, 0.8);
    assert_ne!(framed.id, result.id);
    assert!(
        serde_json::to_value(&request)
            .unwrap()
            .get("blurredBackground")
            .is_none()
    );
    request.blurred_background = Some(true);
    let mut blurred = application(&asset, &request).unwrap();
    assert!(matches!(blurred.layouts[0].mode, LayoutMode::BlurredFill));
    assert_ne!(blurred.id, framed.id);
    blurred.id = framed.id.clone();
    blurred.layouts[0].mode = framed.layouts[0].mode.clone();
    assert_eq!(
        serde_json::to_value(&blurred).unwrap(),
        serde_json::to_value(&framed).unwrap()
    );
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
    request.blurred_background = None;

    assert_eq!(
        serde_json::to_value(&framed.elements).unwrap(),
        serde_json::to_value(&result.elements).unwrap()
    );
    assert_eq!(
        serde_json::to_value(&framed.styles).unwrap(),
        serde_json::to_value(&result.styles).unwrap()
    );
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
    request.video_region.as_mut().unwrap().y = 0.5;
    assert!(application(&asset, &request).is_err());
    request.video_region = None;
    request.transform = Some(ApplicationTransform {
        rotation_degrees: None,
        scale: 1.,
        center_x: 0.5,
        center_y: 0.8,
    });
    let moved = application(&asset, &request).unwrap();
    let close = |a: f64, b: f64| assert!((a - b).abs() < 1e-8, "{a} != {b}");
    close(
        moved.elements[0].region.y + moved.elements[0].region.height / 2.,
        0.8,
    );
    close(
        moved.elements[0].region.width,
        result.elements[0].region.width,
    );
    close(moved.styles[0].font_size, result.styles[0].font_size);
    let preview = preview_application(ApplicationPreview {
        template: moved.clone(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    assert_eq!(preview["canvas"]["width"], 1280);
    assert_eq!(preview["example"]["timingSource"], "synthetic_example");
    assert_eq!(preview["tracks"]["main"]["elements"], json!([]));
    assert_eq!(preview["tracks"]["audio"], json!([]));
    assert!(!preview["tracks"]["overlay"].as_array().unwrap().is_empty());
    assert_eq!(
        serde_json::to_value(&moved.elements[0].motions).unwrap(),
        serde_json::to_value(&result.elements[0].motions).unwrap()
    );
    request.transform.as_mut().unwrap().scale = 1.5;
    let enlarged = application(&asset, &request).unwrap();
    close(
        enlarged.elements[0].region.y + enlarged.elements[0].region.height / 2.,
        0.8,
    );
    close(
        enlarged.elements[0].region.width,
        result.elements[0].region.width * 1.5,
    );
    close(
        enlarged.styles[0].font_size,
        result.styles[0].font_size * 1.5,
    );
    request.transform.as_mut().unwrap().center_y = 1.;
    assert!(application(&asset, &request).is_err());
    request.transform = None;
    request.placement.y = 0.;
    assert_ne!(result.id, application(&asset, &request).unwrap().id);
    request.asset_revision += 1;
    assert!(application(&asset, &request).is_err());
    request.asset_revision = asset.revision;
    request.canvas.width = 0;
    assert!(application(&asset, &request).is_err());
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
}

#[test]
fn save_is_atomic_revisioned_and_replayable() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let request = || Save {
        definition: fixture(),
        base_revision: 0,
        idempotency_key: "create".into(),
    };
    assert_eq!(save(&store, request()).unwrap().revision, 1);
    assert_eq!(save(&store, request()).unwrap().revision, 1);
    let mut conflict = request();
    conflict.idempotency_key = "conflict".into();
    assert!(save(&store, conflict).is_err());
    let mut reuse = request();
    reuse.definition.name = "Changed".into();
    assert!(save(&store, reuse).is_err());
    let mut update = request();
    update.definition.revision = 1;
    update.base_revision = 1;
    update.idempotency_key = "update".into();
    update.definition.name = "Updated".into();
    assert_eq!(save(&store, update).unwrap().revision, 2);
    assert_eq!(save(&store, request()).unwrap().revision, 1);
    let prior: Definition = store.get("dynamic_asset_version", "impact-r1").unwrap();
    assert_eq!(prior.name, "Impact");
    let current: Definition = store.get(RECORD, "impact").unwrap();
    assert_eq!(current.name, "Updated");
    assert!(serde_json::from_value::<Definition>(json!({"unexpected":true})).is_err());
}

#[test]
fn group_treatments_expand_to_leaf_targets() {
    let mut asset = fixture();
    asset.treatments.push(composition::Treatment {
        id: "group-motion".into(),
        operation: composition::TreatmentOperation::Motion {
            motion_timing: None,
            channels: vec![Motion {
                property: MotionProperty::Opacity,
                keys: vec![
                    MotionKey {
                        time: 0.,
                        value: 0.,
                        easing: Easing::Linear,
                    },
                    MotionKey {
                        time: 1.,
                        value: 1.,
                        easing: Easing::Linear,
                    },
                ],
            }],
            repeat_seconds: None,
        },
    });
    asset.applications.push(composition::TreatmentApplication {
        treatment_id: "group-motion".into(),
        target: composition::Target::Group("root".into()),
        enabled: true,
    });
    let projected = asset.project(&BTreeMap::new()).unwrap();
    assert_eq!(projected.composition.applications.len(), 1);
    assert!(
        matches!(&projected.composition.applications[0].target, composition::Target::Element(id) if id == "caption")
    );
}

#[test]
fn configured_insert_changes_caption_width_without_resizing_type_or_motion() {
    let asset = create(Create {
        name: "Caption".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    let mut host: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    host.canvas = Canvas {
        width: 1280,
        height: 720,
        fps: 30,
    };
    let original = serde_json::to_value(&host).unwrap();
    let source = serde_json::to_value(&asset).unwrap();
    let request = json!({"template":host,"assetId":asset.id,"assetRevision":asset.revision,"instanceId":"extra","placement":{"x":0,"y":0,"width":1,"height":1},"transform":{"scale":0.65,"centerX":0.5,"centerY":0.9},"captionWidth":0.84});
    let wide = insert_configured(serde_json::from_value(request.clone()).unwrap(), &asset).unwrap();
    let mut narrow_request = request.clone();
    narrow_request["captionWidth"] = json!(0.6);
    let narrow =
        insert_configured(serde_json::from_value(narrow_request).unwrap(), &asset).unwrap();
    assert_eq!(wide["template"]["styles"], narrow["template"]["styles"]);
    let a = wide["template"]["elements"]
        .as_array()
        .unwrap()
        .last()
        .unwrap();
    let b = narrow["template"]["elements"]
        .as_array()
        .unwrap()
        .last()
        .unwrap();
    assert_eq!(a["motions"], b["motions"]);
    assert_eq!(a["motionTiming"], b["motionTiming"]);
    assert_eq!(a["region"]["width"], json!(0.84));
    assert_eq!(b["region"]["width"], json!(0.6));
    assert!((a["region"]["x"].as_f64().unwrap() + 0.42 - 0.5).abs() < 1e-8);
    assert_eq!(wide["template"]["elements"][0], original["elements"][0]);
    assert_eq!(serde_json::to_value(&asset).unwrap(), source);
    for invalid in [json!(0.01), json!(1.1)] {
        let mut input = request.clone();
        input["captionWidth"] = invalid;
        assert!(insert_configured(serde_json::from_value(input).unwrap(), &asset).is_err());
    }
    let mut missing = request.clone();
    missing.as_object_mut().unwrap().remove("placement");
    assert!(insert_configured(serde_json::from_value(missing).unwrap(), &asset).is_err());
    let mut stale = request.clone();
    stale["assetRevision"] = json!(asset.revision + 1);
    assert!(insert_configured(serde_json::from_value(stale).unwrap(), &asset).is_err());
    let mut collision = request;
    collision["template"] = wide["template"].clone();
    assert!(insert_configured(serde_json::from_value(collision).unwrap(), &asset).is_err());
}

#[test]
fn cross_style_attachment_is_scoped_to_inserted_elements_and_existing_text() {
    let asset = fixture();
    let host: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    let before = serde_json::to_value(&host).unwrap();
    let reference = host.elements[0].id.clone();
    let relation = json!({"elementId":"one--caption","relativeTo":reference,"placement":"right","referenceBounds":"text_box","followMotion":true,"gap":0.02,"offsetX":0.0,"offsetY":0.0});
    let request = json!({"template":host,"assetId":asset.id,"assetRevision":asset.revision,"instanceId":"one","attachments":[relation]});
    let result =
        insert_configured(serde_json::from_value(request.clone()).unwrap(), &asset).unwrap();
    assert_eq!(result["template"]["elements"][0], before["elements"][0]);
    assert_eq!(
        result["template"]["composition"]["spatialRelations"]
            .as_array()
            .unwrap()
            .last()
            .unwrap(),
        &relation
    );
    for (key, value) in [
        ("elementId", json!(reference)),
        ("relativeTo", json!("one--caption")),
        ("followMotion", json!(false)),
        ("gap", json!(-1.)),
    ] {
        let mut invalid = request.clone();
        invalid["attachments"][0][key] = value;
        assert!(
            insert_configured(serde_json::from_value(invalid).unwrap(), &asset).is_err(),
            "{key}"
        );
    }
    let mut duplicate = request;
    duplicate["attachments"]
        .as_array_mut()
        .unwrap()
        .push(relation);
    assert!(insert_configured(serde_json::from_value(duplicate).unwrap(), &asset).is_err());
}

#[test]
fn small_graphic_placement_does_not_scale_dormant_typography() {
    let asset = create(Create {
        name: "Small icon".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    let before = serde_json::to_value(&asset).unwrap();
    let input:Application=serde_json::from_value(json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":720,"height":1280,"fps":30},"placement":{"x":0.1,"y":0.6,"width":0.05,"height":0.028125}})).unwrap();
    let result = application(&asset, &input).unwrap();
    result.validate().unwrap();
    assert_eq!(result.styles[0].font_size, asset.styles[0].font_size);
    assert!(result.elements[0].region.width < 0.05);
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
    // Actual text still scales and retains the minimum readable-font constraint.
    let text = create(Create {
        name: "Small text".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Keyword),
    })
    .unwrap();
    let mut input = input;
    input.asset_id = text.id.clone();
    input.asset_revision = text.revision;
    assert!(application(&text, &input).is_err());
}

#[test]
fn capture_preserves_composed_visual_graph_and_rejects_lost_scene_rules() {
    let caption = create(Create {
        name: "Caption".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    let host = caption.project(&BTreeMap::new()).unwrap();
    let icon = create(Create {
        name: "Icon".into(),
        canvas: host.canvas.clone(),
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    let id = icon
        .layers
        .iter()
        .find_map(|l| {
            if let LayerContent::Element { element } = &l.content {
                Some(element.id.clone())
            } else {
                None
            }
        })
        .unwrap();
    let input = json!({"template":host,"assetId":icon.id,"assetRevision":icon.revision,"instanceId":"icon","attachments":[{"elementId":format!("icon--{id}"),"relativeTo":host.elements[0].id,"placement":"left","referenceBounds":"text_box","followMotion":true,"gap":0.02,"offsetX":0,"offsetY":0}]});
    let inserted = insert_configured(serde_json::from_value(input).unwrap(), &icon).unwrap();
    let template: Template = serde_json::from_value(inserted["template"].clone()).unwrap();
    let before = serde_json::to_value(&template).unwrap();
    let definition = capture(Capture {
        template: template.clone(),
        name: "Reusable pair".into(),
    })
    .unwrap();
    assert!(
        definition.purposes.contains(&CreatePurpose::Caption)
            && definition.purposes.contains(&CreatePurpose::Decoration)
    );
    assert_eq!(definition.revision, 0);
    let captured_elements: Vec<_> = definition
        .layers
        .iter()
        .filter_map(|layer| {
            if let LayerContent::Element { element } = &layer.content {
                Some(element.clone())
            } else {
                None
            }
        })
        .collect();
    assert_eq!(
        serde_json::to_value(captured_elements).unwrap(),
        before["elements"]
    );
    let mut projected =
        serde_json::to_value(definition.project(&BTreeMap::new()).unwrap()).unwrap();
    // Projection computes the static anchor for text-bound elements; the renderer
    // later resolves their actual measured bounds. Authored layer geometry is intact.
    for (a, b) in projected["elements"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .zip(before["elements"].as_array().unwrap())
    {
        if a["id"] == format!("icon--{id}") {
            a["region"]["x"] = b["region"]["x"].clone();
            a["region"]["y"] = b["region"]["y"].clone();
        }
    }
    for field in [
        "elements",
        "styles",
        "resourceSlots",
        "resourceBindings",
        "composition",
    ] {
        assert_eq!(projected[field], before[field], "{field}");
    }
    let mut scene = template.clone();
    let mut second = scene.layouts[0].clone();
    second.id = "second-layout".into();
    scene.layouts.push(second);
    scene.transition_rules.push(TransitionRule {
        id: "scene-fade".into(),
        from_layout_id: scene.layouts[0].id.clone(),
        to_layout_id: "second-layout".into(),
        effect: TransitionKind::Dissolve,
        duration_seconds: 0.2,
    });
    scene.validate().unwrap();
    assert!(
        capture(Capture {
            template: scene,
            name: "Lost scene transition".into()
        })
        .err()
        .unwrap()
        .to_string()
        .contains("scene transitions")
    );
    let mut invalid = template;
    invalid.composition.groups.push(composition::ElementGroup {
        id: "scene-group".into(),
        element_ids: vec![invalid.elements[0].id.clone()],
        composite: false,
        separate_instances: false,
    });
    assert!(
        capture(Capture {
            template: invalid,
            name: "Lossy".into()
        })
        .is_err()
    );
}

#[test]
fn application_and_insert_intents_override_only_requested_style() {
    let mut asset = fixture();
    for layer in &mut asset.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            element.intents = vec![Intent::Hook];
        }
    }
    let before = serde_json::to_value(&asset).unwrap();
    let mut value = json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":asset.canvas,"placement":{"x":0.,"y":0.,"width":1.,"height":1.}});
    let authored = application(&asset, &serde_json::from_value(value.clone()).unwrap()).unwrap();
    assert!(
        authored
            .elements
            .iter()
            .all(|e| e.intents == vec![Intent::Hook])
    );
    value["intents"] = json!(["metric"]);
    let filtered = application(&asset, &serde_json::from_value(value.clone()).unwrap()).unwrap();
    assert!(
        filtered
            .elements
            .iter()
            .all(|e| e.intents == vec![Intent::Metric])
    );
    assert_ne!(authored.id, filtered.id);
    for (a, b) in authored.elements.iter().zip(&filtered.elements) {
        assert_eq!(
            serde_json::to_value(&a.timing).unwrap(),
            serde_json::to_value(&b.timing).unwrap()
        );
    }
    value["intents"] = json!([]);
    assert!(
        application(&asset, &serde_json::from_value(value.clone()).unwrap())
            .unwrap()
            .elements
            .iter()
            .all(|e| e.intents.is_empty())
    );
    value["intents"] = json!(["invented"]);
    assert!(serde_json::from_value::<Application>(value).is_err());
    for transform in [None, Some(json!({"scale":0.5,"centerX":0.5,"centerY":0.5}))] {
        let request = json!({"template":authored,"assetId":asset.id,"assetRevision":asset.revision,"instanceId":"filtered","placement":{"x":0.,"y":0.,"width":1.,"height":1.},"transform":transform,"intents":["metric"]});
        let result = insert_configured(serde_json::from_value(request).unwrap(), &asset).unwrap();
        let composed: Template = serde_json::from_value(result["template"].clone()).unwrap();
        assert!(
            composed
                .elements
                .iter()
                .filter(|e| e.id.starts_with("filtered--"))
                .all(|e| e.intents == vec![Intent::Metric])
        );
        assert_eq!(
            composed
                .elements
                .iter()
                .filter(|e| !e.id.starts_with("filtered--"))
                .map(|e| serde_json::to_value(e).unwrap())
                .collect::<Vec<_>>(),
            authored
                .elements
                .iter()
                .map(|e| serde_json::to_value(e).unwrap())
                .collect::<Vec<_>>()
        );
        assert_eq!(result["instance"]["intents"], json!(["metric"]));
    }
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
}

#[test]
fn preview_example_intent_matches_authored_filter_without_altering_it() {
    let mut definition = create(Create {
        name: "Metric symbol".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    for layer in &mut definition.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            element.intents = vec![Intent::Metric];
            element.binding = Binding::Keyword;
            element.timing.anchor = Anchor::KeywordStart;
        }
    }
    let make = |intent| Preview {
        definition: definition.clone(),
        inputs: BTreeMap::new(),
        duration_seconds: 2.,
        example: Some(PreviewExample {
            intent,
            text: "longer sunlight".into(),
            keyword: "longer".into(),
            keyword_occurrence: 0,
            layout_phrases: vec![],
        }),
    };
    assert!(
        preview(make(None))
            .unwrap_err()
            .to_string()
            .contains("no supported elements")
    );
    let result = preview(make(Some(Intent::Metric))).unwrap();
    assert_eq!(result["example"]["timingSource"], "synthetic_example");
    assert_eq!(result["tracks"]["audio"], json!([]));
    assert!(
        result["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| !t["elements"].as_array().unwrap().is_empty())
    );
    assert!(
        definition
            .layers
            .iter()
            .filter_map(|l| if let LayerContent::Element { element } = &l.content {
                Some(element)
            } else {
                None
            })
            .all(|e| e.intents == vec![Intent::Metric])
    );
    assert!(
        serde_json::from_value::<PreviewExample>(json!({"text":"one","intent":"invented"}))
            .is_err()
    );
}

#[test]
fn synthetic_preview_layout_phrase_preserves_timing_and_validates_bounds() {
    let definition = create(Create {
        name: "Phrase preview".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    let request = json!({"definition":definition,"inputs":{},"durationSeconds":2.,"example":{"text":"先完成最重要的一件事","keyword":"最重要"}});
    let plain = preview(serde_json::from_value(request.clone()).unwrap()).unwrap();
    let mut grouped = request.clone();
    grouped["example"]["layoutPhrases"] = json!([{"wordSpan":{"startWord":3,"endWord":6}}]);
    let result = preview(serde_json::from_value(grouped.clone()).unwrap()).unwrap();
    assert_eq!(result["example"], plain["example"]);
    let old = &plain["tracks"]["overlay"][0]["elements"][0];
    let new = &result["tracks"]["overlay"][0]["elements"][0];
    assert_eq!(old["startTime"], new["startTime"]);
    assert_eq!(old["duration"], new["duration"]);
    assert_eq!(
        old["params"]["text.wordTimings"],
        new["params"]["text.wordTimings"]
    );
    assert!(new["params"]["text.layoutPhrases"].is_string());
    grouped["example"]["layoutPhrases"] = json!([{"wordSpan":{"startWord":0,"endWord":999}}]);
    assert!(preview(serde_json::from_value(grouped).unwrap()).is_err());
}

#[test]
fn content_background_opacity_is_independent_and_validated() {
    let mut asset = create(Create {
        name: "Translucent background".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    asset.styles[0].background = Some("#17232E".into());
    let request: Application = serde_json::from_value(json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":1440,"height":1440,"fps":30},"placement":{"x":0,"y":0,"width":1,"height":1}})).unwrap();
    for value in [None, Some(0.), Some(0.45), Some(1.)] {
        asset.styles[0].background_opacity = value;
        let scaled = application(&asset, &request).unwrap();
        assert_eq!(scaled.styles[0].background_opacity, value);
        let preview = preview_application(ApplicationPreview {
            template: scaled,
            duration_seconds: 2.,
            example: None,
        })
        .unwrap();
        let params = &preview["tracks"]["overlay"][0]["elements"][0]["params"];
        assert_eq!(params["background.opacity"], json!(value.unwrap_or(1.)));
        assert_eq!(params["opacity"], json!(1));
    }
    for invalid in [-0.01, 1.01, f64::NAN, f64::INFINITY] {
        asset.styles[0].background_opacity = Some(invalid);
        assert!(application(&asset, &request).is_err());
    }
}

#[test]
fn changing_text_content_preserves_independent_scheduling_and_motion() {
    use super::dynamic_asset_edit::{Edit, Operation, edit};
    for anchor in [
        Anchor::VideoStart,
        Anchor::CueStart,
        Anchor::KeywordStart,
        Anchor::SemanticStart,
    ] {
        let mut definition = create(Create {
            name: "Independent timing".into(),
            canvas: Canvas {
                width: 1280,
                height: 720,
                fps: 30,
            },
            purpose: Some(CreatePurpose::Keyword),
        })
        .unwrap();
        for layer in &mut definition.layers {
            if let LayerContent::Element { element } = &mut layer.content {
                element.timing.anchor = anchor.clone();
                element.timing.end_anchor = Some(EndAnchor::SemanticEnd);
                element.timing.offset_seconds = 0.12;
                element.timing.min_seconds = 0.3;
                element.timing.max_seconds = 1.7;
            }
        }
        let original = serde_json::to_value(&definition).unwrap();
        assert!(
            original["layers"]
                .as_array()
                .unwrap()
                .iter()
                .any(|layer| layer["content"]["element"]["timing"]["maxSeconds"] == 1.7)
        );
        for binding in [Binding::Sentence, Binding::Literal, Binding::Keyword] {
            let value = edit(Edit {
                definition,
                operation: Operation::TextPresentation {
                    layer_id: "headline".into(),
                    binding,
                    highlight: None,
                },
            })
            .unwrap();
            definition = serde_json::from_value(value["definition"].clone()).unwrap();
            for (before, after) in original["layers"]
                .as_array()
                .unwrap()
                .iter()
                .zip(value["definition"]["layers"].as_array().unwrap())
            {
                if before["content"]["kind"] == "element" {
                    for field in ["timing", "motions", "motionTiming"] {
                        assert_eq!(
                            before["content"]["element"][field], after["content"]["element"][field],
                            "{field} must survive content edits"
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn per_layer_text_width_is_independent_of_binding_type_and_motion() {
    let mut asset = create(Create {
        name: "Mixed text widths".into(),
        canvas: Canvas {
            width: 544,
            height: 960,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Caption),
    })
    .unwrap();
    let original_layer = asset
        .layers
        .iter()
        .find(|l| matches!(l.content, LayerContent::Element { .. }))
        .unwrap()
        .clone();
    for (id, binding, representation) in [
        ("keyword", Binding::Keyword, Representation::Text),
        ("literal", Binding::Literal, Representation::Text),
        ("shape", Binding::Keyword, Representation::Rectangle),
    ] {
        let mut layer = original_layer.clone();
        if let LayerContent::Element { element } = &mut layer.content {
            element.id = id.into();
            element.binding = binding;
            element.features.representation = representation;
        }
        asset.layers.push(layer);
    }
    let source = serde_json::to_value(&asset).unwrap();
    let base = json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":1280,"height":720,"fps":30},"placement":{"x":0,"y":0,"width":1,"height":1},"captionWidth":0.84});
    let before = application(&asset, &serde_json::from_value(base.clone()).unwrap()).unwrap();
    let mut changed = base.clone();
    changed["textWidths"] = json!({"keyword":0.5,"literal":0.4,"headline":0.6});
    let after = application(&asset, &serde_json::from_value(changed.clone()).unwrap()).unwrap();
    assert_ne!(before.id, after.id);
    assert_eq!(
        serde_json::to_value(&before.styles).unwrap(),
        serde_json::to_value(&after.styles).unwrap()
    );
    for (old, new) in before.elements.iter().zip(&after.elements) {
        let mut expected = serde_json::to_value(old).unwrap();
        if let Some(width) = changed["textWidths"][&old.id].as_f64() {
            expected["region"]["width"] = json!(width);
            expected["region"]["x"] = json!(old.region.x + old.region.width / 2. - width / 2.);
        }
        assert_eq!(
            expected,
            serde_json::to_value(new).unwrap(),
            "only selected text x/width may change"
        );
    }
    for widths in [
        json!({"missing":0.5}),
        json!({"shape":0.5}),
        json!({"keyword":0.01}),
        json!({"keyword":1.1}),
        json!({"keyword":null}),
    ] {
        let mut invalid = base.clone();
        invalid["textWidths"] = widths;
        let result = serde_json::from_value::<Application>(invalid);
        assert!(result.is_err() || application(&asset, &result.unwrap()).is_err());
    }
    let mut off_canvas = changed;
    off_canvas["transform"] = json!({"scale":0.6,"centerX":0.9,"centerY":0.5});
    assert!(application(&asset, &serde_json::from_value(off_canvas).unwrap()).is_err());
    assert_eq!(serde_json::to_value(&asset).unwrap(), source);
    let mut empty = base.clone();
    empty["textWidths"] = json!({});
    assert_eq!(
        serde_json::to_value(application(&asset, &serde_json::from_value(empty).unwrap()).unwrap())
            .unwrap(),
        serde_json::to_value(before).unwrap(),
        "empty override retains existing application identity"
    );
}

#[test]
fn inserted_text_width_uses_source_ids_and_preserves_host() {
    let asset = create(Create {
        name: "Keyword width".into(),
        canvas: Canvas {
            width: 544,
            height: 960,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Keyword),
    })
    .unwrap();
    let host: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    let request = json!({"template":host,"assetId":asset.id,"assetRevision":asset.revision,"instanceId":"extra","placement":{"x":0,"y":0,"width":1,"height":1}});
    let baseline =
        insert_configured(serde_json::from_value(request.clone()).unwrap(), &asset).unwrap();
    let mut custom = request.clone();
    custom["textWidths"] = json!({"headline":0.5});
    let wide = insert_configured(serde_json::from_value(custom.clone()).unwrap(), &asset).unwrap();
    assert_eq!(wide["template"]["styles"], baseline["template"]["styles"]);
    let elements = wide["template"]["elements"].as_array().unwrap();
    assert_eq!(
        elements
            .iter()
            .find(|e| e["id"] == "extra--headline")
            .unwrap()["region"]["width"],
        json!(0.5)
    );
    for e in &host.elements {
        assert_eq!(
            elements.iter().find(|v| v["id"] == e.id).unwrap(),
            &serde_json::to_value(e).unwrap()
        );
    }
    assert_eq!(wide["instance"]["textWidths"], json!({"headline":0.5}));
    custom["textWidths"] = json!({"extra--headline":0.5});
    assert!(insert_configured(serde_json::from_value(custom.clone()).unwrap(), &asset).is_err());
    custom["textWidths"] = json!({"headline":0.5});
    custom.as_object_mut().unwrap().remove("placement");
    assert!(insert_configured(serde_json::from_value(custom).unwrap(), &asset).is_err());
}

#[test]
fn composite_group_effects_survive_preview_capture_and_insert() {
    let mut asset = fixture();
    for layer in &mut asset.layers {
        if let LayerContent::Group { composite, .. } = &mut layer.content {
            *composite = true;
        }
    }
    asset.treatments=serde_json::from_value(json!([{"id":"fade-group","operation":{"kind":"motion","channels":[{"property":"opacity","keys":[{"time":0,"value":1,"easing":"linear"},{"time":1,"value":0,"easing":"linear"}]}]}}])).unwrap();
    asset.applications = serde_json::from_value(
        json!([{"treatmentId":"fade-group","target":{"kind":"group","id":"root"},"enabled":true}]),
    )
    .unwrap();
    let projected = asset.project(&BTreeMap::new()).unwrap();
    assert_eq!(projected.composition.groups.len(), 1);
    assert!(projected.composition.groups[0].composite);
    assert!(
        matches!(&projected.composition.applications[0].target,composition::Target::Group(id) if id=="root")
    );
    let compiled = preview(Preview {
        definition: asset.clone(),
        inputs: BTreeMap::new(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    let elements: Vec<_> = compiled["tracks"]["overlay"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|track| track["elements"].as_array().unwrap())
        .collect();
    let group = elements
        .iter()
        .find(|element| element["params"]["template.groupId"] == "root")
        .unwrap();
    assert!(group["renderGroup"]["tracks"].is_array());
    assert!(group["animations"]["opacity"]["keys"].is_array());
    let captured = capture(Capture {
        template: projected.clone(),
        name: "Captured group".into(),
    })
    .unwrap()
    .project(&BTreeMap::new())
    .unwrap();
    assert_eq!(
        serde_json::to_value(&captured.elements).unwrap(),
        serde_json::to_value(&projected.elements).unwrap()
    );
    assert_eq!(
        serde_json::to_value(&captured.composition).unwrap(),
        serde_json::to_value(&projected.composition).unwrap()
    );
    let host: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    let inserted = insert(
        host,
        &asset,
        "icon",
        &BTreeMap::new(),
        Some(&Rect {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        }),
    )
    .unwrap();
    assert_eq!(
        inserted["template"]["composition"]["groups"][0]["id"],
        "icon--root"
    );
    assert_eq!(
        inserted["template"]["composition"]["applications"][0]["target"]["id"],
        "icon--root"
    );
    assert!(
        inserted["template"]["composition"]["groups"][0]["elementIds"]
            .as_array()
            .unwrap()
            .iter()
            .all(|id| id.as_str().unwrap().starts_with("icon--"))
    );
}

#[test]
fn group_compositing_edit_is_explicit_and_does_not_change_children() {
    use super::dynamic_asset_edit::{Edit, Operation, edit};
    let asset = fixture();
    let result = edit(Edit {
        definition: asset.clone(),
        operation: Operation::GroupCompositing {
            layer_id: "root".into(),
            composite: true,
        },
    })
    .unwrap();
    let changed: Definition = serde_json::from_value(result["definition"].clone()).unwrap();
    let mut expected = serde_json::to_value(&asset).unwrap();
    expected["layers"][1]["content"]["composite"] = json!(true);
    assert_eq!(serde_json::to_value(&changed).unwrap(), expected);
    let restored = edit(Edit {
        definition: changed,
        operation: Operation::GroupCompositing {
            layer_id: "root".into(),
            composite: false,
        },
    })
    .unwrap();
    assert_eq!(
        restored["definition"],
        serde_json::to_value(&asset).unwrap()
    );
    assert!(
        edit(Edit {
            definition: asset.clone(),
            operation: Operation::GroupCompositing {
                layer_id: "caption".into(),
                composite: true
            }
        })
        .is_err()
    );
    assert!(
        edit(Edit {
            definition: asset,
            operation: Operation::GroupCompositing {
                layer_id: "missing".into(),
                composite: true
            }
        })
        .is_err()
    );
}

#[test]
fn nested_composite_groups_are_rejected_without_silently_flattening() {
    let mut asset = fixture();
    for layer in &mut asset.layers {
        match &mut layer.content {
            LayerContent::Group { composite, .. } => *composite = true,
            LayerContent::Element { .. } => layer.parent_id = Some("inner".into()),
        }
    }
    asset.layers.push(Layer {
        parent_id: Some("root".into()),
        content: LayerContent::Group {
            id: "inner".into(),
            region: Rect {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            composite: true,
            separate_instances: false,
        },
    });
    assert!(
        asset
            .project(&BTreeMap::new())
            .err()
            .unwrap()
            .to_string()
            .contains("two composite groups")
    );
    if let LayerContent::Group { composite, .. } = &mut asset.layers[1].content {
        *composite = false;
    }
    assert_eq!(
        asset
            .project(&BTreeMap::new())
            .unwrap()
            .composition
            .groups
            .len(),
        1
    );
}

#[test]
fn composite_preview_frame_uses_child_visibility_instead_of_transparent_controller() {
    let mut asset = create(Create {
        name: "Late composite".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    for layer in &mut asset.layers {
        match &mut layer.content {
            LayerContent::Group { composite, .. } => *composite = true,
            LayerContent::Element { element } => {
                element.motions=serde_json::from_value(json!([{"property":"opacity","keys":[{"time":0,"value":0,"easing":"linear"},{"time":0.7,"value":0,"easing":"linear"},{"time":0.8,"value":1,"easing":"linear"},{"time":1,"value":1,"easing":"linear"}]}])).unwrap();
                element.motion_timing = None;
            }
        }
    }
    let result = preview(Preview {
        definition: asset,
        inputs: BTreeMap::new(),
        duration_seconds: 2.,
        example: None,
    })
    .unwrap();
    let group = &result["tracks"]["overlay"][0]["elements"][0];
    let child = &group["renderGroup"]["tracks"][0]["elements"][0];
    let time = result["previewTimeSeconds"].as_f64().unwrap();
    let local =
        (time * crate::domain::TICKS as f64).round() as i64 - child["startTime"].as_i64().unwrap();
    assert!(
        crate::templates::treatments::sample(&child["animations"]["opacity"], local, 1.) > 0.99
    );
}

#[test]
fn composite_group_fade_keeps_seconds_and_preserves_children() {
    use super::dynamic_asset_edit::{Edit, Operation, edit};
    let mut asset = fixture();
    for layer in &mut asset.layers {
        match &mut layer.content {
            LayerContent::Group { composite, .. } => *composite = true,
            LayerContent::Element { element } => {
                element.timing.anchor = Anchor::VideoStart;
                element.timing.min_seconds = 0.01;
                element.timing.max_seconds = 600.;
                element.motions.clear();
            }
        }
    }
    for (seconds, enter) in [(0.06, 0.), (0.15, 0.), (0.06, 0.18)] {
        let edited = edit(Edit {
            definition: asset.clone(),
            operation: Operation::GroupFade {
                enter_seconds: Some(enter),
                layer_id: "root".into(),
                exit_seconds: Some(seconds),
            },
        })
        .unwrap();
        let saved: Definition = serde_json::from_value(edited["definition"].clone()).unwrap();
        assert_eq!(
            serde_json::to_value(&saved.layers).unwrap(),
            serde_json::to_value(&asset.layers).unwrap()
        );
        for duration in [0.1, 0.4, 4.] {
            let compiled = preview(Preview {
                definition: saved.clone(),
                inputs: BTreeMap::new(),
                duration_seconds: duration,
                example: None,
            })
            .unwrap();
            let group = &compiled["tracks"]["overlay"][0]["elements"][0];
            let keys = group["animations"]["opacity"]["keys"].as_array().unwrap();
            let last = keys.last().unwrap();
            let previous = keys
                .iter()
                .rev()
                .find(|key| (key["value"].as_f64().unwrap() - 1.).abs() < 1e-9)
                .unwrap();
            assert_eq!(last["value"], 0.);
            assert_eq!(previous["value"], 1.);
            assert!(
                ((last["time"].as_i64().unwrap() - previous["time"].as_i64().unwrap()) as f64
                    / crate::domain::TICKS as f64
                    - seconds * (duration / (seconds + enter)).min(1.))
                .abs()
                    < 1e-8
            );
            assert_eq!(
                group["duration"].as_i64().unwrap(),
                (duration * crate::domain::TICKS as f64).round() as i64
            );
        }
        let removed = edit(Edit {
            definition: saved.clone(),
            operation: Operation::GroupFade {
                enter_seconds: None,
                layer_id: "root".into(),
                exit_seconds: None,
            },
        })
        .unwrap();
        assert_eq!(removed["definition"], serde_json::to_value(&asset).unwrap());
        let mut invalid = serde_json::to_value(saved).unwrap();
        invalid["treatments"][0]["operation"]["repeatSeconds"] = json!(1.);
        assert!(
            serde_json::from_value::<Definition>(invalid)
                .unwrap()
                .project(&BTreeMap::new())
                .is_err()
        );
    }
    assert!(
        edit(Edit {
            definition: fixture(),
            operation: Operation::GroupFade {
                enter_seconds: None,
                layer_id: "root".into(),
                exit_seconds: Some(0.1)
            }
        })
        .is_err()
    );
}

#[test]
fn group_instance_scope_is_editable_and_projects_without_child_changes() {
    use super::dynamic_asset_edit::{Edit, Operation, edit};
    let original = fixture();
    let result = edit(Edit {
        definition: original.clone(),
        operation: Operation::GroupInstances {
            layer_id: "root".into(),
            separate_instances: true,
        },
    })
    .unwrap();
    let mut changed: Definition = serde_json::from_value(result["definition"].clone()).unwrap();
    for (a, b) in original.layers.iter().zip(&changed.layers) {
        if matches!(a.content, LayerContent::Element { .. }) {
            assert_eq!(
                serde_json::to_value(a).unwrap(),
                serde_json::to_value(b).unwrap()
            );
        }
    }
    for layer in &mut changed.layers {
        if let LayerContent::Group { id, composite, .. } = &mut layer.content {
            if id == "root" {
                *composite = true;
            }
        }
    }
    assert!(
        changed
            .project(&BTreeMap::new())
            .unwrap()
            .composition
            .groups
            .iter()
            .find(|g| g.id == "root")
            .unwrap()
            .separate_instances
    );
    let cleared = edit(Edit {
        definition: serde_json::from_value(result["definition"].clone()).unwrap(),
        operation: Operation::GroupInstances {
            layer_id: "root".into(),
            separate_instances: false,
        },
    })
    .unwrap();
    assert_eq!(
        cleared["definition"],
        serde_json::to_value(original.clone()).unwrap()
    );
    assert!(
        edit(Edit {
            definition: original,
            operation: Operation::GroupInstances {
                layer_id: "caption".into(),
                separate_instances: true
            }
        })
        .is_err()
    );
}

#[test]
fn graphic_strokes_use_source_units_across_application_sizes() {
    let mut asset = create(Create {
        name: "Outlined icon".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    asset.styles[0].stroke_width = 12.;
    for layer in &mut asset.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            element.features.outline = true;
        }
    }
    let before = serde_json::to_value(&asset).unwrap();
    for (width, height, scale) in [(1280, 720, 0.25), (720, 1280, 0.5), (1440, 1440, 1.5)] {
        let input:Application=serde_json::from_value(json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":width,"height":height,"fps":30},"placement":{"x":0,"y":0,"width":1,"height":1},"transform":{"scale":scale,"centerX":0.5,"centerY":0.5}})).unwrap();
        let result = application(&asset, &input).unwrap();
        assert_eq!(result.styles[0].stroke_width, 12.);
        let preview = preview_application(ApplicationPreview {
            template: result,
            duration_seconds: 2.,
            example: None,
        })
        .unwrap();
        let params = &preview["tracks"]["overlay"][0]["elements"][0]["params"];
        assert_eq!(params["strokeWidth"], json!(12.));
    }
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
}

#[test]
fn mixed_text_and_graphics_split_stroke_coordinate_spaces() {
    let mut asset = create(Create {
        name: "Shared outline".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Keyword),
    })
    .unwrap();
    asset.styles[0].stroke_width = 12.;
    let mut graphic = asset
        .layers
        .iter()
        .find_map(|l| {
            if let LayerContent::Element { element } = &l.content {
                Some(element.clone())
            } else {
                None
            }
        })
        .unwrap();
    graphic.id = "outlined-shape".into();
    graphic.features.representation = Representation::Ellipse;
    graphic.features.outline = true;
    asset.layers.push(Layer {
        parent_id: Some("root".into()),
        content: LayerContent::Element { element: graphic },
    });
    let input:Application=serde_json::from_value(json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":720,"height":720,"fps":30},"placement":{"x":0,"y":0,"width":1,"height":1},"transform":{"scale":0.5,"centerX":0.5,"centerY":0.5}})).unwrap();
    let result = application(&asset, &input).unwrap();
    for e in &result.elements {
        let style = result
            .styles
            .iter()
            .find(|s| Some(&s.id) == e.style_id.as_ref())
            .unwrap();
        assert_eq!(
            style.stroke_width,
            if e.features.representation == Representation::Text {
                6.
            } else {
                12.
            }
        );
    }
    assert_eq!(result.styles.len(), asset.styles.len() + 1);
    result.validate().unwrap();
}

#[test]
fn usage_guide_roundtrip_is_advisory_and_validated() {
    let mut asset = fixture();
    let original = serde_json::to_value(asset.project(&BTreeMap::new()).unwrap()).unwrap();
    let legacy = serde_json::to_value(&asset).unwrap();
    assert!(legacy.get("usageGuide").is_none());
    asset.usage_guide = Some(super::dynamic_asset::UsageGuide {
        purpose: "Emphasis".into(),
        invariants: "Keep outline".into(),
        adjustments: "Adjust width per input".into(),
        constraints: "Protect speaker".into(),
        fallback: "Choose another design".into(),
        coverage: "Unreviewed".into(),
    });
    let loaded: Definition = serde_json::from_value(serde_json::to_value(&asset).unwrap()).unwrap();
    assert_eq!(
        serde_json::to_value(loaded.project(&BTreeMap::new()).unwrap()).unwrap(),
        original
    );
    asset.usage_guide.as_mut().unwrap().purpose = " ".into();
    assert!(asset.project(&BTreeMap::new()).is_err());
    asset.usage_guide.as_mut().unwrap().purpose = "x".repeat(4001);
    assert!(asset.project(&BTreeMap::new()).is_err());
}

fn hold_asset() -> Definition {
    let mut asset = create(Create {
        name: "Reusable timed icon".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    for layer in &mut asset.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            element.binding = Binding::Keyword;
            element.timing.anchor = Anchor::KeywordStart;
            element.timing.max_seconds = 600.;
            element.intents.clear();
        }
    }
    asset
}
fn hold_application(asset: &Definition) -> Application {
    serde_json::from_value(json!({"assetId":asset.id,"assetRevision":asset.revision,
        "canvas":asset.canvas,"placement":{"x":0.,"y":0.,"width":1.,"height":1.}}))
    .unwrap()
}
fn hold_plan(template: Template) -> super::rhythm::PlanInput {
    let mut input = composition_tests::input();
    input["template"] = serde_json::to_value(template).unwrap();
    input["durationSeconds"] = json!(1.2);
    input["words"] =
        json!([{"text":"June","start":0.05,"end":0.2},{"text":"July","start":0.48,"end":0.7}]);
    input["semanticUnits"] = json!([
        {"startWord":0,"endWord":1,"intent":"neutral","keyword":{"startWord":0,"endWord":1},"rationale":"month"},
        {"startWord":1,"endWord":2,"intent":"neutral","keyword":{"startWord":1,"endWord":2},"rationale":"month"}
    ]);
    serde_json::from_value(input).unwrap()
}
#[test]
fn local_display_hold_preserves_legacy_projection_and_serialized_hashes_when_absent() {
    let asset = hold_asset();
    let definition_json = serde_json::to_value(&asset).unwrap();
    assert!(definition_json.get("minDisplaySeconds").is_none());
    assert!(
        definition_json["layers"]
            .as_array()
            .unwrap()
            .iter()
            .all(|l| l["content"]["element"].get("minDisplaySeconds").is_none())
    );
    let request = hold_application(&asset);
    let request_json = serde_json::to_value(&request).unwrap();
    assert!(request_json.get("minDisplaySeconds").is_none());
    let baseline = application(&asset, &request).unwrap();
    assert_eq!(baseline.visual_rhythm.min_display_seconds, 0.1);
    assert!(
        baseline
            .elements
            .iter()
            .all(|e| e.min_display_seconds.is_none())
    );
    let mut explicit_null = request_json.clone();
    explicit_null["minDisplaySeconds"] = serde_json::Value::Null;
    let parsed: Application = serde_json::from_value(explicit_null).unwrap();
    assert_eq!(serde_json::to_value(&parsed).unwrap(), request_json);
    assert_eq!(
        super::search::fingerprint(&request),
        super::search::fingerprint(&parsed)
    );
    assert_eq!(
        serde_json::to_value(application(&asset, &parsed).unwrap()).unwrap(),
        serde_json::to_value(&baseline).unwrap()
    );
    let result = super::rhythm::plan(hold_plan(baseline)).unwrap();
    assert_eq!(
        result
            .elements
            .iter()
            .map(|e| (e.start, e.end))
            .collect::<Vec<_>>(),
        vec![(0.05, 0.2), (0.48, 0.7)]
    );
}
#[test]
fn local_display_hold_extends_short_keywords_without_changing_words_or_crossing_next_event() {
    let mut asset = hold_asset();
    asset.min_display_seconds = Some(0.65);
    let template = application(&asset, &hold_application(&asset)).unwrap();
    let input = hold_plan(template);
    let words = serde_json::to_value(&input.words).unwrap();
    let result = super::rhythm::plan(input.clone()).unwrap();
    let intervals = result
        .elements
        .iter()
        .map(|e| (e.start, e.end))
        .collect::<Vec<_>>();
    assert_eq!(intervals[0], (0.05, 0.48));
    assert!((intervals[1].1 - 1.13).abs() < 1e-9);
    assert_eq!(serde_json::to_value(&input.words).unwrap(), words);
    let mut explicit = input.clone();
    for e in &mut explicit.template.elements {
        e.timing.end_anchor = Some(EndAnchor::EventEnd);
    }
    assert_eq!(
        super::rhythm::plan(explicit)
            .unwrap()
            .elements
            .iter()
            .map(|e| e.end)
            .collect::<Vec<_>>(),
        vec![0.2, 0.7]
    );
    let mut negative = input;
    for unit in &mut negative.semantic_units {
        unit.keyword = None;
    }
    assert!(super::rhythm::plan(negative).unwrap().elements.is_empty());
}
#[test]
fn local_display_hold_respects_leaf_precedence_and_rejects_invalid_defaults_and_overrides() {
    let mut asset = hold_asset();
    asset.min_display_seconds = Some(0.65);
    let mut request = hold_application(&asset);
    request.min_display_seconds = Some(0.8);
    assert!(
        application(&asset, &request)
            .unwrap()
            .elements
            .iter()
            .all(|e| e.min_display_seconds == Some(0.8))
    );
    for layer in &mut asset.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            element.min_display_seconds = Some(0.4);
        }
    }
    assert!(
        application(&asset, &request)
            .unwrap()
            .elements
            .iter()
            .all(|e| e.min_display_seconds == Some(0.4))
    );
    for invalid in [0., 0.099, 3.001, f64::NAN, f64::INFINITY] {
        asset.min_display_seconds = Some(invalid);
        assert!(asset.project(&BTreeMap::new()).is_err());
        asset.min_display_seconds = None;
        request.min_display_seconds = Some(invalid);
        assert!(application(&asset, &request).is_err());
    }
    request.min_display_seconds = None;
    for layer in &mut asset.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            element.min_display_seconds = Some(0.01);
        }
    }
    assert!(application(&asset, &request).is_err());
}
#[test]
fn inserted_display_hold_keeps_host_policy_and_captures_effective_leaf_values() {
    let mut asset = hold_asset();
    asset.min_display_seconds = Some(0.65);
    let mut host: Template =
        serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
    host.visual_rhythm.min_display_seconds = 0.3;
    let host_elements = serde_json::to_value(&host.elements).unwrap();
    let request:Insert=serde_json::from_value(json!({"template":host,"assetId":asset.id,"assetRevision":asset.revision,
        "instanceId":"clock","placement":{"x":0.,"y":0.,"width":1.,"height":1.},"minDisplaySeconds":0.8})).unwrap();
    let result = insert_configured(request, &asset).unwrap();
    assert_eq!(result["instance"]["minDisplaySeconds"], 0.8);
    let combined: Template = serde_json::from_value(result["template"].clone()).unwrap();
    assert_eq!(combined.visual_rhythm.min_display_seconds, 0.3);
    assert_eq!(
        serde_json::to_value(&combined.elements[..host_elements.as_array().unwrap().len()])
            .unwrap(),
        host_elements
    );
    assert!(
        combined
            .elements
            .iter()
            .filter(|e| e.id.starts_with("clock--"))
            .all(|e| e.min_display_seconds == Some(0.8))
    );
    let captured = capture(Capture {
        template: combined,
        name: "Captured with independent holds".into(),
    })
    .unwrap();
    let projected = captured.project(&BTreeMap::new()).unwrap();
    assert!(
        projected
            .elements
            .iter()
            .filter(|e| e.id.starts_with("clock--"))
            .all(|e| e.min_display_seconds == Some(0.8))
    );
    assert!(
        projected
            .elements
            .iter()
            .filter(|e| !e.id.starts_with("clock--"))
            .all(|e| e.min_display_seconds == Some(0.3))
    );
    assert_eq!(asset.min_display_seconds, Some(0.65));
}
#[test]
fn saved_display_hold_uses_revision_cas_and_preserves_old_definition_snapshot() {
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    let saved = save(
        &db,
        Save {
            definition: hold_asset(),
            base_revision: 0,
            idempotency_key: "hold-original".into(),
        },
    )
    .unwrap();
    let original = serde_json::to_value(&saved).unwrap();
    let mut next = saved.clone();
    next.min_display_seconds = Some(0.65);
    let updated = save(
        &db,
        Save {
            definition: next.clone(),
            base_revision: saved.revision,
            idempotency_key: "hold-updated".into(),
        },
    )
    .unwrap();
    assert_eq!(updated.revision, 2);
    assert_eq!(
        db.get::<serde_json::Value>("dynamic_asset_version", &format!("{}-r1", saved.id))
            .unwrap(),
        original
    );
    assert!(
        save(
            &db,
            Save {
                definition: next,
                base_revision: saved.revision,
                idempotency_key: "hold-stale".into()
            }
        )
        .is_err()
    );
    assert_eq!(
        db.get::<serde_json::Value>(RECORD, &saved.id).unwrap(),
        serde_json::to_value(updated).unwrap()
    );
}

#[test]
fn application_rotation_is_optional_validated_and_insertion_preserves_its_scope() {
    let asset = fixture();
    let mut request:Application=serde_json::from_value(json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":{"width":1280,"height":720,"fps":30},"placement":{"x":0,"y":0,"width":1,"height":1},"transform":{"scale":0.4,"centerX":0.3,"centerY":0.6}})).unwrap();
    assert!(
        serde_json::to_value(&request).unwrap()["transform"]
            .get("rotationDegrees")
            .is_none()
    );
    let original = application(&asset, &request).unwrap();
    assert!(
        serde_json::to_value(&original).unwrap()["composition"]
            .get("rigidTransforms")
            .is_none()
    );
    request.transform.as_mut().unwrap().rotation_degrees = Some(0.);
    let mut zero = application(&asset, &request).unwrap();
    zero.id = original.id.clone();
    assert_eq!(
        serde_json::to_value(&original).unwrap(),
        serde_json::to_value(zero).unwrap()
    );
    for angle in [90., -90., 180.] {
        request.transform.as_mut().unwrap().rotation_degrees = Some(angle);
        let projected = application(&asset, &request).unwrap();
        assert_eq!(
            serde_json::to_value(&projected.elements).unwrap(),
            serde_json::to_value(&original.elements).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&projected.styles).unwrap(),
            serde_json::to_value(&original.styles).unwrap()
        );
        assert_eq!(
            projected.composition.rigid_transforms[0].rotation_degrees,
            angle
        );
        let inserted=insert_configured(serde_json::from_value(json!({"template":original,"assetId":asset.id,"assetRevision":asset.revision,"instanceId":"extra","placement":request.placement,"transform":request.transform})).unwrap(),&asset).unwrap();
        let rotation = &inserted["template"]["composition"]["rigidTransforms"][0];
        assert_eq!(rotation["id"], "extra--application-rotation");
        assert!(
            rotation["elementIds"]
                .as_array()
                .unwrap()
                .iter()
                .all(|id| id.as_str().unwrap().starts_with("extra--"))
        );
        assert_eq!(inserted["instance"]["transform"]["rotationDegrees"], angle);
        assert!(
            capture(Capture {
                template: projected,
                name: "cannot discard rotation".into()
            })
            .is_err()
        );
    }
    for invalid in [181., -181., f64::NAN, f64::INFINITY] {
        request.transform.as_mut().unwrap().rotation_degrees = Some(invalid);
        assert!(
            application(&asset, &request)
                .unwrap_err()
                .to_string()
                .contains("rotation")
        );
    }
}

fn text_size_binding_asset() -> Definition {
    let mut asset = create(Create {
        name: "Measured frame".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::DecorativeText),
    })
    .unwrap();
    let mut child = asset
        .layers
        .iter()
        .find(|l| matches!(l.content, LayerContent::Element { .. }))
        .unwrap()
        .clone();
    let LayerContent::Element { element } = &mut child.content else {
        unreachable!()
    };
    element.id = "frame".into();
    element.features.representation = Representation::Ellipse;
    element.region = Rect {
        x: 0.4,
        y: 0.4,
        width: 0.1,
        height: 0.05,
    };
    element.motions.clear();
    element.motion_timing = None;
    asset.layers.push(child);
    asset.spatial_relations=serde_json::from_value(json!([{"elementId":"frame","relativeTo":"headline","placement":"right","gap":0.01,"offsetX":0.,"offsetY":0.,"referenceBounds":"text_box","followMotion":true,"sizeBinding":{"width":{"factor":1.2,"padding":0.02},"height":{"factor":1.,"padding":0.01}}}])).unwrap();
    asset.project(&BTreeMap::new()).unwrap();
    asset
}

#[test]
fn text_size_binding_survives_asset_projection_insertion_and_namespaced_duplication() {
    use super::dynamic_asset_edit::{Edit, Operation, edit};
    let asset = text_size_binding_asset();
    let before = serde_json::to_value(&asset).unwrap();
    for (width, height) in [(1280, 720), (720, 1280)] {
        let mut host: Template =
            serde_json::from_value(composition_tests::input()["template"].clone()).unwrap();
        host.canvas = Canvas {
            width,
            height,
            fps: 30,
        };
        let placement = Rect {
            x: 0.1,
            y: 0.1,
            width: 0.8,
            height: 0.6,
        };
        let output = insert(host, &asset, "fit", &BTreeMap::new(), Some(&placement)).unwrap();
        let projected: Template = serde_json::from_value(output["template"].clone()).unwrap();
        let relation = &projected.composition.spatial_relations[0];
        assert_eq!(relation.element_id, "fit--frame");
        assert_eq!(relation.relative_to, "fit--headline");
        let size = relation.size_binding.as_ref().unwrap();
        let scale = (0.8 * width as f64 / 720.).min(0.6 * height as f64 / 720.);
        assert!(
            (size.width.as_ref().unwrap().padding * width as f64 - 0.02 * 720. * scale).abs()
                < 1e-9
        );
        assert!(
            (size.height.as_ref().unwrap().padding * height as f64 - 0.01 * 720. * scale).abs()
                < 1e-9
        );
        assert_eq!(size.width.as_ref().unwrap().factor, 1.2);
        assert_eq!(size.height.as_ref().unwrap().factor, 1.);
    }
    let copied = edit(Edit {
        definition: asset.clone(),
        operation: Operation::Duplicate {
            layer_id: "root".into(),
        },
    })
    .unwrap();
    let definition: Definition = serde_json::from_value(copied["definition"].clone()).unwrap();
    assert_eq!(definition.spatial_relations.len(), 2);
    let relation = &definition.spatial_relations[1];
    assert_ne!(relation.element_id, "frame");
    assert_ne!(relation.relative_to, "headline");
    assert_eq!(
        serde_json::to_value(&relation.size_binding).unwrap(),
        before["spatialRelations"][0]["sizeBinding"]
    );
    assert_eq!(serde_json::to_value(&asset).unwrap(), before);
}

#[test]
fn text_size_binding_frame_scale_uses_attachment_anchor_and_detach_bakes_measured_size() {
    use super::dynamic_asset_edit::{Edit, FramePose, FrameScaleAxis, Operation, edit};
    let asset = text_size_binding_asset();
    // Visible frame is 144x36px. Right placement anchors its left midpoint.
    // Scaling from that edge should not also move the relationship offset.
    for axis in [None, Some(FrameScaleAxis::X)] {
        let output = edit(Edit {
            definition: asset.clone(),
            operation: Operation::ScaleInFrame {
                layer_id: "frame".into(),
                delta: [72., 0.],
                diagonal: [144., 0.],
                pivot_to_origin: [72., 0.],
                basis: [1., 0., 0., 1.],
                axis,
                visual_basis: Some([0.2, 0., 0., 0.05]),
            },
        })
        .unwrap();
        let definition: Definition = serde_json::from_value(output["definition"].clone()).unwrap();
        assert_eq!(definition.spatial_relations[0].offset_x, 0.);
        assert_eq!(definition.spatial_relations[0].offset_y, 0.);
        assert!(definition.spatial_relations[0].size_binding.is_some());
        let element = definition
            .project(&BTreeMap::new())
            .unwrap()
            .elements
            .into_iter()
            .find(|e| e.id == "frame")
            .unwrap();
        assert!(element.motions.iter().any(|m| matches!(
            m.property,
            MotionProperty::Scale | MotionProperty::ScaleX
        ) && m.keys.iter().all(|k| k.value == 1.5)));
    }
    assert!(
        edit(Edit {
            definition: asset.clone(),
            operation: Operation::ScaleInFrame {
                layer_id: "frame".into(),
                delta: [72., 0.],
                diagonal: [144., 0.],
                pivot_to_origin: [72., 0.],
                basis: [1., 0., 0., 1.],
                axis: None,
                visual_basis: None
            }
        })
        .is_err()
    );
    let pose = |position, basis| FramePose {
        scene_time: 100,
        local_time: 100,
        position,
        basis,
    };
    let output = edit(Edit {
        definition: asset,
        operation: Operation::DetachInFrame {
            layer_id: "frame".into(),
            attached: pose([35., 25.], [0.2, 0., 0., 0.15]),
            independent: pose([10., 10.], [0.1, 0., 0., 0.05]),
        },
    })
    .unwrap();
    let definition: Definition = serde_json::from_value(output["definition"].clone()).unwrap();
    assert!(definition.spatial_relations.is_empty());
    let element = definition
        .project(&BTreeMap::new())
        .unwrap()
        .elements
        .into_iter()
        .find(|e| e.id == "frame")
        .unwrap();
    assert_eq!(
        element
            .motions
            .iter()
            .find(|m| m.property == MotionProperty::ScaleX)
            .unwrap()
            .keys[0]
            .value,
        2.
    );
    assert!(
        (element
            .motions
            .iter()
            .find(|m| m.property == MotionProperty::ScaleY)
            .unwrap()
            .keys[0]
            .value
            - 3.)
            .abs()
            < 1e-12
    );
}

#[test]
fn text_size_binding_placement_advice_requires_rendered_geometry_even_when_static_clear() {
    let asset = text_size_binding_asset();
    let request=serde_json::from_value(json!({"application":{"assetId":asset.id,"assetRevision":asset.revision,"canvas":asset.canvas,"placement":{"x":0.,"y":0.,"width":1.,"height":1.}},"protectedRegions":[]})).unwrap();
    let advice = super::placement_advice::advise(&asset, &request).unwrap();
    assert_eq!(
        advice["measuredGeometryCheck"]["status"],
        "requires_render_measurement"
    );
    assert_eq!(advice["measuredGeometryCheck"]["placementCertified"], false);
    assert_eq!(
        advice["measuredGeometryCheck"]["elementIds"],
        json!(["frame"])
    );
    assert!(
        advice["limitations"]
            .as_array()
            .unwrap()
            .iter()
            .any(|text| text.as_str().unwrap().contains("Size-bound graphics"))
    );
}

#[test]
fn exit_sampling_group_preview_reports_prediction_without_rejecting_cut() {
    use super::composition::TreatmentOperation;
    use super::dynamic_asset_edit::{Edit, Operation, edit};
    let mut asset = fixture();
    for layer in &mut asset.layers {
        match &mut layer.content {
            LayerContent::Group { composite, .. } => *composite = true,
            LayerContent::Element { element } => {
                element.timing.anchor = Anchor::VideoStart;
                element.timing.max_seconds = 600.;
                element.timing.min_seconds = 0.01;
            }
        }
    }
    let saved = edit(Edit {
        definition: asset,
        operation: Operation::GroupFade {
            layer_id: "root".into(),
            exit_seconds: Some(0.04),
            enter_seconds: Some(0.09),
        },
    })
    .unwrap();
    let mut definition: Definition = serde_json::from_value(saved["definition"].clone()).unwrap();
    for treatment in &mut definition.treatments {
        if let TreatmentOperation::Motion {
            motion_timing: Some(t),
            ..
        } = &mut treatment.operation
        {
            t.coverage = Some(MotionCoverage {
                min_exit_frames: 1,
                min_post_frames: 1,
            });
        }
    }
    let p = preview(Preview {
        definition: definition.clone(),
        inputs: BTreeMap::new(),
        duration_seconds: 1.0,
        example: None,
    })
    .unwrap();
    assert_eq!(p["exitSampling"]["basis"], "predicted_frame_sampling");
    assert_eq!(p["exitSampling"]["status"], "warning");
    assert!(
        p["exitSampling"]["records"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["findings"]
                .as_array()
                .unwrap()
                .contains(&json!("insufficient_post_frames")))
    );
    for treatment in &mut definition.treatments {
        if let TreatmentOperation::Motion {
            motion_timing: Some(t),
            ..
        } = &mut treatment.operation
        {
            t.coverage = None;
        }
    }
    let p = preview(Preview {
        definition,
        inputs: BTreeMap::new(),
        duration_seconds: 1.0,
        example: None,
    })
    .unwrap();
    assert_eq!(p["exitSampling"]["status"], "not_requested");
}

fn reading_replica_fixture() -> Definition {
    let mut definition = fixture();
    let mut replica = definition
        .layers
        .iter()
        .find_map(|l| match &l.content {
            LayerContent::Element { element } => Some(element.clone()),
            _ => None,
        })
        .unwrap();
    replica.id = "echo".into();
    replica.features.role = Some(Role::Decoration);
    definition.layers.push(Layer {
        parent_id: Some("root".into()),
        content: LayerContent::Element { element: replica },
    });
    definition.inputs[0].layer_ids.push("echo".into());
    definition
        .reading_replicas
        .push(composition::ReadingReplica {
            element_id: "echo".into(),
            primary_id: "caption".into(),
        });
    definition
}

#[test]
fn reading_replica_validation_rejects_false_content_roles_and_relations() {
    let original = reading_replica_fixture();
    original.project(&BTreeMap::new()).unwrap();
    for case in 0..7 {
        let mut definition = original.clone();
        match case {
            0 => definition.reading_replicas[0].primary_id = "echo".into(),
            1 => definition.reading_replicas[0].primary_id = "missing".into(),
            2 => definition
                .reading_replicas
                .push(definition.reading_replicas[0].clone()),
            3 => {
                if let LayerContent::Element { element } = &mut definition.layers[0].content {
                    element.features.role = Some(Role::Decoration)
                }
            }
            4 => {
                if let LayerContent::Element { element } = &mut definition.layers[2].content {
                    element.features.role = Some(Role::Emphasis)
                }
            }
            5 => {
                if let LayerContent::Element { element } = &mut definition.layers[2].content {
                    element.binding = Binding::Keyword
                }
            }
            _ => {
                definition.inputs[0].layer_ids.pop();
                if let LayerContent::Element { element } = &mut definition.layers[2].content {
                    element.literal = Some("independent text".into())
                }
            }
        }
        assert!(definition.project(&BTreeMap::new()).is_err(), "case {case}");
    }
}
#[test]
fn reading_replica_copy_delete_namespace_and_snapshot_history() {
    use super::dynamic_asset_edit::{self, Edit, Operation};
    let definition = reading_replica_fixture();
    let edit = |definition: Definition, operation: Operation| -> Definition {
        serde_json::from_value(
            dynamic_asset_edit::edit(Edit {
                definition,
                operation,
            })
            .unwrap()["definition"]
                .clone(),
        )
        .unwrap()
    };
    let copied = edit(
        definition.clone(),
        Operation::Duplicate {
            layer_id: "root".into(),
        },
    );
    assert_eq!(copied.reading_replicas.len(), 2);
    assert_ne!(copied.reading_replicas[1].element_id, "echo");
    assert_ne!(copied.reading_replicas[1].primary_id, "caption");
    let removed = edit(
        definition.clone(),
        Operation::Remove {
            layer_id: "caption".into(),
        },
    );
    assert!(removed.reading_replicas.is_empty());
    let cleared = edit(
        definition.clone(),
        Operation::ReadingReplica {
            layer_id: "echo".into(),
            primary_id: None,
        },
    );
    assert!(cleared.reading_replicas.is_empty());
    let restored = edit(
        cleared,
        Operation::ReadingReplica {
            layer_id: "echo".into(),
            primary_id: Some("caption".into()),
        },
    );
    assert_eq!(restored.reading_replicas.len(), 1);
    let host = definition.project(&BTreeMap::new()).unwrap();
    let inserted = insert(host, &definition, "instance-a", &BTreeMap::new(), None).unwrap();
    let relations = &inserted["template"]["composition"]["readingReplicas"];
    assert_eq!(relations.as_array().unwrap().len(), 2);
    assert_eq!(
        relations[1]["elementId"],
        inserted["instance"]["layerMap"]["echo"]
    );
    assert_eq!(
        relations[1]["primaryId"],
        inserted["instance"]["layerMap"]["caption"]
    );
    let mut captured_template = definition.project(&BTreeMap::new()).unwrap();
    captured_template
        .composition
        .groups
        .iter_mut()
        .for_each(|g| g.composite = true);
    let captured = capture(Capture {
        template: captured_template,
        name: "captured replica".into(),
    })
    .unwrap();
    assert_eq!(captured.reading_replicas.len(), 1);
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    let first = save(
        &db,
        Save {
            definition,
            base_revision: 0,
            idempotency_key: "replica-v1".into(),
        },
    )
    .unwrap();
    let mut next = first.clone();
    next.reading_replicas.clear();
    save(
        &db,
        Save {
            definition: next,
            base_revision: 1,
            idempotency_key: "replica-v2".into(),
        },
    )
    .unwrap();
    let historical: Definition = db
        .get("dynamic_asset_version", &format!("{}-r1", first.id))
        .unwrap();
    assert_eq!(historical.reading_replicas.len(), 1);
    assert_eq!(
        historical
            .project(&BTreeMap::new())
            .unwrap()
            .composition
            .reading_replicas
            .len(),
        1
    );
}

#[test]
fn reading_replica_can_clear_invalid_relation_without_losing_unsaved_draft() {
    use super::dynamic_asset_edit::{self, Edit, Operation};
    for changed_role in [false, true] {
        let mut definition = reading_replica_fixture();
        definition.name = "unsaved draft".into();
        definition.styles[0].font_size = 99.;
        if changed_role {
            if let LayerContent::Element { element } = &mut definition.layers[2].content {
                element.features.role = Some(Role::Emphasis);
            }
        } else {
            definition.inputs[0].layer_ids.pop();
            if let LayerContent::Element { element } = &mut definition.layers[2].content {
                element.literal = Some("new distinct text".into());
            }
        }
        assert!(definition.project(&BTreeMap::new()).is_err());
        let original = definition.clone();
        let output = dynamic_asset_edit::edit(Edit {
            definition,
            operation: Operation::ReadingReplica {
                layer_id: "echo".into(),
                primary_id: None,
            },
        })
        .unwrap();
        let cleared: Definition = serde_json::from_value(output["definition"].clone()).unwrap();
        assert!(cleared.reading_replicas.is_empty());
        let mut expected = original.clone();
        expected.reading_replicas.clear();
        assert_eq!(
            serde_json::to_value(&cleared).unwrap(),
            serde_json::to_value(expected).unwrap()
        );
        // Clearing the relation cannot bypass unrelated invalid draft fields.
        let mut bad = original;
        bad.styles[0].font_size = -1.;
        assert!(
            dynamic_asset_edit::edit(Edit {
                definition: bad,
                operation: Operation::ReadingReplica {
                    layer_id: "echo".into(),
                    primary_id: None
                }
            })
            .is_err()
        );
    }
}
