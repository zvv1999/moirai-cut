use super::super::dynamic_asset::{Create, CreatePurpose, Save as SaveAsset};
use super::super::model::Canvas;
use super::*;

fn fixture() -> (Store, Definition, Value) {
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    let asset = dynamic_asset::create(Create {
        name: "history fixture".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: Some(CreatePurpose::Keyword),
    })
    .unwrap();
    let asset = dynamic_asset::save(
        &db,
        SaveAsset {
            definition: asset,
            base_revision: 0,
            idempotency_key: "asset-create".into(),
        },
    )
    .unwrap();
    let application = json!({"assetId":asset.id,"assetRevision":asset.revision,"canvas":asset.canvas,
        "placement":{"x":0.,"y":0.,"width":1.,"height":1.},"inputs":{}});
    (db, asset, application)
}
fn submission(application: &Value, key: &str, parent: Option<&str>) -> Save {
    serde_json::from_value(json!({"idempotencyKey":key,"contextId":"trial-a","application":application,
        "reason":"Keep graphic readable while avoiding the speaker","parentId":parent,"uiState":{"captionDraft":"new text"}})).unwrap()
}
fn all_records(db: &Store) -> Value {
    db.transaction(|db| {
        let mut statement = db.prepare("SELECT kind,id,body FROM records ORDER BY kind,id")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        Ok(json!(rows.collect::<std::result::Result<Vec<_>, _>>()?))
    })
    .unwrap()
}
#[test]
fn immutable_checkpoints_are_idempotent_and_track_context_parent_changes() {
    let (db, asset, application) = fixture();
    let saved_asset = serde_json::to_value(&asset).unwrap();
    let original = save(&db, submission(&application, "first", None)).unwrap();
    let first = original["record"]["id"].as_str().unwrap();
    assert_eq!(
        save(&db, submission(&application, "first", None)).unwrap(),
        original
    );
    let mut conflict = submission(&application, "first", None);
    conflict.reason = "changed payload".into();
    assert!(
        save(&db, conflict)
            .unwrap_err()
            .to_string()
            .contains("idempotency")
    );
    let mut altered = application.clone();
    altered["transform"] = json!({"scale":0.7,"centerX":0.7,"centerY":0.4});
    let second = save(&db, submission(&altered, "second", Some(first))).unwrap();
    assert_eq!(
        read(&db, first).unwrap(),
        original,
        "later saves never modify a checkpoint"
    );
    assert_eq!(
        second["record"]["changes"][0]["path"],
        "/application/transform"
    );
    assert_eq!(second["record"]["changes"][0]["before"], Value::Null);
    assert_eq!(second["record"]["changes"][0]["after"]["scale"], 0.7);
    assert!(save(&db, submission(&application, "stale-parent", Some(first))).is_err());
    let mut crossed = submission(&application, "cross-context", Some(first));
    crossed.context_id = "trial-b".into();
    assert!(save(&db, crossed).is_err());
    let list = list(
        &db,
        Query {
            asset_id: Some(asset.id.clone()),
            context_id: None,
        },
    )
    .unwrap();
    assert_eq!(list["records"].as_array().unwrap().len(), 2);
    assert_eq!(list["heads"][0]["recordId"], second["record"]["id"]);
    assert_eq!(original["status"]["contentScope"], "parameters_only");
    assert_eq!(original["status"]["qualityVerified"], false);
    assert_eq!(
        db.get::<Value>(dynamic_asset::RECORD, &asset.id).unwrap(),
        saved_asset
    );
}
#[test]
fn restore_backs_up_current_state_atomically_and_retries_do_not_duplicate() {
    let (db, asset, application) = fixture();
    let project = json!({"revision":17,"metadata":{"name":"user original"}});
    db.put("project", "untouched", &project).unwrap();
    let first = save(&db, submission(&application, "first", None)).unwrap();
    let first_id = first["record"]["id"].as_str().unwrap();
    let mut altered = application.clone();
    altered["transform"] = json!({"scale":0.8,"centerX":0.4,"centerY":0.5});
    let current = || Restore {
        current: submission(&altered, "restore-current", Some(first_id)),
    };
    let restored = restore(&db, first_id, current()).unwrap();
    assert_eq!(
        restored["record"]["submission"]["application"]["transform"],
        Value::Null
    );
    assert_eq!(
        restored["backup"]["record"]["submission"]["application"]["transform"]["scale"],
        0.8
    );
    assert_eq!(
        restored["parentIdForNextSave"],
        restored["backup"]["record"]["id"]
    );
    let before_retry = all_records(&db);
    assert!(
        restore(
            &db,
            first_id,
            Restore {
                current: submission(&application, "first", None)
            }
        )
        .unwrap_err()
        .to_string()
        .contains("fresh idempotency key")
    );
    assert_eq!(before_retry, all_records(&db));
    assert_eq!(restore(&db, first_id, current()).unwrap(), restored);
    assert_eq!(before_retry, all_records(&db));
    let backup_id = restored["backup"]["record"]["id"].as_str().unwrap();
    assert!(
        restore(&db, backup_id, current())
            .unwrap_err()
            .to_string()
            .contains("different target")
    );
    assert_eq!(before_retry, all_records(&db));
    assert_eq!(db.get::<Value>("project", "untouched").unwrap(), project);
    assert_eq!(
        db.get::<Value>(dynamic_asset::RECORD, &asset.id).unwrap(),
        serde_json::to_value(asset).unwrap()
    );
}
#[test]
fn stale_style_is_readable_but_restore_and_new_save_leave_store_unchanged() {
    let (db, mut asset, application) = fixture();
    let first = save(&db, submission(&application, "first", None)).unwrap();
    let first_id = first["record"]["id"].as_str().unwrap();
    asset.name = "new revision".into();
    dynamic_asset::save(
        &db,
        SaveAsset {
            definition: asset,
            base_revision: 1,
            idempotency_key: "asset-update".into(),
        },
    )
    .unwrap();
    let before = all_records(&db);
    let historical = read(&db, first_id).unwrap();
    assert_eq!(historical["record"], first["record"]);
    assert_eq!(historical["status"]["restorable"], false);
    assert_eq!(historical["status"]["assetsCurrent"], false);
    assert!(
        restore(
            &db,
            first_id,
            Restore {
                current: submission(&application, "restore", Some(first_id))
            }
        )
        .is_err()
    );
    assert!(save(&db, submission(&application, "new", Some(first_id))).is_err());
    assert_eq!(all_records(&db), before);
}

fn add_input(db: &Store) -> Value {
    let input = json!({"id":"input-a","name":"fixture","sha256":"a".repeat(64),"durationSeconds":2.,"mediaKind":"audio","width":null,"height":null,"createdAt":1});
    db.put("template_input", "input-a", &input).unwrap();
    let transcript = json!({"revision":1,"inputId":"input-a","sourceSha256":"a".repeat(64),"engine":"fixture","language":"en","languageProbability":1.,
        "rawWords":[],"words":[{"text":"light","start":0.2,"end":0.8,"speaker":null,"emphasis":0.}],"text":"light","segments":[],"warnings":[],"createdAt":1});
    db.put("template_transcript", "input-a", &transcript)
        .unwrap();
    json!({"inputId":"input-a","transcriptRevision":1,"title":"fixture","translations":[],
        "semanticUnits":[{"startWord":0,"endWord":1,"intent":"emphasis","keyword":{"startWord":0,"endWord":1},"rationale":"input annotation"}],
        "captionSpans":[{"startWord":0,"endWord":1}],"events":[],"soundEvents":[],"resourceBindings":[],"focalPoint":null})
}
#[test]
fn annotation_snapshots_pin_transcript_and_reject_invalid_ranges() {
    let (db, _asset, application) = fixture();
    let sample = add_input(&db);
    let mut invalid = sample.clone();
    invalid["semanticUnits"][0]["endWord"] = json!(9);
    let before = all_records(&db);
    let mut invalid_save = submission(&application, "invalid", None);
    invalid_save.samples = serde_json::from_value(json!([invalid])).unwrap();
    assert!(save(&db, invalid_save).is_err());
    assert_eq!(all_records(&db), before);
    let mut input = submission(&application, "first", None);
    input.samples = serde_json::from_value(json!([sample])).unwrap();
    let first = save(&db, input).unwrap();
    let id = first["record"]["id"].as_str().unwrap();
    assert_eq!(first["status"]["contentScope"], "sample_annotations");
    assert_eq!(
        first["record"]["inputSnapshots"][0]["transcript"]["words"][0]["text"],
        "light"
    );
    let mut transcript = db.get::<Value>("template_transcript", "input-a").unwrap();
    transcript["revision"] = json!(2);
    transcript["words"][0]["text"] = json!("bright");
    db.put("template_transcript", "input-a", &transcript)
        .unwrap();
    let stale = read(&db, id).unwrap();
    assert_eq!(stale["record"], first["record"]);
    assert_eq!(stale["status"]["inputsCurrent"], false);
    assert_eq!(stale["status"]["restorable"], false);
    let before = all_records(&db);
    assert!(
        restore(
            &db,
            id,
            Restore {
                current: submission(&application, "restore", Some(id))
            }
        )
        .is_err()
    );
    assert_eq!(all_records(&db), before);
}
#[test]
fn invalid_current_backup_or_foreign_context_cannot_restore_or_write() {
    let (db, _asset, application) = fixture();
    let first = save(&db, submission(&application, "first", None)).unwrap();
    let first_id = first["record"]["id"].as_str().unwrap();
    let before = all_records(&db);
    let mut bad = application.clone();
    bad["transform"] = json!({"scale":0.,"centerX":0.5,"centerY":0.5});
    assert!(
        restore(
            &db,
            first_id,
            Restore {
                current: submission(&bad, "restore", Some(first_id))
            }
        )
        .is_err()
    );
    let mut foreign = submission(&application, "foreign", None);
    foreign.context_id = "trial-other".into();
    assert!(restore(&db, first_id, Restore { current: foreign }).is_err());
    assert_eq!(all_records(&db), before);
}
#[test]
fn extra_assets_are_pinned_and_invalid_input_metadata_is_not_silently_saved() {
    let (db, asset, application) = fixture();
    let mut extra = dynamic_asset::create(Create {
        name: "secondary".into(),
        canvas: asset.canvas.clone(),
        purpose: Some(CreatePurpose::Decoration),
    })
    .unwrap();
    extra = dynamic_asset::save(
        &db,
        SaveAsset {
            definition: extra,
            base_revision: 0,
            idempotency_key: "second-style".into(),
        },
    )
    .unwrap();
    let mut input = submission(&application, "first", None);
    input.extras=serde_json::from_value(json!([{"assetId":extra.id,"assetRevision":extra.revision,"instanceId":"decoration","placement":{"x":0.,"y":0.,"width":1.,"height":1.}}])).unwrap();
    let first = save(&db, input).unwrap();
    assert_eq!(first["record"]["assets"].as_array().unwrap().len(), 2);
    assert_eq!(first["status"]["restorable"], true);
    dynamic_asset::save(
        &db,
        SaveAsset {
            definition: extra,
            base_revision: 1,
            idempotency_key: "second-style-v2".into(),
        },
    )
    .unwrap();
    assert_eq!(
        read(&db, first["record"]["id"].as_str().unwrap()).unwrap()["status"]["restorable"],
        false
    );
    let before = all_records(&db);
    let mut malformed = submission(&application, "bad-ui", None);
    malformed.ui_state = Some(json!("not object"));
    assert!(save(&db, malformed).is_err());
    let mut evidence = submission(&application, "bad-evidence", None);
    evidence.evidence.push(Evidence {
        kind: "review".into(),
        reference: "".into(),
        notes: "claimed pass".into(),
    });
    assert!(save(&db, evidence).is_err());
    assert_eq!(all_records(&db), before);
}

#[test]
fn display_hold_history_restores_primary_and_inserted_overrides_without_mutating_styles() {
    let (db, asset, application) = fixture();
    let saved_asset = serde_json::to_value(&asset).unwrap();
    let mut proposed = application.clone();
    proposed["minDisplaySeconds"] = json!(0.65);
    let make = |key: &str, parent: Option<&str>, primary: f64, extra: f64| {
        let mut app = proposed.clone();
        app["minDisplaySeconds"] = json!(primary);
        let mut input = submission(&app, key, parent);
        input.extras =
            serde_json::from_value(json!([{"assetId":asset.id,"assetRevision":asset.revision,
            "instanceId":"second","minDisplaySeconds":extra}]))
            .unwrap();
        input
    };
    let first = save(&db, make("hold-first", None, 0.65, 0.9)).unwrap();
    let first_id = first["record"]["id"].as_str().unwrap();
    assert_eq!(first["status"]["restorable"], true);
    assert_eq!(
        first["record"]["submission"]["application"]["minDisplaySeconds"],
        0.65
    );
    assert_eq!(
        first["record"]["submission"]["extras"][0]["minDisplaySeconds"],
        0.9
    );
    let second = save(&db, make("hold-second", Some(first_id), 0.75, 1.)).unwrap();
    let second_id = second["record"]["id"].as_str().unwrap();
    let restored = restore(
        &db,
        first_id,
        Restore {
            current: make("hold-restore", Some(second_id), 0.8, 1.1),
        },
    )
    .unwrap();
    assert_eq!(restored["status"]["projectionCurrent"], true);
    assert_eq!(
        restored["backup"]["record"]["submission"]["application"]["minDisplaySeconds"],
        0.8
    );
    assert_eq!(
        restored["backup"]["record"]["submission"]["extras"][0]["minDisplaySeconds"],
        1.1
    );
    let template: Template = serde_json::from_value(restored["template"].clone()).unwrap();
    assert_eq!(template.visual_rhythm.min_display_seconds, 0.1);
    assert!(
        template
            .elements
            .iter()
            .filter(|e| !e.id.starts_with("second--"))
            .all(|e| e.min_display_seconds == Some(0.65))
    );
    assert!(
        template
            .elements
            .iter()
            .filter(|e| e.id.starts_with("second--"))
            .all(|e| e.min_display_seconds == Some(0.9))
    );
    let before = all_records(&db);
    assert!(save(&db, make("hold-stale", Some(first_id), 0.7, 0.9)).is_err());
    assert!(
        save(
            &db,
            make(
                "hold-invalid",
                Some(restored["parentIdForNextSave"].as_str().unwrap()),
                4.,
                0.9
            )
        )
        .is_err()
    );
    assert_eq!(all_records(&db), before);
    assert_eq!(
        db.get::<Value>(dynamic_asset::RECORD, &asset.id).unwrap(),
        saved_asset
    );
}

#[test]
fn rotation_history_restores_exact_direction_and_projection() {
    let (db, _, mut application) = fixture();
    application["transform"] =
        json!({"scale":0.5,"centerX":0.35,"centerY":0.65,"rotationDegrees":90.});
    let first = save(&db, submission(&application, "turn-first", None)).unwrap();
    let first_id = first["record"]["id"].as_str().unwrap();
    application["transform"]["rotationDegrees"] = json!(-90.);
    let second = save(&db, submission(&application, "turn-second", Some(first_id))).unwrap();
    let second_id = second["record"]["id"].as_str().unwrap();
    let restored = restore(
        &db,
        first_id,
        Restore {
            current: submission(&application, "turn-restore", Some(second_id)),
        },
    )
    .unwrap();
    assert_eq!(
        restored["record"]["submission"]["application"]["transform"]["rotationDegrees"],
        90.
    );
    assert_eq!(
        restored["template"]["composition"]["rigidTransforms"][0]["rotationDegrees"],
        90.
    );
    assert_eq!(restored["status"]["projectionCurrent"], true);
    assert_eq!(
        restored["backup"]["record"]["submission"]["application"]["transform"]["rotationDegrees"],
        -90.
    );
}

#[test]
fn exit_sampling_definition_snapshot_and_restore_preserve_coverage() {
    use super::super::dynamic_asset::LayerContent;
    use super::super::model::{MotionCoverage, MotionTiming};
    let (db, mut asset, mut application) = fixture();
    for layer in &mut asset.layers {
        if let LayerContent::Element { element } = &mut layer.content {
            element.motion_timing = Some(MotionTiming {
                enter_end: 0.2,
                exit_start: 0.8,
                enter_seconds: 0.1,
                exit_seconds: 0.1,
                coverage: Some(MotionCoverage {
                    min_exit_frames: 1,
                    min_post_frames: 2,
                }),
            });
        }
    }
    let asset = dynamic_asset::save(
        &db,
        SaveAsset {
            definition: asset,
            base_revision: 1,
            idempotency_key: "sampling-style".into(),
        },
    )
    .unwrap();
    application["assetRevision"] = json!(asset.revision);
    let saved = save(&db, submission(&application, "sampling-first", None)).unwrap();
    let id = saved["record"]["id"].as_str().unwrap();
    assert!(
        saved["record"]["assets"]
            .to_string()
            .contains("minPostFrames")
    );
    let mut changed = application.clone();
    changed["transform"] = json!({"scale":0.9,"centerX":0.5,"centerY":0.5});
    let restored = restore(
        &db,
        id,
        Restore {
            current: submission(&changed, "sampling-backup", Some(id)),
        },
    )
    .unwrap();
    assert_eq!(restored["record"]["assets"], saved["record"]["assets"]);
    assert_eq!(
        restored["record"]["assets"][0],
        serde_json::to_value(asset).unwrap()
    );
}

#[test]
fn reading_replica_application_restore_keeps_frozen_relation_after_style_changes() {
    use super::super::{
        composition::ReadingReplica,
        dynamic_asset::{Layer, LayerContent},
        model::Role,
    };
    let (db, mut asset, mut application) = fixture();
    let primary = asset
        .layers
        .iter()
        .find_map(|l| match &l.content {
            LayerContent::Element { element } => Some((l.parent_id.clone(), element.clone())),
            _ => None,
        })
        .unwrap();
    let mut replica = primary.1.clone();
    replica.id = "reading-echo".into();
    replica.features.role = Some(Role::Decoration);
    asset.layers.push(Layer {
        parent_id: primary.0,
        content: LayerContent::Element { element: replica },
    });
    asset.reading_replicas.push(ReadingReplica {
        element_id: "reading-echo".into(),
        primary_id: primary.1.id,
    });
    let saved_asset = dynamic_asset::save(
        &db,
        SaveAsset {
            definition: asset,
            base_revision: 1,
            idempotency_key: "reading-style".into(),
        },
    )
    .unwrap();
    application["assetRevision"] = json!(saved_asset.revision);
    let saved = save(&db, submission(&application, "reading-first", None)).unwrap();
    let id = saved["record"]["id"].as_str().unwrap();
    let mut changed = application.clone();
    changed["transform"] = json!({"scale":0.8,"centerX":0.5,"centerY":0.5});
    let restored = restore(
        &db,
        id,
        Restore {
            current: submission(&changed, "reading-backup", Some(id)),
        },
    )
    .unwrap();
    assert_eq!(
        restored["record"]["assets"][0],
        serde_json::to_value(&saved_asset).unwrap()
    );
    assert_eq!(
        restored["record"]["assets"][0]["readingReplicas"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let mut newer = saved_asset.clone();
    newer.reading_replicas.clear();
    dynamic_asset::save(
        &db,
        SaveAsset {
            definition: newer,
            base_revision: 2,
            idempotency_key: "reading-style-new".into(),
        },
    )
    .unwrap();
    let reread = read(&db, id).unwrap();
    assert_eq!(
        reread["record"]["assets"][0]["readingReplicas"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(
        restore(
            &db,
            id,
            Restore {
                current: submission(&changed, "reading-stale", Some(id))
            }
        )
        .is_err()
    );
}

#[test]
fn placement_rule_history_preserves_typed_constraints_and_restores_without_style_changes() {
    let (db, asset, application) = fixture();
    let legacy = submission(&application, "legacy", None);
    let serialized = serde_json::to_value(&legacy).unwrap();
    assert!(serialized.get("placementPolicy").is_none());
    assert!(serialized.get("placementPadding").is_none());
    let first = save(&db, legacy).unwrap();
    let first_id = first["record"]["id"].as_str().unwrap();
    let mut configured = submission(&application, "rule", Some(first_id));
    configured.placement_policy = Some(Policy {
        safe_inset: 0.04,
        require_full_coverage: true,
    });
    configured.placement_padding = Some(0.03);
    let second = save(&db, configured).unwrap();
    let second_id = second["record"]["id"].as_str().unwrap();
    assert_eq!(
        second["record"]["submission"]["placementPolicy"],
        json!({"safeInset":0.04,"requireFullCoverage":true})
    );
    assert_eq!(second["record"]["submission"]["placementPadding"], 0.03);
    let paths: Vec<_> = second["record"]["changes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|change| change["path"].as_str().unwrap())
        .collect();
    assert!(paths.contains(&"/placementPolicy"));
    assert!(paths.contains(&"/placementPadding"));
    let restored = restore(
        &db,
        second_id,
        Restore {
            current: submission(&application, "backup", Some(second_id)),
        },
    )
    .unwrap();
    assert_eq!(
        restored["record"]["submission"]["placementPolicy"],
        second["record"]["submission"]["placementPolicy"]
    );
    assert_eq!(restored["record"]["submission"]["placementPadding"], 0.03);
    assert!(
        restored["backup"]["record"]["submission"]
            .get("placementPolicy")
            .is_none()
    );
    assert_eq!(restored["status"]["qualityVerified"], false);
    assert_eq!(
        db.get::<Value>(dynamic_asset::RECORD, &asset.id).unwrap(),
        serde_json::to_value(asset).unwrap()
    );
}

#[test]
fn placement_rule_history_rejects_invalid_constraints_atomically() {
    let (db, _, application) = fixture();
    let before = all_records(&db);
    for invalid in [-0.01, 0.251, f64::INFINITY, f64::NAN] {
        let mut request = submission(&application, "invalid-policy", None);
        request.placement_policy = Some(Policy {
            safe_inset: invalid,
            require_full_coverage: false,
        });
        assert!(save(&db, request).is_err());
        let mut request = submission(&application, "invalid-padding", None);
        request.placement_padding = Some(invalid);
        assert!(save(&db, request).is_err());
        assert_eq!(all_records(&db), before);
    }
}

fn protected_submission(application: &Value, sample: &Value, key: &str) -> Save {
    let mut input = submission(application, key, None);
    input.samples = serde_json::from_value(json!([sample])).unwrap();
    input.protected_regions = serde_json::from_value(json!([
        {"id":"speaker","region":{"x":0.1,"y":0.1,"width":0.3,"height":0.6}}
    ]))
    .unwrap();
    input.protection_context = Some(ProtectionContext {
        sample: input.samples[0].clone(),
        application: input.application.clone(),
        extras: input.extras.clone(),
    });
    input
}

#[test]
fn protection_context_preserves_the_reviewed_sample_across_multisample_restore() {
    let (db, asset, application) = fixture();
    let first_sample = add_input(&db);
    let mut second_input = db.get::<Input>("template_input", "input-a").unwrap();
    second_input.id = "input-b".into();
    second_input.sha256 = "b".repeat(64);
    db.put("template_input", "input-b", &second_input).unwrap();
    let mut second_transcript = db
        .get::<Transcript>("template_transcript", "input-a")
        .unwrap();
    second_transcript.input_id = "input-b".into();
    second_transcript.source_sha256 = second_input.sha256;
    db.put("template_transcript", "input-b", &second_transcript)
        .unwrap();
    let mut second_sample = first_sample.clone();
    second_sample["inputId"] = json!("input-b");
    let mut input = protected_submission(&application, &second_sample, "protected-second");
    input
        .samples
        .insert(0, serde_json::from_value(first_sample).unwrap());
    // Opaque navigation hints must have no influence on the typed owner.
    input.ui_state = Some(json!({"liveInputId":"input-a"}));
    let serialized = serde_json::to_value(&input).unwrap();
    let saved = save(&db, input).unwrap();
    assert_eq!(saved["status"]["protectionScope"], "bound");
    assert_eq!(
        saved["record"]["submission"]["protectionContext"]["sample"]["inputId"],
        "input-b"
    );
    let id = saved["record"]["id"].as_str().unwrap();
    let before_retry = all_records(&db);
    assert_eq!(
        save(&db, serde_json::from_value(serialized).unwrap()).unwrap(),
        saved
    );
    assert_eq!(all_records(&db), before_retry);
    let restored = restore(
        &db,
        id,
        Restore {
            current: submission(&application, "protected-backup", Some(id)),
        },
    )
    .unwrap();
    assert_eq!(
        restored["record"]["submission"]["protectionContext"],
        saved["record"]["submission"]["protectionContext"]
    );
    assert_eq!(
        restored["record"]["submission"]["protectedRegions"],
        saved["record"]["submission"]["protectedRegions"]
    );
    assert_eq!(
        db.get::<Value>(dynamic_asset::RECORD, &asset.id).unwrap(),
        serde_json::to_value(asset).unwrap()
    );
}

#[test]
fn protection_context_rejects_changed_content_and_composition_atomically_but_allows_primary_transform()
 {
    let (db, _, application) = fixture();
    let sample = add_input(&db);
    let base = serde_json::to_value(protected_submission(
        &application,
        &sample,
        "protection-valid",
    ))
    .unwrap();
    let before = all_records(&db);
    for (path, value) in [
        ("/protectionContext/sample/inputId", json!("input-other")),
        ("/protectionContext/sample/transcriptRevision", json!(2)),
        (
            "/protectionContext/sample/semanticUnits/0/rationale",
            json!("different annotation"),
        ),
        ("/protectionContext/application/canvas/width", json!(1280)),
        (
            "/protectionContext/application/inputs",
            json!({"headline":"different content"}),
        ),
        (
            "/protectionContext/extras",
            json!([{"assetId":"other","assetRevision":1,"instanceId":"icon","inputs":{}}]),
        ),
    ] {
        let mut changed = base.clone();
        *changed.pointer_mut(path).unwrap() = value;
        assert!(
            save(&db, serde_json::from_value(changed).unwrap())
                .unwrap_err()
                .to_string()
                .contains("protection context")
        );
        assert_eq!(all_records(&db), before);
    }
    let mut reframed = base.clone();
    reframed["application"]["videoRegion"] = json!({"x":0.,"y":0.,"width":1.,"height":0.5});
    assert!(
        save(&db, serde_json::from_value(reframed).unwrap())
            .unwrap_err()
            .to_string()
            .contains("protection context application changed")
    );
    assert_eq!(all_records(&db), before);
    let mut moved = base;
    moved["application"]["transform"] =
        json!({"scale":0.75,"centerX":0.45,"centerY":0.45,"rotationDegrees":15.});
    assert_eq!(
        save(&db, serde_json::from_value(moved).unwrap()).unwrap()["status"]["protectionScope"],
        "bound"
    );
}

#[test]
fn legacy_protection_stays_unbound_and_absent_context_preserves_serialized_identity() {
    let (db, _, application) = fixture();
    let sample = add_input(&db);
    let mut legacy = protected_submission(&application, &sample, "legacy-protection");
    legacy.protection_context = None;
    let serialized = serde_json::to_value(&legacy).unwrap();
    assert!(serialized.get("protectionContext").is_none());
    let before_hash = fingerprint(&legacy);
    let first = save(&db, legacy).unwrap();
    assert_eq!(first["status"]["protectionScope"], "unbound");
    let restored_payload: Save = serde_json::from_value(serialized).unwrap();
    assert_eq!(fingerprint(&restored_payload), before_hash);
    assert_eq!(save(&db, restored_payload).unwrap(), first);
    let id = first["record"]["id"].as_str().unwrap();
    let restored = restore(
        &db,
        id,
        Restore {
            current: submission(&application, "legacy-protection-backup", Some(id)),
        },
    )
    .unwrap();
    assert_eq!(restored["status"]["protectionScope"], "unbound");
    assert_eq!(
        restored["record"]["submission"]["protectedRegions"],
        first["record"]["submission"]["protectedRegions"]
    );
    assert!(
        restored["record"]["submission"]
            .get("protectionContext")
            .is_none()
    );
}

#[test]
fn protection_with_attached_extras_is_invalidated_by_primary_transform_changes() {
    let (db, asset, application) = fixture();
    let sample = add_input(&db);
    let mut input = protected_submission(&application, &sample, "attached-protection");
    let element_id = asset.project(&BTreeMap::new()).unwrap().elements[0]
        .id
        .clone();
    input.extras = serde_json::from_value(json!([{
        "assetId":asset.id,"assetRevision":asset.revision,"instanceId":"extra",
        "attachments":[{"elementId":format!("extra--{element_id}"),"relativeTo":element_id,
            "placement":"left","referenceBounds":"text_box","followMotion":true,
            "gap":0.02,"offsetX":0.,"offsetY":0.}]
    }]))
    .unwrap();
    input.protection_context.as_mut().unwrap().extras = input.extras.clone();
    let mut moved = serde_json::to_value(&input).unwrap();
    let original = save(&db, input).unwrap();
    let before = all_records(&db);
    moved["idempotencyKey"] = json!("attached-protection-moved");
    moved["parentId"] = original["record"]["id"].clone();
    moved["application"]["transform"] = json!({"scale":0.8,"centerX":0.4,"centerY":0.4});
    assert!(
        save(&db, serde_json::from_value(moved).unwrap())
            .unwrap_err()
            .to_string()
            .contains("protection context application changed")
    );
    assert_eq!(all_records(&db), before);
}
