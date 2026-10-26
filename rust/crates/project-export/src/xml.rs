// Interchange conventions adapted from OpenFilm (MIT); see THIRD_PARTY_NOTICES.md.
use crate::{Clip, Plan, Source};
use std::collections::{HashMap, HashSet};
pub fn escape(s: &str) -> String {
    s.chars()
        .filter(|c| *c >= ' ' || ['\n', '\r', '\t'].contains(c))
        .map(|c| match c {
            '&' => "&amp;".into(),
            '<' => "&lt;".into(),
            '>' => "&gt;".into(),
            '"' => "&quot;".into(),
            '\'' => "&apos;".into(),
            '\n' => "&#10;".into(),
            '\r' => "&#13;".into(),
            '\t' => "&#9;".into(),
            _ => c.to_string(),
        })
        .collect()
}
pub fn file_url(path: &str) -> String {
    let path = path.replace('\\', "/");
    let encoded: String = path
        .bytes()
        .map(|c| {
            if c.is_ascii_alphanumeric() || b"/-_.~:".contains(&c) {
                (c as char).to_string()
            } else {
                format!("%{c:02X}")
            }
        })
        .collect();
    if path.starts_with("//") {
        return format!("file:{encoded}");
    }
    format!(
        "file://{}{}",
        if path.starts_with('/') { "" } else { "/" },
        encoded
    )
}
fn boolean(b: bool) -> &'static str {
    if b { "TRUE" } else { "FALSE" }
}
fn rate(p: &Plan) -> String {
    format!(
        "<rate><timebase>{}</timebase><ntsc>{}</ntsc></rate>",
        p.fps().round(),
        boolean(p.denominator == 1001)
    )
}
fn file(p: &Plan, s: &Source) -> String {
    let mut result = format!(
        "<file id=\"media-{}\"><name>{}</name><pathurl>{}</pathurl>{}<duration>{}</duration><media>",
        escape(&s.id),
        escape(&s.name),
        escape(&s.url.replacen("file:///", "file://localhost/", 1)),
        rate(p),
        (s.duration_seconds * p.fps()).ceil() as i64
    );
    if s.width > 0 {
        result.push_str(&format!("<video><samplecharacteristics>{}<width>{}</width><height>{}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>",rate(p),s.width,s.height));
    }
    if s.audio_channels > 0 {
        result.push_str(&format!("<audio><samplecharacteristics><depth>16</depth><samplerate>{}</samplerate></samplecharacteristics><channelcount>{}</channelcount></audio>",s.sample_rate,s.audio_channels));
    }
    result.push_str("</media></file>");
    result
}
fn filter(kind: &str, name: &str, params: &str) -> String {
    format!(
        "<filter><effect><name>{name}</name><effectid>{kind}</effectid><effectcategory>{kind}</effectcategory><effecttype>{kind}</effecttype>{params}</effect></filter>"
    )
}
pub fn xmeml(p: &Plan) -> String {
    let mut result = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE xmeml>\n<xmeml version=\"4\"><sequence id=\"sequence-1\"><name>{}</name><duration>{}</duration>{}<timecode>{}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media>",
        escape(&p.name),
        p.duration,
        rate(p),
        rate(p)
    );
    let mut written = HashSet::new();
    let mut links: HashMap<&str, Vec<(&Clip, &str, usize, usize)>> = HashMap::new();
    for (kind, tracks) in [("video", &p.video), ("audio", &p.audio)] {
        for (ti, t) in tracks.iter().enumerate() {
            for (ci, c) in t.clips.iter().enumerate() {
                if !c.link.is_empty() {
                    links
                        .entry(&c.link)
                        .or_default()
                        .push((c, kind, ti + 1, ci + 1));
                }
            }
        }
    }
    for (kind, tracks) in [("video", &p.video), ("audio", &p.audio)] {
        result.push_str(&format!("<{kind}>"));
        if kind == "video" {
            result.push_str(&format!("<format><samplecharacteristics>{}<width>{}</width><height>{}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>",rate(p),p.width,p.height));
        } else {
            result.push_str("<numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>");
        }
        for track in tracks {
            result.push_str(if kind == "audio" {
                "<track premiereTrackType=\"Stereo\">"
            } else {
                "<track>"
            });
            for c in &track.clips {
                let s = p.file(&c.source);
                let duration = (s.duration_seconds * p.fps()).ceil() as i64;
                result.push_str(&format!("<clipitem id=\"clip-{}\"><name>{}</name><enabled>{}</enabled><duration>{}</duration>{}<start>{}</start><end>{}</end><in>{}</in><out>{}</out>",escape(&c.id),escape(&c.name),boolean(c.enabled),duration.max(c.source_in+c.end-c.start),rate(p),c.start,c.end,c.source_in,c.source_in+c.end-c.start));
                if kind == "video" {
                    result.push_str("<alphatype>straight</alphatype><pixelaspectratio>square</pixelaspectratio><anamorphic>FALSE</anamorphic>");
                }
                if written.insert(s.id.clone()) {
                    result.push_str(&file(p, s));
                } else {
                    result.push_str(&format!("<file id=\"media-{}\"/>", escape(&s.id)));
                }
                if kind == "audio" {
                    result.push_str("<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>");
                    result.push_str(&filter("audiolevels","Audio Levels",&format!("<mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name><value>{}</value></parameter>",c.gain)));
                } else {
                    result.push_str(&filter("basic","Basic Motion",&format!("<mediatype>video</mediatype><parameter><parameterid>scale</parameterid><name>Scale</name><value>{}</value></parameter><parameter><parameterid>center</parameterid><name>Center</name><value><horiz>{}</horiz><vert>{}</vert></value></parameter>",c.scale*100.0,c.x/p.width as f64,c.y/p.height as f64)));
                }
                if let Some(group) = links.get(c.link.as_str())
                    && group.len() > 1
                {
                    for (other, media, ti, ci) in group {
                        result.push_str(&format!("<link><linkclipref>clip-{}</linkclipref><mediatype>{media}</mediatype><trackindex>{ti}</trackindex><clipindex>{ci}</clipindex>{}</link>",escape(&other.id),if *media=="audio" {"<groupindex>1</groupindex>"}else{""}));
                    }
                }
                result.push_str("</clipitem>");
            }
            result.push_str("<enabled>TRUE</enabled><locked>FALSE</locked></track>");
        }
        result.push_str(&format!("</{kind}>"));
    }
    result.push_str("</media></sequence></xmeml>\n");
    result
}
pub fn color(s: &str) -> [f64; 3] {
    let hex = s.trim_start_matches('#');
    if hex.len() != 6 && hex.len() != 8 {
        return [1.0; 3];
    }
    let bytes = hex.as_bytes();
    let mut rgb = [1.0; 3];
    for i in 0..3 {
        rgb[i] = std::str::from_utf8(&bytes[i * 2..i * 2 + 2])
            .ok()
            .and_then(|s| u8::from_str_radix(s, 16).ok())
            .unwrap_or(255) as f64
            / 255.0;
    }
    rgb
}
pub fn fcpxml(p: &Plan) -> String {
    let mut result = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE fcpxml>\n<fcpxml version=\"1.10\"><resources><format id=\"sequence-format\" frameDuration=\"{}\" width=\"{}\" height=\"{}\" colorSpace=\"1-1-1 (Rec. 709)\"/>",
        p.time(1),
        p.width,
        p.height
    );
    for s in &p.files {
        if s.width > 0 {
            result.push_str(&format!("<format id=\"format-{}\" frameDuration=\"{}\" width=\"{}\" height=\"{}\" colorSpace=\"1-1-1 (Rec. 709)\"/>",escape(&s.id),p.time(1),s.width,s.height));
        }
        result.push_str(&format!("<asset id=\"asset-{}\" name=\"{}\" start=\"0s\" duration=\"{}\"{}{}><media-rep kind=\"original-media\" src=\"{}\"/></asset>",escape(&s.id),escape(&s.name),p.time((s.duration_seconds*p.fps()).ceil() as i64),if s.width>0{format!(" hasVideo=\"1\" format=\"format-{}\" videoSources=\"1\"",escape(&s.id))}else{String::new()},if s.audio_channels>0{format!(" hasAudio=\"1\" audioSources=\"1\" audioChannels=\"{}\" audioRate=\"{}\"",s.audio_channels,s.sample_rate)}else{String::new()},escape(&s.url)));
    }
    result.push_str("<effect id=\"basic-title\" name=\"Basic Title\" uid=\".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti\"/></resources>");
    result.push_str(&format!("<library><event name=\"{}\"><project name=\"{}\"><sequence format=\"sequence-format\" duration=\"{}\" tcStart=\"0s\" tcFormat=\"NDF\" audioLayout=\"stereo\" audioRate=\"48k\"><spine><gap name=\"Moirai Cut\" offset=\"0s\" start=\"0s\" duration=\"{}\">",escape(&p.name),escape(&p.name),p.time(p.duration),p.time(p.duration)));
    for (kind, tracks) in [("video", &p.video), ("audio", &p.audio)] {
        for (ti, t) in tracks.iter().enumerate() {
            for c in &t.clips {
                let lane = if kind == "audio" {
                    -(ti as i64) - 1
                } else {
                    ti as i64 + 1
                };
                let placement = format!(
                    "name=\"{}\" lane=\"{lane}\" offset=\"{}\" start=\"{}\" duration=\"{}\" enabled=\"{}\"",
                    escape(&c.name),
                    p.time(c.start),
                    p.time(c.source_in),
                    p.time(c.end - c.start),
                    if c.enabled { 1 } else { 0 }
                );
                if kind == "audio" {
                    result.push_str(&format!("<audio ref=\"asset-{}\" {placement} role=\"dialogue\"><adjust-volume amount=\"{}dB\"/></audio>",escape(&c.source),20.0*c.gain.max(0.000001).log10()));
                } else if c.kind == "text" {
                    let rgb = color(&c.color);
                    result.push_str(&format!("<title ref=\"basic-title\" {placement} role=\"titles\"><text><text-style ref=\"style-{}\">{}</text-style></text><text-style-def id=\"style-{}\"><text-style font=\"{}\" fontSize=\"{}\" fontColor=\"{} {} {} 1\" alignment=\"center\"/></text-style-def><adjust-transform position=\"{} {}\" scale=\"{} {}\"/></title>",escape(&c.id),escape(&c.text),escape(&c.id),escape(&c.font),c.font_size*1080.0/p.height as f64,rgb[0],rgb[1],rgb[2],c.x/p.height as f64*100.0,-c.y/p.height as f64*100.0,c.scale,c.scale));
                } else {
                    result.push_str(&format!("<clip format=\"sequence-format\" {placement}><video ref=\"asset-{}\" offset=\"{}\" start=\"{}\" duration=\"{}\"><adjust-conform type=\"none\"/><adjust-transform position=\"{} {}\" scale=\"{} {}\"/></video></clip>",escape(&c.source),p.time(c.source_in),p.time(c.source_in),p.time(c.end-c.start),c.x/p.height as f64*100.0,-c.y/p.height as f64*100.0,c.scale,c.scale));
                }
            }
        }
    }
    result.push_str("</gap></spine></sequence></project></event></library></fcpxml>\n");
    result
}
