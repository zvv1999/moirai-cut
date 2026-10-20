use super::*;
use crate::templates::{
    dynamic_asset::{self, Create, Save},
    model::{Canvas, Rect},
};

fn setup() -> (Store, dynamic_asset::Definition) {
    let db = Store::open(std::path::Path::new(":memory:")).unwrap();
    let source = dynamic_asset::create(Create {
        name: "series source".into(),
        canvas: Canvas {
            width: 720,
            height: 720,
            fps: 30,
        },
        purpose: None,
    })
    .unwrap();
    let source = dynamic_asset::save(
        &db,
        Save {
            definition: source,
            base_revision: 0,
            idempotency_key: "series-source".into(),
        },
    )
    .unwrap();
    (db, source)
}
fn application(source: &dynamic_asset::Definition, index: usize) -> Application {
    Application {
        asset_id: source.id.clone(),
        asset_revision: source.revision,
        canvas: if index % 2 == 0 {
            source.canvas.clone()
        } else {
            Canvas {
                width: 1280,
                height: 720,
                fps: 30,
            }
        },
        placement: Rect {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        },
        inputs: Default::default(),
        transform: None,
        caption_width: None,
        text_widths: Default::default(),
        video_region: None,
        blurred_background: None,
        intents: None,
        min_display_seconds: Some(0.3 + index as f64 * 0.1),
    }
}
fn case(db: &Store, source: &dynamic_asset::Definition, index: usize, count: usize) -> Case {
    let application = application(source, index);
    let template = dynamic_asset::application(source, &application).unwrap();
    let criterion = |score| reviews::Criterion {
        score,
        rationale: "inspected fixture evidence".into(),
    };
    let review = reviews::Review {
        template_id: template.id.clone(),
        template_revision: 5,
        batch_id: format!("batch-{index}"),
        item: 0,
        reviewer: "reviewer".into(),
        composition: criterion(25),
        motion: criterion(25),
        assets: criterion(20),
        adaptation: criterion(20),
        editability: criterion(10),
        evidence: (0..count)
            .map(|fixture| reviews::Evidence {
                fixture,
                sha256: format!("{:064x}", index * 10 + fixture),
            })
            .collect(),
        inspection: "continuous viewing".into(),
        limitations: "only stated cases".into(),
        blocking_findings: vec![],
        listened: true,
        aesthetic_quality_verified: true,
    };
    let item = json!({"templateId":template.id,"templateRevision":5,"status":"published","previews":review.evidence.iter().map(|e|json!({"fixture":e.fixture,"sha256":e.sha256,"decodeVerified":true,"audioQuality":{"validated":true}})).collect::<Vec<_>>()});
    let key = format!("{}-{}", review.batch_id, review.item);
    db.put(
        "template_production_output",
        &key,
        &json!({"template":template}),
    )
    .unwrap();
    db.put("template_production_item", &key, &item).unwrap();
    Case {
        application,
        review,
        rationale: format!("case {index}: adapt width and display hold"),
    }
}
fn submission(cases: Vec<Case>) -> Submission {
    Submission {
        cases,
        rationale: "same style with per-input adjustments".into(),
        coverage: "square/landscape and short/long wording".into(),
        limitations: "these previews only; no arbitrary input claim".into(),
    }
}
fn record(db: &Store, id: &Value) -> Value {
    list(db).unwrap()["reviews"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == *id)
        .unwrap()
        .clone()
}

#[test]
fn cross_application_series_is_independent_and_idempotent_while_old_rule_stays_three() {
    let (db, source) = setup();
    let cases = (0..3).map(|i| case(&db, &source, i, 1)).collect::<Vec<_>>();
    for case in &cases {
        let old = style_reviews::Submission {
            application: case.application.clone(),
            review: case.review.clone(),
        };
        assert!(
            style_reviews::save(&db, old).is_err(),
            "single application still requires 3"
        );
        db.transaction(|conn| {
            let (template, _) =
                style_reviews::reviewed_template_with_minimum(conn, &case.review, 1)?;
            let mut published = template;
            published.revision = 5;
            let item: Value = store::get(
                conn,
                "template_production_item",
                &format!("{}-0", case.review.batch_id),
            )?;
            assert!(reviews::validate(&case.review, &published, &item).is_err());
            Ok(())
        })
        .unwrap();
    }
    let input = submission(cases);
    let saved = save(&db, input.clone()).unwrap();
    assert_eq!(saved["total"], 100);
    assert_eq!(saved["caseCount"], 3);
    assert_eq!(saved["evidenceCount"], 3);
    assert_eq!(saved["aestheticQualityVerified"], true);
    assert_eq!(saved["listened"], true);
    assert_ne!(
        saved["caseResults"][0]["applicationHash"],
        saved["caseResults"][1]["applicationHash"]
    );
    assert_eq!(save(&db, input).unwrap(), saved);
    assert_eq!(list(&db).unwrap()["reviews"].as_array().unwrap().len(), 1);
    assert_eq!(record(&db, &saved["id"])["current"], true);
    assert_eq!(style_reviews::list(&db).unwrap()["reviews"], json!([]));
    let one = submission(vec![case(&db, &source, 4, 3)]);
    assert!(save(&db, one).is_ok());
}

#[test]
fn rejects_insufficient_duplicate_and_unrelated_evidence() {
    let (db, source) = setup();
    let c0 = case(&db, &source, 0, 1);
    let c1 = case(&db, &source, 1, 1);
    let c2 = case(&db, &source, 2, 1);
    assert!(save(&db, submission(vec![c0.clone(), c1.clone()])).is_err());
    assert!(
        save(&db, submission(vec![c0.clone(), c0.clone(), c2.clone()]))
            .unwrap_err()
            .to_string()
            .contains("duplicate production item")
    );
    let mut duplicate = c1.clone();
    duplicate.review.evidence[0].sha256 = c0.review.evidence[0].sha256.clone();
    db.transaction(|conn| {
        let mut item: Value = store::get(conn, "template_production_item", "batch-1-0")?;
        item["previews"][0]["sha256"] = json!(duplicate.review.evidence[0].sha256);
        store::put(conn, "template_production_item", "batch-1-0", &item)
    })
    .unwrap();
    assert!(
        save(&db, submission(vec![c0.clone(), duplicate, c2.clone()]))
            .unwrap_err()
            .to_string()
            .contains("duplicate preview")
    );
    let c1 = case(&db, &source, 1, 1);
    let mut wrong = c1.clone();
    wrong.application.placement.height = 0.5;
    assert!(
        save(&db, submission(vec![c0.clone(), wrong, c2.clone()]))
            .unwrap_err()
            .to_string()
            .contains("differs")
    );
    let mut unrelated = c1;
    unrelated.application.asset_id = "another-style".into();
    assert!(
        save(&db, submission(vec![c0, unrelated, c2]))
            .unwrap_err()
            .to_string()
            .contains("one saved style revision")
    );
}

#[test]
fn every_production_preview_and_technical_check_remains_required() {
    let (db, source) = setup();
    let full = case(&db, &source, 0, 3);
    let mut missing = full.clone();
    missing.review.evidence.pop();
    assert!(save(&db, submission(vec![missing])).is_err());
    for field in ["decodeVerified", "audioQuality"] {
        db.transaction(|conn| {
            let mut item: Value = store::get(conn, "template_production_item", "batch-0-0")?;
            item["previews"][0][field] = json!(false);
            store::put(conn, "template_production_item", "batch-0-0", &item)
        })
        .unwrap();
        assert!(save(&db, submission(vec![full.clone()])).is_err());
        case(&db, &source, 0, 3);
    }
    let mut no_reason = submission(vec![full]);
    no_reason.cases[0].rationale = " ".into();
    assert!(save(&db, no_reason).is_err());
}

#[test]
fn stale_style_and_replaced_outputs_are_reported_separately() {
    let (db, mut source) = setup();
    let input = submission((0..3).map(|i| case(&db, &source, i, 1)).collect());
    let saved = save(&db, input.clone()).unwrap();
    source.revision += 1;
    db.put(dynamic_asset::RECORD, &source.id, &source).unwrap();
    assert!(save(&db, input.clone()).is_err());
    let listed = record(&db, &saved["id"]);
    assert_eq!(listed["current"], false);
    assert_eq!(listed["evidenceCurrent"], true);
    source.revision -= 1;
    db.put(dynamic_asset::RECORD, &source.id, &source).unwrap();
    db.transaction(|conn| {
        let mut item: Value = store::get(conn, "template_production_item", "batch-1-0")?;
        item["previews"][0]["sha256"] = json!("f".repeat(64));
        store::put(conn, "template_production_item", "batch-1-0", &item)
    })
    .unwrap();
    let listed = record(&db, &saved["id"]);
    assert_eq!(listed["current"], false);
    assert_eq!(listed["evidenceCurrent"], false);
    assert_eq!(listed["caseResults"][0]["evidenceCurrent"], true);
    assert_eq!(listed["caseResults"][1]["evidenceCurrent"], false);
    case(&db, &source, 1, 1);
    db.transaction(|conn| {
        let mut output: Value = store::get(conn, "template_production_output", "batch-2-0")?;
        output["template"]["styles"][0]["fill"] = json!("#FF0000");
        store::put(conn, "template_production_output", "batch-2-0", &output)
    })
    .unwrap();
    let listed = record(&db, &saved["id"]);
    assert_eq!(listed["current"], false);
    assert_eq!(listed["evidenceCurrent"], false);
}

#[test]
fn score_is_worst_case_and_final_gate_requires_every_case() {
    let (db, source) = setup();
    let mut input = submission((0..3).map(|i| case(&db, &source, i, 1)).collect());
    input.cases[1].review.motion.score = 14;
    input.cases[1].review.aesthetic_quality_verified = false;
    input.cases[1].review.listened = false;
    let saved = save(&db, input.clone()).unwrap();
    assert_eq!(saved["total"], 89);
    assert_eq!(saved["meetsInternalThreshold"], false);
    assert_eq!(saved["listened"], false);
    assert_eq!(saved["aestheticQualityVerified"], false);
    input.cases[1].review.aesthetic_quality_verified = true;
    assert!(save(&db, input.clone()).is_err());
    input.cases[1].review.listened = true;
    assert!(save(&db, input.clone()).is_err());
    input.cases[1].review.motion.score = 25;
    input.cases[1]
        .review
        .blocking_findings
        .push("unreadable".into());
    assert!(save(&db, input.clone()).is_err());
    input.cases[1].review.aesthetic_quality_verified = false;
    let blocked = save(&db, input.clone()).unwrap();
    assert_eq!(blocked["total"], 100);
    assert_eq!(blocked["meetsInternalThreshold"], false);
    assert_eq!(blocked["aestheticQualityVerified"], false);
    input.cases[1].review.blocking_findings.clear();
    let internal = save(&db, input.clone()).unwrap();
    assert_eq!(internal["meetsInternalThreshold"], true);
    assert_eq!(internal["aestheticQualityVerified"], false);
    input.cases[1].review.aesthetic_quality_verified = true;
    assert_eq!(save(&db, input).unwrap()["aestheticQualityVerified"], true);
}
