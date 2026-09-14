use crate::{domain::Shot, store};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Serialize, Deserialize)]
pub struct Suggestion {
    pub base_revision: u64,
    pub shot: Shot,
}

pub fn public_suggestion(db: &rusqlite::Connection, shot: &Shot) -> Result<Value> {
    use rusqlite::OptionalExtension;
    let body: Option<String> = db
        .query_row(
            "SELECT body FROM records WHERE kind='analysis_suggestion' AND id=?1",
            [&shot.id],
            |r| r.get(0),
        )
        .optional()?;
    let Some(body) = body else {
        return Ok(Value::Null);
    };
    let suggestion: Suggestion = serde_json::from_str(&body)?;
    let s = suggestion.shot;
    Ok(
        json!({"baseRevision":suggestion.base_revision,"stale":suggestion.base_revision!=shot.revision,
        "name":s.name,"description":s.description,"details":s.details,"tags":s.tags,
        "hasHoliday":s.has_holiday,"holidayTags":s.holiday_tags,"unsupportedClaims":s.unsupported_claims,
        "tagEvidence":s.tag_evidence,"evidence":s.evidence,"productRecognitionStatus":s.product_recognition_status}),
    )
}

pub fn dismiss(db: &rusqlite::Connection, id: &str) -> Result<()> {
    db.execute(
        "DELETE FROM records WHERE kind='analysis_suggestion' AND id=?1",
        [id],
    )?;
    Ok(())
}

pub fn accept(db: &rusqlite::Connection, shot: &mut Shot, fields: &[String]) -> Result<()> {
    let suggestion = store::get::<Suggestion>(db, "analysis_suggestion", &shot.id)?;
    ensure!(
        suggestion.base_revision == shot.revision,
        "建议已过期，请重新分析当前片段"
    );
    ensure!(
        !fields.is_empty()
            && fields.iter().all(|f| [
                "name",
                "description",
                "details",
                "tags",
                "holidays",
                "unsupportedClaims"
            ]
            .contains(&f.as_str())),
        "请选择有效的建议项"
    );
    let s = suggestion.shot;
    ensure!(
        s.start_ticks == shot.start_ticks && s.end_ticks == shot.end_ticks,
        "建议范围已过期，请重新分析当前片段"
    );
    for field in fields {
        match field.as_str() {
            "name" => shot.name = s.name.clone(),
            "description" => shot.description = s.description.clone(),
            "details" => shot.details = s.details.clone(),
            "tags" => {
                shot.evidence = s.evidence.clone();
                shot.tags = s.tags.clone();
                shot.analyzed_tags = s.analyzed_tags.clone();
                shot.tag_evidence
                    .retain(|e| shot.holiday_tags.contains(&e.tag));
                crate::tag_evidence::merge(
                    &mut shot.tag_evidence,
                    s.tag_evidence
                        .iter()
                        .filter(|e| s.tags.contains(&e.tag))
                        .cloned(),
                );
                shot.product_tags = s.product_tags.clone();
                shot.product_matches = s.product_matches.clone();
                shot.product_recognition_status = s.product_recognition_status.clone();
            }
            "holidays" => {
                shot.has_holiday = s.has_holiday;
                shot.holiday_tags = s.holiday_tags.clone();
                shot.tag_evidence.retain(|e| shot.tags.contains(&e.tag));
                crate::tag_evidence::merge(
                    &mut shot.tag_evidence,
                    s.tag_evidence
                        .iter()
                        .filter(|e| s.holiday_tags.contains(&e.tag))
                        .cloned(),
                );
            }
            "unsupportedClaims" => shot.unsupported_claims = s.unsupported_claims.clone(),
            _ => unreachable!(),
        }
    }
    if fields.iter().any(|f| f == "tags") && fields.iter().any(|f| f == "holidays") {
        shot.labels_need_review = false;
    }
    shot.status = if shot.direct_upload {
        "tag_review"
    } else if shot.output_path.is_some() {
        "review"
    } else {
        "draft"
    }
    .into();
    shot.published_path = None;
    dismiss(db, &shot.id)
}
