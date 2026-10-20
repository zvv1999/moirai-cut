//! Rectangle shape geometry, independent of paint, scheduling and motion.
use super::model::{Element, Representation};
use anyhow::{Result, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RectangleGeometry {
    /// Radius as 0–50% of the shorter mapped design side, before motion transforms.
    /// 0 is square-cornered; 50 makes a capsule (a circle for a square).
    #[schemars(range(min = 0.0, max = 50.0))]
    pub corner_radius: f64,
}

impl RectangleGeometry {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.corner_radius.is_finite() && (0.0..=50.).contains(&self.corner_radius),
            "rectangle cornerRadius must be finite and between 0 and 50"
        );
        Ok(())
    }
}

pub(crate) fn validate_element(element: &Element) -> Result<()> {
    if let Some(geometry) = &element.rectangle_geometry {
        ensure!(
            element.features.representation == Representation::Rectangle,
            "rectangleGeometry requires rectangle representation; clear geometry before converting {}",
            element.id
        );
        geometry.validate()?;
    }
    Ok(())
}

pub fn capabilities() -> Value {
    json!({
        "geometryField":"rectangleGeometry",
        "representation":"rectangle",
        "nativeDefinitionId":"rectangle",
        "nativeParams":["cornerRadius","rectangleAspectRatio"],
        "cornerRadius":{"minimum":0,"maximum":50,"unit":"percent_of_shorter_design_side"},
        "aspectRatio":"mapped_region_pixel_width_divided_by_height_before_motion",
        "defaultGeometry":{"cornerRadius":0},
        "legacyAbsent":"unchanged_no_native_geometry_params",
        "filled":true,
        "outline":true,
        "strokeAlignment":"center",
        "strokeWidthSpace":"existing_square_source_pixels_nonuniform_transform_may_stretch_thickness",
        "textSizeBinding":true,
        "textSizeBindingGeometry":"renderer_recomputes_aspect_from_measured_width_height_ratios_before_independent_axis_motion",
        "geometryAnimation":false,
        "orthogonalMotion":["opacity","scale","scale_x","scale_y","rotation","x","y"],
        "independentAxisMotion":"deforms_base_geometry_without_dynamic_radius_compensation",
        "bounds":"conservative_source_box",
        "sourceGeometry":"square_source_with_mapped_rectangle_aspect_compensation",
        "aestheticQualityVerified":false
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{
        dynamic_asset as asset, dynamic_asset_edit as edit, element_edit, model::*,
    };
    use std::collections::BTreeMap;

    fn definition() -> asset::Definition {
        asset::create(asset::Create {
            name: "Rectangle contract".into(),
            canvas: Canvas {
                width: 720,
                height: 720,
                fps: 30,
            },
            purpose: Some(asset::CreatePurpose::Decoration),
        })
        .unwrap()
    }

    fn element(definition: &mut asset::Definition) -> &mut Element {
        definition
            .layers
            .iter_mut()
            .find_map(|layer| match &mut layer.content {
                asset::LayerContent::Element { element } => Some(element),
                _ => None,
            })
            .unwrap()
    }

    fn preview(definition: asset::Definition) -> Value {
        asset::preview(asset::Preview {
            definition,
            inputs: BTreeMap::new(),
            duration_seconds: 2.,
            example: None,
        })
        .unwrap()
    }

    fn graphic(tracks: &Value) -> &Value {
        for track in tracks.as_array().unwrap() {
            for element in track["elements"].as_array().unwrap() {
                if element["renderGroup"]["tracks"].is_array() {
                    return graphic(&element["renderGroup"]["tracks"]);
                }
                if element["type"] == "graphic" {
                    return element;
                }
            }
        }
        panic!("missing graphic")
    }

    fn strip_ids(value: &mut Value) {
        match value {
            Value::Object(map) => {
                map.remove("id");
                map.remove("template.requestHash");
                for value in map.values_mut() {
                    strip_ids(value);
                }
            }
            Value::Array(values) => {
                for value in values {
                    strip_ids(value);
                }
            }
            _ => {}
        }
    }

    fn near(actual: f64, expected: f64) {
        assert!((actual - expected).abs() < 1e-9, "{actual} != {expected}");
    }

    #[test]
    fn rectangle_absent_geometry_keeps_legacy_serialization_and_compiled_channels() {
        let original = definition();
        let json = serde_json::to_value(&original).unwrap();
        assert!(!json.to_string().contains("rectangleGeometry"));
        let roundtrip: asset::Definition = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(serde_json::to_value(roundtrip).unwrap(), json);
        let before = preview(original.clone());
        let old = graphic(&before["tracks"]["overlay"]);
        assert!(old["params"].get("cornerRadius").is_none());
        assert!(old["params"].get("rectangleAspectRatio").is_none());
        for radius in [0., 12.5, 50.] {
            let mut changed = original.clone();
            element(&mut changed).rectangle_geometry = Some(RectangleGeometry {
                corner_radius: radius,
            });
            let after = preview(changed);
            let mut current = graphic(&after["tracks"]["overlay"]).clone();
            assert_eq!(current["params"]["cornerRadius"], radius);
            assert_eq!(current["params"]["rectangleAspectRatio"], 1.);
            let params = current["params"].as_object_mut().unwrap();
            params.remove("cornerRadius");
            params.remove("rectangleAspectRatio");
            let mut old = old.clone();
            strip_ids(&mut old);
            strip_ids(&mut current);
            assert_eq!(current, old, "geometry changed unrelated compiled channels");
        }
    }

    #[test]
    fn rectangle_geometry_rejects_invalid_values_unknown_fields_and_other_shapes() {
        for radius in [-1., 50.0001, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(
                RectangleGeometry {
                    corner_radius: radius
                }
                .validate()
                .is_err()
            );
        }
        for json in [
            json!({}),
            json!({"cornerRadius":"8"}),
            json!({"cornerRadius":8,"extra":true}),
        ] {
            assert!(serde_json::from_value::<RectangleGeometry>(json).is_err());
        }
        for representation in [
            Representation::Text,
            Representation::Ellipse,
            Representation::Star,
            Representation::Line,
            Representation::Image,
            Representation::Video,
            Representation::Audio,
        ] {
            let mut changed = definition();
            let e = element(&mut changed);
            e.features.representation = representation;
            e.rectangle_geometry = Some(RectangleGeometry::default());
            assert!(
                validate_element(e)
                    .unwrap_err()
                    .to_string()
                    .contains("requires rectangle representation")
            );
            assert!(changed.project(&BTreeMap::new()).is_err());
        }
        let mut changed = definition();
        element(&mut changed).rectangle_geometry = Some(RectangleGeometry { corner_radius: 51. });
        assert!(changed.project(&BTreeMap::new()).is_err());
    }

    #[test]
    fn rectangle_atomic_edit_and_nullable_clear_preserve_other_unsaved_fields() {
        let mut before = definition();
        let id = element(&mut before).id.clone();
        before.name = "Keep my unsaved name".into();
        let request = |definition: asset::Definition, geometry: Value| {
            serde_json::from_value::<edit::Edit>(json!({
                "definition":definition,
                "operation":{"kind":"rectangle_geometry","layerId":id,"rectangleGeometry":geometry}
            }))
            .unwrap()
        };
        let changed = edit::edit(request(before.clone(), json!({"cornerRadius":17.5}))).unwrap();
        let mut after: asset::Definition =
            serde_json::from_value(changed["definition"].clone()).unwrap();
        assert_eq!(
            element(&mut after)
                .rectangle_geometry
                .as_ref()
                .unwrap()
                .corner_radius,
            17.5
        );
        element(&mut after).rectangle_geometry = None;
        assert_eq!(
            serde_json::to_value(&after).unwrap(),
            serde_json::to_value(&before).unwrap()
        );
        let mut pending: asset::Definition =
            serde_json::from_value(changed["definition"].clone()).unwrap();
        element(&mut pending).features.representation = Representation::Ellipse;
        assert!(pending.project(&BTreeMap::new()).is_err());
        let cleared = edit::edit(request(pending.clone(), Value::Null)).unwrap();
        assert_eq!(cleared["definition"]["name"], before.name);
        assert!(
            !cleared["definition"]
                .to_string()
                .contains("rectangleGeometry")
        );
        assert!(edit::edit(request(pending.clone(), json!({"cornerRadius":10}))).is_err());
        pending.styles[0].font_size = -1.;
        assert!(edit::edit(request(pending, Value::Null)).is_err());
        for id in ["root", "missing"] {
            assert!(
                edit::edit(edit::Edit {
                    definition: before.clone(),
                    operation: edit::Operation::RectangleGeometry {
                        layer_id: id.into(),
                        rectangle_geometry: Some(RectangleGeometry::default()),
                    },
                })
                .is_err()
            );
        }
        assert!(edit::edit(request(before, json!({"cornerRadius":-1}))).is_err());
    }

    #[test]
    fn rectangle_aspect_uses_pixel_region_after_all_parent_groups() {
        for (width, height) in [(720, 720), (1280, 720), (720, 1280)] {
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
            let e = element(&mut d);
            e.region = Rect {
                x: 0.1,
                y: 0.1,
                width: 0.4,
                height: 0.2,
            };
            e.rectangle_geometry = Some(RectangleGeometry { corner_radius: 50. });
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
            let output = preview(d);
            let g = graphic(&output["tracks"]["overlay"]);
            let expected = (0.8 * 0.45 * 0.4 * width as f64) / (0.4 * 0.7 * 0.2 * height as f64);
            near(
                g["params"]["rectangleAspectRatio"].as_f64().unwrap(),
                expected,
            );
            near(
                g["params"]["transform.scaleX"].as_f64().unwrap()
                    / g["params"]["transform.scaleY"].as_f64().unwrap(),
                expected,
            );
            assert_eq!(g["params"]["cornerRadius"], 50.);
        }
    }

    #[test]
    fn rectangle_application_fitting_and_rotation_preserve_design_aspect_and_axis_motion() {
        let mut d = definition();
        let e = element(&mut d);
        e.region = Rect {
            x: 0.1,
            y: 0.3,
            width: 0.6,
            height: 0.2,
        };
        e.rectangle_geometry = Some(RectangleGeometry { corner_radius: 10. });
        e.motions = serde_json::from_value(json!([
            {"property":"scale_x","keys":[{"time":0,"value":0.7,"easing":"linear"},{"time":1,"value":1.2,"easing":"linear"}]},
            {"property":"scale_y","keys":[{"time":0,"value":1.4,"easing":"linear"},{"time":1,"value":0.6,"easing":"linear"}]},
            {"property":"rotation","keys":[{"time":0,"value":-12,"easing":"linear"},{"time":1,"value":8,"easing":"linear"}]}
        ])).unwrap();
        for (width, height) in [(1280, 720), (720, 1280)] {
            for rotation in [0., 37.] {
                let app: asset::Application = serde_json::from_value(json!({
                    "assetId":d.id,"assetRevision":d.revision,
                    "canvas":{"width":width,"height":height,"fps":30},
                    "placement":{"x":0.1,"y":0.1,"width":0.8,"height":0.8},
                    "transform":{"scale":0.6,"centerX":0.5,"centerY":0.5,"rotationDegrees":rotation}
                }))
                .unwrap();
                let t = asset::application(&d, &app).unwrap();
                let output = asset::preview_application(asset::ApplicationPreview {
                    template: t,
                    duration_seconds: 2.,
                    example: None,
                })
                .unwrap();
                let g = graphic(&output["tracks"]["overlay"]);
                near(g["params"]["rectangleAspectRatio"].as_f64().unwrap(), 3.);
                assert_eq!(g["params"]["cornerRadius"], 10.);
                let sx = g["params"]["transform.scaleX"].as_f64().unwrap();
                let sy = g["params"]["transform.scaleY"].as_f64().unwrap();
                near(
                    g["animations"]["transform.scaleX"]["keys"][0]["value"]
                        .as_f64()
                        .unwrap(),
                    sx * 0.7,
                );
                near(
                    g["animations"]["transform.scaleY"]["keys"][0]["value"]
                        .as_f64()
                        .unwrap(),
                    sy * 1.4,
                );
                assert_eq!(
                    g["animations"]["transform.rotate"]["keys"][0]["value"],
                    -12.
                );
                assert!(g["animations"].get("params.cornerRadius").is_none());
                assert!(g["animations"].get("params.rectangleAspectRatio").is_none());
            }
        }
    }

    #[test]
    fn rectangle_save_capture_duplicate_roundtrip_retains_geometry_and_event_identity() {
        let mut d = definition();
        element(&mut d).rectangle_geometry = Some(RectangleGeometry { corner_radius: 7.5 });
        let original_element = serde_json::to_value(element(&mut d)).unwrap();
        let db = crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
        let save = || asset::Save {
            definition: d.clone(),
            base_revision: 0,
            idempotency_key: "rectangle-contract-save".into(),
        };
        let saved = asset::save(&db, save()).unwrap();
        assert_eq!(
            serde_json::to_value(asset::save(&db, save()).unwrap()).unwrap(),
            serde_json::to_value(&saved).unwrap()
        );
        let t = saved.project(&BTreeMap::new()).unwrap();
        let (duplicated, id) = element_edit::duplicate(t.clone(), &t.elements[0].id).unwrap();
        let copy = duplicated.elements.iter().find(|e| e.id == id).unwrap();
        assert_eq!(copy.rectangle_geometry.as_ref().unwrap().corner_radius, 7.5);
        assert_eq!(
            serde_json::to_value(&copy.timing).unwrap(),
            original_element["timing"]
        );
        assert_eq!(
            serde_json::to_value(&copy.motions).unwrap(),
            original_element["motions"]
        );
        let captured = asset::capture(asset::Capture {
            template: t,
            name: "Captured rectangle".into(),
        })
        .unwrap();
        let mut duplicate = asset::duplicate(asset::Duplicate {
            definition: captured,
            name: "Copied rectangle".into(),
        })
        .unwrap();
        let mut copied_element = serde_json::to_value(element(&mut duplicate)).unwrap();
        let mut expected = original_element;
        copied_element.as_object_mut().unwrap().remove("id");
        expected.as_object_mut().unwrap().remove("id");
        copied_element.as_object_mut().unwrap().remove("styleId");
        expected.as_object_mut().unwrap().remove("styleId");
        assert_eq!(copied_element, expected);
        let output = preview(duplicate);
        let g = graphic(&output["tracks"]["overlay"]);
        assert_eq!(g["params"]["cornerRadius"], 7.5);
        assert_eq!(
            saved.inspect().unwrap()["capabilities"]["rectangleGeometry"],
            capabilities()
        );
    }

    #[test]
    fn rectangle_outline_changes_only_paint_and_media_conversion_requires_clear() {
        let mut d = definition();
        let id = element(&mut d).id.clone();
        element(&mut d).rectangle_geometry = Some(RectangleGeometry { corner_radius: 25. });
        d.styles[0].stroke_width = 7.;
        let result = edit::edit(edit::Edit {
            definition: d.clone(),
            operation: edit::Operation::Outline {
                layer_id: id.clone(),
                enabled: true,
            },
        })
        .unwrap();
        let output = preview(serde_json::from_value(result["definition"].clone()).unwrap());
        let g = graphic(&output["tracks"]["overlay"]);
        assert_eq!(g["params"]["fill"], "#00000000");
        assert_eq!(g["params"]["strokeWidth"], 7.);
        assert_eq!(g["params"]["cornerRadius"], 25.);
        let media = crate::templates::assets::Asset {
            id: "rectangle-media".into(),
            sha256: "a".repeat(64),
            source_sha256: "a".repeat(64),
            name: "Image".into(),
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
        let convert = |definition| {
            edit::edit_media(
                edit::MediaEdit {
                    definition,
                    asset_id: media.id.clone(),
                    layer_id: Some(id.clone()),
                    parent_id: None,
                    convert_shape: true,
                },
                &media,
            )
        };
        assert!(
            convert(d.clone())
                .unwrap_err()
                .to_string()
                .contains("rectangleGeometry requires rectangle")
        );
        element(&mut d).rectangle_geometry = None;
        assert!(convert(d).is_ok());
    }

    #[test]
    fn rectangle_text_size_binding_retains_authored_aspect_and_motion_metadata() {
        let mut d = asset::create(asset::Create {
            name: "Attached rectangle".into(),
            canvas: Canvas {
                width: 1280,
                height: 720,
                fps: 30,
            },
            purpose: Some(asset::CreatePurpose::Keyword),
        })
        .unwrap();
        let parent = element(&mut d).clone();
        let mut rectangle = parent.clone();
        rectangle.id = "rectangle-child".into();
        rectangle.features.representation = Representation::Rectangle;
        rectangle.features.role = Some(Role::Decoration);
        rectangle.region = Rect {
            x: 0.1,
            y: 0.1,
            width: 0.3,
            height: 0.1,
        };
        rectangle.rectangle_geometry = Some(RectangleGeometry { corner_radius: 50. });
        d.layers.push(asset::Layer {
            parent_id: Some("root".into()),
            content: asset::LayerContent::Element { element: rectangle },
        });
        d.spatial_relations=serde_json::from_value(json!([{
            "elementId":"rectangle-child","relativeTo":parent.id,"placement":"right","gap":0.02,
            "offsetX":0,"offsetY":0,"referenceBounds":"text_box","followMotion":true,
            "sizeBinding":{"width":{"factor":1.2,"padding":0.01},"height":{"factor":1,"padding":0.02}}
        }])).unwrap();
        let output = preview(d);
        let g = graphic(&output["tracks"]["overlay"]);
        let text = output["tracks"]["overlay"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|t| t["elements"].as_array().unwrap())
            .find(|e| e["type"] == "text")
            .unwrap();
        assert_eq!(g["textAttachment"]["parent"]["elementId"], text["id"]);
        assert_eq!(g["textAttachment"]["sizeBinding"]["width"]["factor"], 1.2);
        assert_eq!(g["textAttachment"]["sizeBinding"]["height"]["factor"], 1.);
        near(
            g["params"]["rectangleAspectRatio"].as_f64().unwrap(),
            0.3 * 1280. / (0.1 * 720.),
        );
        assert_eq!(g["params"]["cornerRadius"], 50.);
        assert_eq!(g["startTime"], text["startTime"]);
        assert_eq!(g["duration"], text["duration"]);
    }

    #[test]
    fn rectangle_schema_exposes_shape_field_and_optional_atomic_edit() {
        let schema = serde_json::to_value(schemars::schema_for!(asset::Definition)).unwrap();
        assert!(schema["$defs"]["Element"]["properties"]["rectangleGeometry"].is_object());
        let props = &schema["$defs"]["RectangleGeometry"]["properties"]["cornerRadius"];
        assert_eq!(props["minimum"], 0.);
        assert_eq!(props["maximum"], 50.);
        assert!(
            !schema["$defs"]["Element"]["required"]
                .as_array()
                .unwrap()
                .contains(&json!("rectangleGeometry"))
        );
        let operation = serde_json::to_value(schemars::schema_for!(edit::Edit)).unwrap();
        assert!(operation.to_string().contains("rectangle_geometry"));
        assert_eq!(
            crate::templates::treatments::capabilities()["rectangleGeometry"],
            capabilities()
        );
        assert_eq!(capabilities()["textSizeBinding"], true);
        assert_eq!(
            capabilities()["textSizeBindingGeometry"],
            "renderer_recomputes_aspect_from_measured_width_height_ratios_before_independent_axis_motion"
        );
        assert_eq!(
            capabilities()["strokeWidthSpace"],
            "existing_square_source_pixels_nonuniform_transform_may_stretch_thickness"
        );
    }
}
