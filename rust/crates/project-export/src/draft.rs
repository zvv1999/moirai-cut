// Draft schema adapted from OpenFilm (MIT); see THIRD_PARTY_NOTICES.md.
use crate::{Clip, Plan, xml};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub fn document(p: &Plan) -> (Value, Value) {
    let audio_gain = |c: &Clip| {
        if !c.enabled {
            return 0.0;
        }
        // Moirai duplicates mono into L/R; Jianying 11.1 uses equal-power upmixing.
        // Keep the audible level, including when source audio stays on its video.
        c.gain
            * if p.target == "jianying" && p.file(&c.source).audio_channels == 1 {
                std::f64::consts::SQRT_2
            } else {
                1.0
            }
    };
    let own_audio: BTreeMap<&str, &Clip> = p
        .audio
        .iter()
        .flat_map(|t| &t.clips)
        .filter(|a| {
            !a.link.is_empty()
                && p.video.iter().flat_map(|t| &t.clips).any(|v| {
                    v.link == a.link
                        && v.source == a.source
                        && v.source_in == a.source_in
                        && v.start == a.start
                        && v.end == a.end
                        && p.file(&v.source).audio_channels > 0
                })
        })
        .map(|a| (a.link.as_str(), a))
        .collect();
    let mut materials: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for key in [
        "videos",
        "audios",
        "texts",
        "speeds",
        "audio_fades",
        "canvases",
        "effects",
        "filters",
        "material_animations",
        "stickers",
        "transitions",
        "video_effects",
        "beats",
        "sound_channel_mappings",
        "vocal_separations",
    ] {
        materials.insert(key.into(), vec![]);
    }
    let mut library = vec![];
    let mut tracks = vec![];
    let mut counter = 0usize;
    // All ids are unique within a draft and stable across repeated serialization.
    let mut next = || {
        counter += 1;
        format!("{:032x}", counter)
    };
    let mut registered: BTreeMap<(String, String), String> = BTreeMap::new();
    for (kind, source_tracks) in [("video", &p.video), ("audio", &p.audio)] {
        for track in source_tracks {
            let is_text = track.clips.iter().all(|c| c.kind == "text");
            let track_type = if is_text { "text" } else { kind };
            let index = tracks.len();
            let mut segments = vec![];
            for c in &track.clips {
                if kind == "audio" && own_audio.contains_key(c.link.as_str()) {
                    continue;
                }
                let volume = if kind == "audio" {
                    audio_gain(c)
                } else {
                    own_audio
                        .get(c.link.as_str())
                        .map_or(0.0, |a| audio_gain(a))
                };
                let mut fit = 1.0;
                let material = if c.kind == "text" {
                    let id = next();
                    let rgb = xml::color(&c.color);
                    // Calibrated against native 11.1 exports: 6.25 px per size unit
                    // at 1080 px canvas width. Height-only scaling shrank portrait titles.
                    let size = if p.target == "jianying" {
                        c.font_size * 1080.0 / p.width as f64 / 6.25
                    } else {
                        c.font_size * 1080.0 / p.height as f64 / 8.0
                    };
                    materials.get_mut("texts").unwrap().push(json!({"id":id,"type":"text","typesetting":0,"alignment":1,"letter_spacing":0,"line_spacing":0.02,"line_feed":1,"line_max_width":0.82,"force_apply_line_max_width":false,"check_flag":15,"global_alpha":1,
                        "content":json!({"text":c.text,"styles":[{"fill":{"alpha":1,"content":{"render_type":"solid","solid":{"alpha":1,"color":rgb}}},"range":[0,c.text.chars().count()],"size":size,"bold":false,"italic":false,"underline":false}]}).to_string()}));
                    id
                } else {
                    let s = p.file(&c.source);
                    if s.width > 0 {
                        fit = (p.width as f64 / s.width as f64)
                            .min(p.height as f64 / s.height as f64);
                    }
                    let key = (kind.to_string(), s.id.clone());
                    if let Some(id) = registered.get(&key) {
                        id.clone()
                    } else {
                        let id = next();
                        let local = next();
                        let duration = if s.still {
                            10_800_000_000_i64
                        } else {
                            (s.duration_seconds * 1_000_000.0).round() as i64
                        };
                        let media_kind = if kind == "audio" {
                            "music"
                        } else if s.still {
                            "photo"
                        } else {
                            "video"
                        };
                        library.push(json!({"id":local,"type":0,"metetype":media_kind,"file_Path":s.path,"extra_info":s.name,"duration":duration,"width":s.width,"height":s.height,"create_time":-1,"import_time":-1,"import_time_ms":-1,"item_source":1,"md5":"","roughcut_time_range":{"start":-1,"duration":-1},"sub_time_range":{"start":-1,"duration":-1}}));
                        let mat = if kind == "audio" {
                            json!({"id":id,"type":"extract_music","name":s.name,"path":s.path,"duration":duration,"local_material_id":local,"music_id":id,"wave_points":[],"category_id":"","category_name":"local","check_flag":3,"source_platform":0})
                        } else {
                            json!({"id":id,"type":media_kind,"path":s.path,"media_path":"","material_name":s.name,"material_id":id,"local_material_id":local,"duration":duration,"width":s.width,"height":s.height,"category_id":"","category_name":"local","check_flag":63487,"audio_fade":null,"crop_ratio":"free","crop_scale":1,"crop":{"upper_left_x":0,"upper_left_y":0,"upper_right_x":1,"upper_right_y":0,"lower_left_x":0,"lower_left_y":1,"lower_right_x":1,"lower_right_y":1}})
                        };
                        materials
                            .get_mut(if kind == "audio" { "audios" } else { "videos" })
                            .unwrap()
                            .push(mat);
                        registered.insert(key, id.clone());
                        id
                    }
                };
                let speed = next();
                materials
                    .get_mut("speeds")
                    .unwrap()
                    .push(json!({"id":speed,"type":"speed","speed":1,"mode":0,"curve_speed":null}));
                segments.push(json!({"id":next(),"material_id":material,"target_timerange":{"start":p.us(c.start),"duration":p.us(c.end)-p.us(c.start)},
                    "source_timerange":if c.kind=="text"{Value::Null}else{json!({"start":p.us(c.source_in),"duration":p.us(c.source_in+c.end-c.start)-p.us(c.source_in)})},
                    "visible":c.enabled,"volume":volume,"last_nonzero_volume":if volume>0.0 {volume} else {1.0},"speed":1,"reverse":false,"is_tone_modify":false,
                    "extra_material_refs":if c.kind=="text"{vec![]}else{vec![speed]},"common_keyframes":[],"keyframe_refs":[],"render_index":index,"track_render_index":0,"track_attribute":0,
                    "enable_adjust":true,"enable_color_correct_adjust":false,"enable_color_curves":true,"enable_color_wheels":true,"enable_lut":true,"enable_smart_color_adjust":false,
                    "clip":if kind=="audio"{Value::Null}else{json!({"alpha":1,"flip":{"horizontal":false,"vertical":false},"rotation":0,"scale":{"x":c.scale/fit,"y":c.scale/fit},"transform":{"x":2.0*c.x/p.width as f64,"y":-2.0*c.y/p.height as f64}})},
                    "uniform_scale":{"on":true,"value":1},"hdr_settings":if kind=="audio"{Value::Null}else{json!({"intensity":1,"mode":1,"nits":1000})}
                }));
            }
            if !segments.is_empty() {
                tracks.push(json!({"id":next(),"type":track_type,"name":track.name,"is_default_name":false,"attribute":0,"flag":0,"segments":segments}));
            }
        }
    }
    let platform = if p.target == "capcut" {
        json!({"app_id":359289,"app_source":"cc","app_version":"5.9.0","os":"windows"})
    } else {
        json!({"app_id":3704,"app_source":"lv","app_version":"5.9.0","os":"windows"})
    };
    let info = json!({"id":p.id.to_uppercase(),"name":p.name,"version":360000,"new_version":"110.0.0","source":"default","duration":p.us(p.duration),"fps":p.fps(),"canvas_config":{"width":p.width,"height":p.height,"ratio":"original"},"color_space":0,
        "platform":platform,"last_modified_platform":platform,"materials":materials,"tracks":tracks,"create_time":0,"update_time":0,"cover":null,"extra_info":null,"group_container":null,"mutable_config":null,"relationships":[],"keyframe_graph_list":[],
        "keyframes":{"adjusts":[],"audios":[],"effects":[],"filters":[],"handwrites":[],"stickers":[],"texts":[],"videos":[]},"render_index_track_mode_on":false,"free_render_index_mode_on":false,"static_cover_image_path":"","time_marks":null,
        "config":{"maintrack_adsorb":false,"material_save_mode":0,"video_mute":false,"lyrics_sync":true,"subtitle_sync":true,"subtitle_recognition_id":"","subtitle_taskinfo":[],"system_font_list":[],"multi_language_current":"none","multi_language_list":[],"multi_language_main":"none","multi_language_mode":"none","multi_language_refs":[],"zoom_info_params":null,"export_range":null,"attachment_info":[]}});
    let normalized_folder = p.folder.replace('\\', "/");
    let root = normalized_folder
        .rsplit_once('/')
        .map(|(a, _)| a)
        .unwrap_or("");
    let meta = json!({"draft_id":p.id.to_uppercase(),"draft_name":p.name,"draft_fold_path":p.folder,"draft_root_path":root,"draft_cover":"","draft_is_invisible":false,"draft_is_from_deeplink":"false","draft_type":"","draft_materials":[{"type":0,"value":library},{"type":1,"value":[]},{"type":2,"value":[]},{"type":3,"value":[]},{"type":6,"value":[]},{"type":7,"value":[]},{"type":8,"value":[]}],"draft_materials_copied_info":[],"draft_segment_extra_info":[],"draft_new_version":"","draft_cloud_materials":[],"tm_draft_create":p.now*1000,"tm_draft_modified":p.now*1000,"tm_draft_removed":0,"tm_duration":p.us(p.duration)});
    (info, meta)
}
