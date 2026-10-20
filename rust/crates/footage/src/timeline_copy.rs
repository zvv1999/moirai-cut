//! Pure reference remapping for copied timeline subtrees. Callers supply final
//! placement identities; this module never reads or writes a project.
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    pub group_path: Vec<String>,
    pub track_id: String,
    pub element_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Copy {
    pub source: Identity,
    pub destination: Identity,
    /// A detached copy with its final root ID. Nested IDs are preserved; their
    /// identity changes through the new enclosing group path.
    pub element: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub copies: Vec<Copy>,
}

fn validate(identity: &Identity) -> Result<()> {
    ensure!(
        !identity.track_id.is_empty()
            && !identity.element_id.is_empty()
            && identity.group_path.iter().all(|id| !id.is_empty()),
        "empty timeline identity"
    );
    Ok(())
}

fn collect(
    element: &Value,
    source: &Identity,
    destination: &Identity,
    map: &mut BTreeMap<Identity, Identity>,
    destinations: &mut BTreeSet<Identity>,
    depth: usize,
) -> Result<()> {
    ensure!(depth <= 64, "timeline copy nesting limit exceeded");
    validate(source)?;
    validate(destination)?;
    ensure!(
        element["id"].as_str() == Some(destination.element_id.as_str()),
        "copy destination ID mismatch"
    );
    ensure!(source != destination, "copy must have a new identity");
    ensure!(
        map.insert(source.clone(), destination.clone()).is_none(),
        "ambiguous copy source identity"
    );
    ensure!(
        destinations.insert(destination.clone()),
        "duplicate copy destination identity"
    );
    if let Some(group) = element.get("renderGroup") {
        let tracks = group["tracks"]
            .as_array()
            .context("invalid copied render group tracks")?;
        let mut source_path = source.group_path.clone();
        source_path.push(source.element_id.clone());
        let mut destination_path = destination.group_path.clone();
        destination_path.push(destination.element_id.clone());
        for track in tracks {
            let track_id = track["id"].as_str().context("missing copied track ID")?;
            for child in track["elements"]
                .as_array()
                .context("invalid copied track elements")?
            {
                let id = child["id"].as_str().context("missing copied element ID")?;
                collect(
                    child,
                    &Identity {
                        group_path: source_path.clone(),
                        track_id: track_id.into(),
                        element_id: id.into(),
                    },
                    &Identity {
                        group_path: destination_path.clone(),
                        track_id: track_id.into(),
                        element_id: id.into(),
                    },
                    map,
                    destinations,
                    depth + 1,
                )?;
            }
        }
    }
    Ok(())
}

fn rewrite(element: &mut Value, map: &BTreeMap<Identity, Identity>) -> Result<()> {
    let mut copied_parent = None;
    if let Some(attachment) = element.get_mut("textAttachment") {
        let parent: Identity = serde_json::from_value(attachment["parent"].clone())
            .context("invalid copied text attachment parent")?;
        validate(&parent)?;
        if let Some(destination) = map.get(&parent) {
            attachment["parent"] = serde_json::to_value(destination)?;
            copied_parent = Some(destination.element_id.clone());
        }
    }
    if let Some(id) = copied_parent {
        if let Some(metadata) = element
            .get_mut("params")
            .and_then(|params| params.get_mut("template.attachedTo"))
        {
            *metadata = Value::String(id);
        }
    }
    if let Some(group) = element.get_mut("renderGroup") {
        for track in group["tracks"]
            .as_array_mut()
            .context("invalid copied render group tracks")?
        {
            for child in track["elements"]
                .as_array_mut()
                .context("invalid copied track elements")?
            {
                rewrite(child, map)?;
            }
        }
    }
    Ok(())
}

/// Build the complete map first, so selection/track order cannot affect links.
/// References outside the copied selection intentionally remain external.
pub fn remap(mut request: Request) -> Result<Vec<Value>> {
    ensure!(
        request.copies.len() <= 10000,
        "timeline copy selection limit exceeded"
    );
    let mut map = BTreeMap::new();
    let mut destinations = BTreeSet::new();
    for copy in &request.copies {
        collect(
            &copy.element,
            &copy.source,
            &copy.destination,
            &mut map,
            &mut destinations,
            0,
        )?;
    }
    ensure!(
        map.keys().all(|source| !destinations.contains(source)),
        "copy destination overlaps source identity"
    );
    for copy in &mut request.copies {
        rewrite(&mut copy.element, &map)?;
    }
    Ok(request
        .copies
        .into_iter()
        .map(|copy| copy.element)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn identity(id: &str) -> Value {
        json!({"elementId":id,"trackId":"track","groupPath":[]})
    }
    fn copy(source: &str, destination: &str, mut element: Value) -> Value {
        element["id"] = json!(destination);
        json!({"source":identity(source),"destination":identity(destination),"element":element})
    }
    fn run(copies: Vec<Value>) -> Result<Vec<Value>> {
        remap(serde_json::from_value(json!({"copies":copies}))?)
    }
    #[test]
    fn combined_copy_is_order_independent_and_external_parent_is_preserved() {
        let size = json!({"width":{"factor":1.2,"paddingPx":12.},"baselineSizePx":[80.,30.],"sourceSizePx":720.,"childAnchor":[0.,0.5]});
        let child = copy(
            "icon",
            "icon-copy",
            json!({"textAttachment":{"parent":identity("text"),"anchor":[1,0.5],"sizeBinding":size},"params":{"opacity":0.7,"template.attachedTo":"text"}}),
        );
        let parent = copy("text", "text-copy", json!({"content":"重点"}));
        let output = run(vec![child.clone(), parent]).unwrap();
        assert_eq!(output[0]["textAttachment"]["parent"], identity("text-copy"));
        assert_eq!(output[0]["textAttachment"]["sizeBinding"], size);
        assert_eq!(output[0]["params"]["opacity"], 0.7);
        assert_eq!(output[0]["params"]["template.attachedTo"], "text-copy");
        assert_eq!(
            run(vec![child.clone()]).unwrap()[0]["textAttachment"]["parent"],
            identity("text")
        );
        assert_eq!(
            child["element"]["textAttachment"]["parent"],
            identity("text")
        );
        assert!(output[1].get("renderGroup").is_none());
    }
    #[test]
    fn nested_group_copy_remaps_internal_and_cross_selection_links_by_full_identity() {
        let parent = json!({"elementId":"text","trackId":"inner","groupPath":["group","nested"]});
        let group = copy(
            "group",
            "group-copy",
            json!({"renderGroup":{"tracks":[{"id":"inner","elements":[
                {"id":"nested","renderGroup":{"tracks":[{"id":"inner","elements":[
                    {"id":"text"},{"id":"icon","textAttachment":{"parent":parent,"anchor":[1,0.5]}}
                ]}]}},
                {"id":"text"}
            ]}]}}),
        );
        let external = copy(
            "outside",
            "outside-copy",
            json!({"textAttachment":{"parent":parent,"anchor":[1,0.5]}}),
        );
        let output = run(vec![external, group]).unwrap();
        let expected =
            json!({"elementId":"text","trackId":"inner","groupPath":["group-copy","nested"]});
        assert_eq!(output[0]["textAttachment"]["parent"], expected);
        assert_eq!(
            output[1]["renderGroup"]["tracks"][0]["elements"][0]["renderGroup"]["tracks"][0]["elements"]
                [1]["textAttachment"]["parent"],
            expected
        );
    }
    #[test]
    fn invalid_maps_and_malformed_groups_fail_without_partial_output() {
        let a = copy("a", "b", json!({}));
        assert!(run(vec![a.clone(), a.clone()]).is_err());
        assert!(run(vec![a, copy("b", "c", json!({}))]).is_err());
        assert!(run(vec![copy("a", "b", json!({"renderGroup":{"tracks":null}}))]).is_err());
        assert!(
            run(vec![copy(
                "a",
                "b",
                json!({"textAttachment":{"parent":null}})
            )])
            .is_err()
        );
    }
}
