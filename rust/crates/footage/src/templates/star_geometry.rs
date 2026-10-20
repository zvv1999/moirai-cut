//! Native editable star geometry. Appearance and motion remain independent.
use super::model::{Element, Representation};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StarGeometry {
    #[schemars(range(min = 3, max = 12))]
    pub points: u8,
    /// Inner radius as a percentage of outer radius (matches native star renderer).
    #[schemars(range(min = 1.0, max = 99.0))]
    pub depth: f64,
}
impl Default for StarGeometry {
    fn default() -> Self {
        Self {
            points: 5,
            depth: 45.,
        }
    }
}
impl StarGeometry {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            (3..=12).contains(&self.points),
            "star points must be an integer between 3 and 12"
        );
        ensure!(
            self.depth.is_finite() && (1.0..=99.).contains(&self.depth),
            "star depth must be finite and between 1 and 99"
        );
        Ok(())
    }
}
pub(crate) fn validate_element(e: &Element) -> Result<()> {
    if let Some(shape) = &e.star_geometry {
        ensure!(
            e.features.representation == Representation::Star,
            "starGeometry requires star representation; clear geometry before converting {}",
            e.id
        );
        shape.validate()?;
    }
    Ok(())
}
pub fn capabilities() -> Value {
    json!({"geometryField":"starGeometry","representation":"star","nativeDefinitionId":"star","nativeParams":["points","depth"],"points":{"type":"integer","minimum":3,"maximum":12},"depth":{"minimum":1,"maximum":99,"unit":"inner_radius_percent"},"defaultGeometry":{"points":5,"depth":45},"filled":true,"outline":true,"strokeAlignment":"center","textSizeBinding":true,"geometryAnimation":false,"orthogonalMotion":["opacity","scale","scale_x","scale_y","rotation","x","y"],"bounds":"conservative_source_box","sourceGeometry":"regular_star_inscribed_in_minimum_source_axis","aestheticQualityVerified":false})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{
        dynamic_asset as asset, dynamic_asset_edit as edit, element_edit, model::*,
    };
    use std::collections::BTreeMap;
    fn definition() -> asset::Definition {
        let mut d = asset::create(asset::Create {
            name: "Star contract".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: Some(asset::CreatePurpose::Decoration),
        })
        .unwrap();
        element(&mut d).features.representation = Representation::Star;
        d
    }
    fn element(d: &mut asset::Definition) -> &mut Element {
        d.layers
            .iter_mut()
            .find_map(|l| match &mut l.content {
                asset::LayerContent::Element { element } => Some(element),
                _ => None,
            })
            .unwrap()
    }
    fn preview(d: asset::Definition) -> Value {
        asset::preview(asset::Preview {
            definition: d,
            inputs: BTreeMap::new(),
            duration_seconds: 2.,
            example: None,
        })
        .unwrap()
    }
    fn graphic(v: &Value) -> &Value {
        v["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|t| t["elements"].as_array().unwrap())
            .find(|e| e["type"] == "graphic")
            .unwrap()
    }
    #[test]
    fn star_defaults_and_explicit_geometry_compile_to_existing_renderer() {
        let d = definition();
        let v = preview(d.clone());
        assert_eq!(graphic(&v)["definitionId"], "star");
        assert_eq!(graphic(&v)["params"]["points"], 5);
        assert_eq!(graphic(&v)["params"]["depth"], 45.);
        let mut changed = d;
        element(&mut changed).star_geometry = Some(StarGeometry {
            points: 4,
            depth: 18.,
        });
        let v = preview(changed);
        assert_eq!(graphic(&v)["params"]["points"], 4);
        assert_eq!(graphic(&v)["params"]["depth"], 18.);
        assert!(graphic(&v)["animations"]["opacity"]["keys"].is_array());
        assert!(graphic(&v)["params"]["arcSweep"].is_null());
    }
    #[test]
    fn star_geometry_rejects_invalid_values_and_wrong_targets() {
        for points in [0, 2, 13, 255] {
            assert!(StarGeometry { points, depth: 45. }.validate().is_err());
        }
        for depth in [0., 100., f64::NAN, f64::INFINITY] {
            assert!(StarGeometry { points: 4, depth }.validate().is_err());
        }
        assert!(serde_json::from_value::<StarGeometry>(json!({"points":4.5,"depth":20})).is_err());
        for representation in [
            Representation::Rectangle,
            Representation::Ellipse,
            Representation::Text,
        ] {
            let mut d = definition();
            let e = element(&mut d);
            e.features.representation = representation;
            e.star_geometry = Some(StarGeometry::default());
            assert!(d.project(&BTreeMap::new()).is_err());
        }
        let mut d = definition();
        let e = element(&mut d);
        e.ellipse_arc = Some(Default::default());
        e.features.outline = true;
        assert!(d.project(&BTreeMap::new()).is_err());
    }
    #[test]
    fn star_clear_repairs_pending_conversion_without_discarding_other_draft() {
        let mut d = definition();
        let e = element(&mut d);
        e.star_geometry = Some(StarGeometry {
            points: 4,
            depth: 18.,
        });
        e.features.representation = Representation::Rectangle;
        let id = e.id.clone();
        d.name = "unsaved name".into();
        let clear = |definition| {
            edit::edit(edit::Edit {
                definition,
                operation: edit::Operation::StarGeometry {
                    layer_id: id.clone(),
                    star_geometry: None,
                },
            })
        };
        let result = clear(d.clone()).unwrap();
        assert_eq!(result["definition"]["name"], "unsaved name");
        assert!(!result["definition"].to_string().contains("starGeometry"));
        d.styles[0].font_size = -1.;
        assert!(clear(d).is_err());
    }
    #[test]
    fn star_save_capture_duplicate_and_atomic_roundtrip_preserve_independent_motion() {
        let mut d = definition();
        let id = element(&mut d).id.clone();
        let motions = serde_json::to_value(&element(&mut d).motions).unwrap();
        let v = edit::edit(edit::Edit {
            definition: d,
            operation: edit::Operation::StarGeometry {
                layer_id: id,
                star_geometry: Some(StarGeometry {
                    points: 4,
                    depth: 16.,
                }),
            },
        })
        .unwrap();
        d = serde_json::from_value(v["definition"].clone()).unwrap();
        assert_eq!(
            serde_json::to_value(&element(&mut d).motions).unwrap(),
            motions
        );
        let db = crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
        let saved = asset::save(
            &db,
            asset::Save {
                definition: d,
                base_revision: 0,
                idempotency_key: "star-contract-save".into(),
            },
        )
        .unwrap();
        let captured = asset::capture(asset::Capture {
            template: saved.project(&BTreeMap::new()).unwrap(),
            name: "Captured star".into(),
        })
        .unwrap();
        let mut duplicate = asset::duplicate(asset::Duplicate {
            definition: captured,
            name: "Star copy".into(),
        })
        .unwrap();
        assert_eq!(
            element(&mut duplicate)
                .star_geometry
                .as_ref()
                .unwrap()
                .points,
            4
        );
        let v = preview(duplicate);
        assert_eq!(graphic(&v)["params"]["depth"], 16.);
        assert_eq!(
            saved.inspect().unwrap()["capabilities"]["starGeometry"]["defaultGeometry"]["depth"],
            45
        );
    }
    #[test]
    fn star_basic_add_and_outline_are_executable_and_legacy_shapes_unchanged() {
        let t = definition().project(&BTreeMap::new()).unwrap();
        let (t, id) = element_edit::add(element_edit::Add {
            template: t,
            representation: Representation::Star,
        })
        .unwrap();
        assert!(
            t.elements
                .iter()
                .any(|e| e.id == id && e.features.representation == Representation::Star)
        );
        let mut d = definition();
        let id = element(&mut d).id.clone();
        d.styles[0].stroke_width = 7.;
        let v = edit::edit(edit::Edit {
            definition: d,
            operation: edit::Operation::Outline {
                layer_id: id,
                enabled: true,
            },
        })
        .unwrap();
        let rendered = preview(serde_json::from_value(v["definition"].clone()).unwrap());
        assert_eq!(graphic(&rendered)["params"]["fill"], "#00000000");
        assert_eq!(graphic(&rendered)["params"]["strokeWidth"], 7.);
        let mut d = definition();
        element(&mut d).features.representation = Representation::Ellipse;
        let v = preview(d);
        assert_eq!(graphic(&v)["definitionId"], "ellipse");
        assert!(graphic(&v)["params"]["points"].is_null());
    }
    #[test]
    fn added_stars_start_square_in_canvas_pixels_across_formats() {
        for (width, height) in [(720, 720), (1280, 720), (720, 1280)] {
            let mut template = definition().project(&BTreeMap::new()).unwrap();
            template.canvas.width = width;
            template.canvas.height = height;
            let (template, id) = element_edit::add(element_edit::Add {
                template,
                representation: Representation::Star,
            })
            .unwrap();
            let region = &template
                .elements
                .iter()
                .find(|e| e.id == id)
                .unwrap()
                .region;
            assert!(
                (region.width * f64::from(width) - region.height * f64::from(height)).abs() < 1e-9
            );
            assert!((region.x + region.width / 2. - 0.5).abs() < 1e-9);
            assert!((region.y + region.height / 2. - 0.5).abs() < 1e-9);
        }
    }
    fn nonuniform_parent_definition(width: u32, height: u32, nested: bool) -> asset::Definition {
        let mut d = definition();
        d.canvas.width = width;
        d.canvas.height = height;
        if let asset::LayerContent::Group { region, .. } = &mut d.layers[0].content {
            *region = Rect {
                x: 0.1,
                y: 0.2,
                width: 0.8,
                height: 0.4,
            };
        }
        if nested {
            d.layers[1].parent_id = Some("nested".into());
            d.layers.push(asset::Layer {
                parent_id: Some("root".into()),
                content: asset::LayerContent::Group {
                    id: "nested".into(),
                    region: Rect {
                        x: 0.15,
                        y: 0.2,
                        width: 0.45,
                        height: 0.7,
                    },
                    composite: false,
                    separate_instances: false,
                },
            });
        }
        d
    }
    #[test]
    fn added_stars_remain_square_and_centered_under_nonuniform_parent_groups() {
        for (width, height) in [(720, 720), (1280, 720), (720, 1280)] {
            for depth in 0..=2 {
                let d = nonuniform_parent_definition(width, height, depth == 2);
                let parent_id = match depth {
                    0 => None,
                    1 => Some("root"),
                    _ => Some("nested"),
                };
                let parent = parent_id
                    .map(|id| d.canvas_region(id).unwrap())
                    .unwrap_or(Rect {
                        x: 0.,
                        y: 0.,
                        width: 1.,
                        height: 1.,
                    });
                let output = edit::edit(edit::Edit {
                    definition: d.clone(),
                    operation: edit::Operation::Add {
                        representation: Representation::Star,
                        parent_id: parent_id.map(str::to_string),
                    },
                })
                .unwrap();
                let id = output["selectedLayerId"].as_str().unwrap();
                let mut result: asset::Definition =
                    serde_json::from_value(output["definition"].clone()).unwrap();
                let region = result.canvas_region(id).unwrap();
                let pixel_width = region.width * f64::from(width);
                let pixel_height = region.height * f64::from(height);
                assert!(
                    (pixel_width - pixel_height).abs() < 1e-9,
                    "format {width}x{height}, depth {depth}"
                );
                assert!((region.x + region.width / 2. - parent.x - parent.width / 2.).abs() < 1e-9);
                assert!(
                    (region.y + region.height / 2. - parent.y - parent.height / 2.).abs() < 1e-9
                );
                assert!(region.x >= parent.x && region.y >= parent.y);
                assert!(region.x + region.width <= parent.x + parent.width);
                assert!(region.y + region.height <= parent.y + parent.height);
                let rendered = preview(result.clone());
                let compiled = rendered["tracks"]["overlay"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .flat_map(|track| track["elements"].as_array().unwrap())
                    .find(|e| e["params"]["template.elementId"] == id)
                    .unwrap();
                assert_eq!(compiled["definitionId"], "star");
                let sx = compiled["params"]["transform.scaleX"].as_f64().unwrap();
                let sy = compiled["params"]["transform.scaleY"].as_f64().unwrap();
                assert!((sx - sy).abs() < 1e-9);
                result.layers.pop();
                result.styles.pop();
                assert_eq!(
                    serde_json::to_value(result).unwrap(),
                    serde_json::to_value(d).unwrap()
                );
            }
        }
    }
    #[test]
    fn parented_nonstar_add_retains_existing_local_defaults() {
        for representation in [
            Representation::Text,
            Representation::Rectangle,
            Representation::Ellipse,
            Representation::Line,
        ] {
            let d = nonuniform_parent_definition(1280, 720, true);
            let output = edit::edit(edit::Edit {
                definition: d,
                operation: edit::Operation::Add {
                    representation: representation.clone(),
                    parent_id: Some("nested".into()),
                },
            })
            .unwrap();
            let last = output["definition"]["layers"]
                .as_array()
                .unwrap()
                .last()
                .unwrap();
            assert_eq!(last["parentId"], "nested");
            assert_eq!(
                last["content"]["element"]["region"],
                json!({
                    "x":0.1,"y":0.15,"width":0.8,
                    "height":if representation == Representation::Line {0.01} else {0.15},
                })
            );
        }
    }
    #[test]
    fn star_schema_exposes_geometry_and_execution_limits() {
        let s = serde_json::to_value(schemars::schema_for!(asset::Definition)).unwrap();
        assert!(s["$defs"]["Element"]["properties"]["starGeometry"].is_object());
        assert_eq!(
            s["$defs"]["StarGeometry"]["properties"]["points"]["maximum"],
            12
        );
        assert!(
            crate::templates::treatments::capabilities()
                .to_string()
                .contains("starGeometry")
        );
    }
    #[test]
    fn star_measured_text_attachment_retains_identity_and_independent_rotation() {
        let mut d = asset::create(asset::Create {
            name: "Attached star".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: Some(asset::CreatePurpose::Keyword),
        })
        .unwrap();
        let parent = element(&mut d).clone();
        let mut star = parent.clone();
        star.id = "star-child".into();
        star.features.representation = Representation::Star;
        star.features.role = Some(Role::Decoration);
        star.star_geometry = Some(StarGeometry {
            points: 4,
            depth: 18.,
        });
        star.motions.push(serde_json::from_value(json!({"property":"rotation","keys":[{"time":0,"value":-15,"easing":"ease_out"},{"time":1,"value":10,"easing":"linear"}]})).unwrap());
        d.layers.push(asset::Layer {
            parent_id: Some("root".into()),
            content: asset::LayerContent::Element { element: star },
        });
        d.spatial_relations=serde_json::from_value(json!([{"elementId":"star-child","relativeTo":parent.id,"placement":"right","gap":0.02,"offsetX":0,"offsetY":0,"referenceBounds":"text_box","followMotion":true,"sizeBinding":{"height":{"factor":1,"padding":0.02}}}])).unwrap();
        let v = preview(d);
        let g = graphic(&v);
        let text = v["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|t| t["elements"].as_array().unwrap())
            .find(|e| e["type"] == "text")
            .unwrap();
        assert_eq!(g["textAttachment"]["parent"]["elementId"], text["id"]);
        assert_eq!(g["textAttachment"]["sizeBinding"]["height"]["factor"], 1.);
        assert_eq!(g["startTime"], text["startTime"]);
        assert_eq!(g["duration"], text["duration"]);
        assert!(g["animations"]["transform.rotate"]["keys"].is_array());
        assert_eq!(g["params"]["points"], 4);
    }
    #[test]
    fn star_media_conversion_is_explicitly_unsupported_with_or_without_geometry() {
        let media = crate::templates::assets::Asset {
            id: "visual-test".into(),
            sha256: "a".repeat(64),
            source_sha256: "a".repeat(64),
            name: "Fixture".into(),
            description: String::new(),
            tags: vec![],
            provenance: "test".into(),
            kind: crate::templates::assets::Kind::Image,
            width: 128,
            height: 128,
            duration: None,
            size: 1,
            created_at: 0,
        };
        for geometry in [
            None,
            Some(StarGeometry {
                points: 4,
                depth: 18.,
            }),
        ] {
            let mut d = definition();
            let e = element(&mut d);
            e.star_geometry = geometry;
            let id = e.id.clone();
            let error = edit::edit_media(
                edit::MediaEdit {
                    definition: d,
                    asset_id: media.id.clone(),
                    layer_id: Some(id),
                    parent_id: None,
                    convert_shape: true,
                },
                &media,
            )
            .unwrap_err();
            assert!(
                error
                    .to_string()
                    .contains("requires a rectangle or ellipse")
            );
        }
    }
}
