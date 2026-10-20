use super::{model::Template, search::fingerprint};
use crate::store::{self, Store};
use anyhow::{Context, Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Criterion {
    pub score: u8,
    pub rationale: String,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evidence {
    pub fixture: usize,
    pub sha256: String,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Review {
    pub template_id: String,
    pub template_revision: u64,
    pub batch_id: String,
    pub item: usize,
    pub reviewer: String,
    pub composition: Criterion,
    pub motion: Criterion,
    pub assets: Criterion,
    pub adaptation: Criterion,
    pub editability: Criterion,
    pub evidence: Vec<Evidence>,
    pub inspection: String,
    pub limitations: String,
    pub blocking_findings: Vec<String>,
    pub listened: bool,
    /// Explicit reviewer assertion that the current application passed the
    /// final visual and listening gate. This is deliberately separate from
    /// the numeric internal score and defaults to false for old records.
    #[serde(default)]
    pub aesthetic_quality_verified: bool,
}

pub(crate) fn validate(review: &Review, template: &Template, item: &Value) -> Result<u16> {
    validate_with_minimum(review, template, item, 3)
}

/// A series case may contribute one production item; the series validator must
/// separately enforce its aggregate coverage. Ordinary reviews still require 3.
pub(crate) fn validate_with_minimum(
    review: &Review,
    template: &Template,
    item: &Value,
    minimum_previews: usize,
) -> Result<u16> {
    ensure!(
        template.id == review.template_id && template.revision == review.template_revision,
        "评审版本与当前模板不一致"
    );
    ensure!(
        item["templateId"] == review.template_id
            && item["templateRevision"] == review.template_revision
            && item["status"] == "published",
        "评审必须关联该版本已发布的生产项"
    );
    for text in [&review.reviewer, &review.inspection, &review.limitations] {
        ensure!(
            !text.trim().is_empty() && text.len() <= 16000,
            "评审人、检查范围和限制必须填写"
        );
    }
    let mut total = 0u16;
    for (criterion, max) in [
        (&review.composition, 25),
        (&review.motion, 25),
        (&review.assets, 20),
        (&review.adaptation, 20),
        (&review.editability, 10),
    ] {
        ensure!(
            criterion.score <= max
                && !criterion.rationale.trim().is_empty()
                && criterion.rationale.len() <= 8000,
            "分项评分越界或缺少依据"
        );
        total += criterion.score as u16;
    }
    let previews = item["previews"].as_array().context("缺少成片证据")?;
    let coverage_error = if minimum_previews == 3 {
        "需要覆盖全部成片且至少三组输入".to_string()
    } else {
        format!("需要覆盖全部成片且至少{}组输入", minimum_previews)
    };
    ensure!(
        review.evidence.len() >= minimum_previews && review.evidence.len() == previews.len(),
        coverage_error
    );
    let mut fixtures = std::collections::BTreeSet::new();
    let mut hashes = std::collections::BTreeSet::new();
    for evidence in &review.evidence {
        ensure!(
            fixtures.insert(evidence.fixture) && hashes.insert(&evidence.sha256),
            "重复成片证据"
        );
        ensure!(
            evidence.sha256.len() == 64 && evidence.sha256.bytes().all(|b| b.is_ascii_hexdigit()),
            "无效成片哈希"
        );
        ensure!(
            previews.iter().any(|p| p["fixture"] == evidence.fixture
                && p["sha256"] == evidence.sha256
                && p["decodeVerified"] == true
                && p["audioQuality"]["validated"] == true),
            "成片哈希或技术检查不匹配"
        );
    }
    ensure!(
        review.blocking_findings.len() <= 100
            && review
                .blocking_findings
                .iter()
                .all(|s| !s.trim().is_empty() && s.len() <= 8000),
        "无效阻断问题"
    );
    if review.aesthetic_quality_verified {
        ensure!(review.listened, "最终审美验收必须先记录已试听");
        ensure!(
            total >= 90 && review.blocking_findings.is_empty(),
            "最终审美验收要求总分至少90且没有阻断问题"
        );
    }
    Ok(total)
}

pub fn save(db: &Store, review: Review) -> Result<Value> {
    db.transaction(|db| {
        let template: Template = store::get(db,"template", &review.template_id)?;
        let item: Value = store::get(db,"template_production_item", &format!("{}-{}",review.batch_id,review.item))?;
        let total = validate(&review, &template, &item)?;
        let id = format!("review-{}", fingerprint(&review));
        let record = json!({"id":id,"review":review,"total":total,"meetsInternalThreshold":total >= 90 && review.blocking_findings.is_empty(),"aestheticQualityVerified":review.aesthetic_quality_verified});
        store::put(db,"template_quality_review",&id,&record)?;
        Ok(record)
    })
}

pub fn for_preview(
    db: &rusqlite::Connection,
    template: &Template,
    batch: &str,
    index: usize,
    item: &Value,
) -> Result<Option<Value>> {
    for record in store::list::<Value>(db, "template_quality_review")? {
        let review: Review = serde_json::from_value(record["review"].clone())?;
        if review.batch_id == batch
            && review.item == index
            && validate(&review, template, item).is_ok()
        {
            return Ok(Some(record));
        }
    }
    Ok(None)
}

pub fn summary(template: &Template, previews: &Value) -> Value {
    let preview = &previews["previews"][&template.id];
    let review = &preview["qualityReview"];
    if preview["revision"] != template.revision || review.is_null() {
        return json!({"revision":template.revision,"status":"pending","score":null,"aestheticQualityVerified":false,"listened":null});
    }
    json!({
        "revision":template.revision,
        "status":if review["meetsInternalThreshold"] == true {"qualified"} else {"needs_revision"},
        "score":review["total"],
        "listened":review["review"]["listened"],
        // This is deliberately separate from the internal score. A score can be
        // recorded from inspected fixtures while final aesthetic verification is
        // still pending.
        "aestheticQualityVerified":preview["aestheticQualityVerified"] == true
            || review["aestheticQualityVerified"] == true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_status_uses_current_review_not_tags_or_score_alone() {
        let mut template = super::super::seed::templates().unwrap().remove(0);
        template.revision = 2;
        let mut previews = json!({"previews":{}});
        assert_eq!(summary(&template, &previews)["status"], "pending");
        previews["previews"][&template.id] = json!({"revision":2,"qualityReview":{"total":100,"meetsInternalThreshold":false,"review":{"listened":false}}});
        assert_eq!(summary(&template, &previews)["status"], "needs_revision");
        previews["previews"][&template.id]["qualityReview"]["meetsInternalThreshold"] = json!(true);
        assert_eq!(summary(&template, &previews)["status"], "qualified");
        assert_eq!(
            summary(&template, &previews)["aestheticQualityVerified"],
            false
        );
        template.revision = 3;
        assert_eq!(summary(&template, &previews)["status"], "pending");
        assert!(summary(&template, &previews)["score"].is_null());
    }
    #[test]
    fn rejects_stale_forged_and_incomplete_evidence() {
        let mut template = super::super::seed::templates().unwrap().remove(0);
        template.revision = 2;
        let criterion = Criterion {
            score: 18,
            rationale: "检查通过，仍缺少细节".into(),
        };
        let mut review = Review {
            template_id: template.id.clone(),
            template_revision: 2,
            batch_id: "batch".into(),
            item: 0,
            reviewer: "Agent".into(),
            composition: criterion.clone(),
            motion: criterion.clone(),
            assets: criterion.clone(),
            adaptation: criterion.clone(),
            editability: Criterion {
                score: 9,
                rationale: "位图内部不可编辑".into(),
            },
            evidence: (0..3)
                .map(|i| Evidence {
                    fixture: i,
                    sha256: format!("{:064x}", i),
                })
                .collect(),
            inspection: "边界抽帧".into(),
            limitations: "未试听".into(),
            blocking_findings: vec![],
            listened: false,
            aesthetic_quality_verified: false,
        };
        let item = json!({"templateId":template.id,"templateRevision":2,"status":"published","previews":review.evidence.iter().map(|e|json!({"fixture":e.fixture,"sha256":e.sha256,"decodeVerified":true,"audioQuality":{"validated":true}})).collect::<Vec<_>>()});
        assert_eq!(validate(&review, &template, &item).unwrap(), 81);
        review.template_revision = 1;
        assert!(validate(&review, &template, &item).is_err());
        review.template_revision = 2;
        review.evidence[0].sha256 = "f".repeat(64);
        assert!(validate(&review, &template, &item).is_err());
        review.evidence.remove(0);
        assert!(validate(&review, &template, &item).is_err());
    }

    #[test]
    fn scores_and_publication_do_not_override_blockers_or_versions() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut template = super::super::seed::templates().unwrap().remove(0);
        template.revision = 3;
        let criterion = |score| Criterion {
            score,
            rationale: "评审依据".into(),
        };
        let review = Review {
            template_id: template.id.clone(),
            template_revision: 3,
            batch_id: "batch".into(),
            item: 0,
            reviewer: "Agent".into(),
            composition: criterion(25),
            motion: criterion(25),
            assets: criterion(20),
            adaptation: criterion(20),
            editability: criterion(10),
            evidence: (0..3)
                .map(|i| Evidence {
                    fixture: i,
                    sha256: format!("{:064x}", i),
                })
                .collect(),
            inspection: "检查了三组成片".into(),
            limitations: "未试听".into(),
            blocking_findings: vec!["文字裁切".into()],
            listened: false,
            aesthetic_quality_verified: false,
        };
        let mut item = json!({"templateId":template.id,"templateRevision":3,"status":"published","previews":review.evidence.iter().map(|e|json!({"fixture":e.fixture,"sha256":e.sha256,"decodeVerified":true,"audioQuality":{"validated":true}})).collect::<Vec<_>>()});
        db.put("template", &template.id, &template).unwrap();
        db.put("template_production_item", "batch-0", &item)
            .unwrap();
        let saved = save(&db, review.clone()).unwrap();
        assert_eq!(saved["total"], 100);
        assert_eq!(saved["meetsInternalThreshold"], false);
        db.transaction(|conn| {
            assert!(for_preview(conn, &template, "batch", 0, &item)?.is_some());
            assert!(for_preview(conn, &template, "other", 0, &item)?.is_none());
            Ok(())
        })
        .unwrap();
        item["previews"][0]["sha256"] = json!("f".repeat(64));
        db.transaction(|conn| {
            assert!(for_preview(conn, &template, "batch", 0, &item)?.is_none());
            Ok(())
        })
        .unwrap();
        template.revision = 4;
        db.put("template", &template.id, &template).unwrap();
        assert!(save(&db, review).is_err());
    }

    #[test]
    fn final_aesthetic_gate_requires_listening_score_and_no_blockers() {
        let mut template = super::super::seed::templates().unwrap().remove(0);
        template.revision = 5;
        let criterion = |score| Criterion {
            score,
            rationale: "逐片连续观看片段并核对成片".into(),
        };
        let evidence: Vec<Evidence> = (0..3)
            .map(|i| Evidence {
                fixture: i,
                sha256: format!("{:064x}", i),
            })
            .collect();
        let item = json!({"templateId":template.id,"templateRevision":5,"status":"published","previews":evidence.iter().map(|e|json!({"fixture":e.fixture,"sha256":e.sha256,"decodeVerified":true,"audioQuality":{"validated":true}})).collect::<Vec<_>>()});
        let mut review = Review {
            template_id: template.id.clone(),
            template_revision: 5,
            batch_id: "batch".into(),
            item: 0,
            reviewer: "auditor".into(),
            composition: criterion(25),
            motion: criterion(25),
            assets: criterion(20),
            adaptation: criterion(20),
            editability: criterion(10),
            evidence,
            inspection: "逐片连续观看片段并核对成片".into(),
            limitations: "覆盖当前应用的三份成片".into(),
            blocking_findings: vec![],
            listened: false,
            aesthetic_quality_verified: true,
        };
        assert!(validate(&review, &template, &item).is_err());
        review.listened = true;
        assert_eq!(validate(&review, &template, &item).unwrap(), 100);
        review.blocking_findings.push("需要换构图".into());
        assert!(validate(&review, &template, &item).is_err());
    }
}
