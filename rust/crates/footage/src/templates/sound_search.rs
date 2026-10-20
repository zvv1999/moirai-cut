use super::{
    api::root,
    audio::{self, Sound},
    audio_assessment::Assessment,
    recommendation, sound_embedding,
};
use crate::service::App;
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchBy {
    #[default]
    Metadata,
    Audio,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub query: String,
    pub kind: String,
    #[serde(default)]
    pub include_review: bool,
    pub max_duration_seconds: f64,
    pub limit: usize,
    #[serde(default)]
    pub match_by: MatchBy,
}

fn eligible(sound: &Sound, request: &Request) -> bool {
    let approved = sound.status == "approved" && sound.kind == request.kind;
    let review = request.include_review
        && sound.status == "review"
        && (sound.kind == request.kind || ["stem", "candidate"].contains(&sound.kind.as_str()));
    let duration = sound.end_seconds - sound.start_seconds;
    (approved || review)
        && duration.is_finite()
        && duration > 0.0
        && duration <= request.max_duration_seconds
}

pub fn search(app: &App, request: Request) -> Result<Value> {
    ensure!(
        !request.query.trim().is_empty()
            && request.query.chars().count() <= 600
            && ["sound_effect", "background_music"].contains(&request.kind.as_str())
            && request.max_duration_seconds.is_finite()
            && (0.02..=600.0).contains(&request.max_duration_seconds)
            && (1..=20).contains(&request.limit),
        "invalid sound search request"
    );
    let audio_match = request.match_by == MatchBy::Audio;
    ensure!(
        !audio_match
            || (request.query.is_ascii() && request.query.chars().any(|c| c.is_ascii_alphabetic())),
        "声音内容检索需要英文描述和英文标点；中文可使用说明与标签检索"
    );
    let method = if audio_match {
        "sound-audio-clap-v1"
    } else {
        "sound-metadata-e5-v1"
    };
    let mut sounds = app
        .db
        .list::<Sound>("template_sound")?
        .into_iter()
        .filter(|sound| eligible(sound, &request))
        .collect::<Vec<_>>();
    sounds.sort_by(|a, b| a.id.cmp(&b.id));
    ensure!(
        sounds.len() <= 2000,
        "narrow sound search to at most 2000 candidates"
    );
    let warnings = vec![
        if audio_match {
            "english_audio_description_required"
        } else {
            "metadata_similarity_is_not_audio_similarity_or_quality"
        },
        "review_candidates_require_audition_before_binding",
    ];
    if sounds.is_empty() {
        return Ok(
            json!({"request":request,"method":method,"candidates":[],"warnings":warnings,"eligibleCount":0}),
        );
    }
    let mut texts = vec![format!("query: {}", request.query)];
    for sound in &sounds {
        texts.push(format!(
            "passage: {}。{}。{}",
            sound.name,
            sound.description,
            sound.tags.join("、")
        ));
    }
    // Separate work directories keep concurrent queries from replacing each other's manifests.
    let dir = root(app).join("sound-search").join(crate::domain::id());
    let result = (|| {
        let (scores, model_info) = if audio_match {
            sound_embedding::rank(app, &dir, &request.query, &sounds)?
        } else {
            let embedded = recommendation::embed(app, &dir, &texts)?;
            let mut scores = vec![];
            for vector in &embedded.vectors[1..] {
                scores.push(sound_embedding::Match {
                    score: recommendation::cosine(
                        &embedded.vectors[0].embedding,
                        &vector.embedding,
                    )?,
                    warnings: if embedded.vectors[0].truncated || vector.truncated {
                        vec!["embedding_text_truncated".into()]
                    } else {
                        vec![]
                    },
                    evidence: None,
                });
            }
            (
                scores,
                json!({"modelId":recommendation::MODEL,"modelRevision":recommendation::REVISION,
                "modelSha256":embedded.model_sha256,"tokenizerSha256":embedded.tokenizer_sha256,"engineVersion":embedded.engine_version}),
            )
        };
        let assessments = app.db.list::<Assessment>("template_sound_assessment")?;
        let mut candidates = vec![];
        for (index, sound) in sounds.iter().enumerate() {
            let matched = &scores[index];
            let assessment = assessments
                .iter()
                .find(|a| a.sound_id == sound.id && a.audio_sha256 == sound.audio_sha256);
            let mut flags = matched.warnings.clone();
            if sound.status != "approved" {
                flags.push("audition_required".into());
            }
            if assessment.is_none() {
                flags.push("no_current_contamination_assessment".into());
            }
            candidates.push(
                json!({"sound":sound,"score":matched.score,"canBind":sound.status=="approved",
                "assessment":assessment,"audioMatch":matched.evidence,"warnings":flags}),
            );
        }
        candidates.sort_by(|a, b| {
            b["score"]
                .as_f64()
                .unwrap()
                .total_cmp(&a["score"].as_f64().unwrap())
                .then_with(|| a["sound"]["id"].as_str().cmp(&b["sound"]["id"].as_str()))
        });
        candidates.truncate(request.limit);
        // Recheck the catalog and file identity after inference before exposing a binding choice.
        for candidate in &candidates {
            let sound: Sound = serde_json::from_value(candidate["sound"].clone())?;
            let latest: Sound = app.db.get("template_sound", &sound.id)?;
            ensure!(
                latest.revision == sound.revision && latest.audio_sha256 == sound.audio_sha256,
                "sound catalog changed; search again"
            );
            audio::checked_sound_file(app, &sound.id, Some(&sound.audio_sha256))?;
        }
        let mut response = json!({"request":request,"method":method,"candidates":candidates,
            "eligibleCount":sounds.len(),"warnings":warnings});
        response
            .as_object_mut()
            .unwrap()
            .extend(model_info.as_object().unwrap().clone());
        Ok(response)
    })();
    let _ = std::fs::remove_dir_all(dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_confirmed_compatible_sounds_are_eligible_by_default() {
        let mut sound: Sound = serde_json::from_value(json!({"id":"s","revision":1,"name":"click",
            "status":"review","kind":"candidate","sourceId":"r","startSeconds":1.0,"endSeconds":1.5,
            "description":"short click","tags":[],"sourceSha256":"s","audioSha256":"a","algorithm":"test","peak":0.5,"rms":0.2})).unwrap();
        let mut request = Request {
            match_by: MatchBy::Metadata,
            query: "重点".into(),
            kind: "sound_effect".into(),
            include_review: false,
            max_duration_seconds: 1.0,
            limit: 5,
        };
        assert!(!eligible(&sound, &request));
        request.include_review = true;
        assert!(eligible(&sound, &request));
        sound.status = "rejected".into();
        assert!(!eligible(&sound, &request));
        sound.status = "approved".into();
        sound.kind = "background_music".into();
        assert!(!eligible(&sound, &request));
        sound.kind = "sound_effect".into();
        request.include_review = false;
        assert!(eligible(&sound, &request));
        request.max_duration_seconds = 0.4;
        assert!(!eligible(&sound, &request));
    }
}
