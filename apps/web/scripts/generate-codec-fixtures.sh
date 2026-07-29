#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-/tmp/opencut-codec-fixtures}"
duration_seconds="${OPENCUT_FIXTURE_DURATION_SECONDS:-4}"
ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"
ffprobe_bin="${FFPROBE_BIN:-ffprobe}"

mkdir -p "$output_dir"

video_source="testsrc2=size=640x360:rate=30:duration=${duration_seconds}"
audio_source="sine=frequency=1000:sample_rate=48000:duration=${duration_seconds}"

encode_av() {
	local output="$1"
	shift
	"$ffmpeg_bin" -hide_banner -loglevel error -y \
		-f lavfi -i "$video_source" \
		-f lavfi -i "$audio_source" \
		-shortest "$@" "$output"
}

encode_av "$output_dir/h264-aac.mp4" \
	-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -g 30 \
	-c:a aac -b:a 160k -movflags +faststart

encode_av "$output_dir/hevc-main-aac.mp4" \
	-c:v libx265 -preset ultrafast -crf 22 -pix_fmt yuv420p \
	-x265-params log-level=error -tag:v hvc1 \
	-c:a aac -b:a 160k -movflags +faststart

encode_av "$output_dir/hevc-main10-aac.mp4" \
	-c:v libx265 -preset ultrafast -crf 22 -pix_fmt yuv420p10le \
	-x265-params log-level=error -tag:v hvc1 \
	-c:a aac -b:a 160k -movflags +faststart

encode_av "$output_dir/hevc-main10-pq-aac.mp4" \
	-c:v libx265 -preset ultrafast -crf 22 -pix_fmt yuv420p10le \
	-x265-params log-level=error -tag:v hvc1 \
	-color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc \
	-color_range tv -c:a aac -b:a 160k -movflags +faststart

encode_av "$output_dir/hevc-main10-hlg-aac.mp4" \
	-c:v libx265 -preset ultrafast -crf 22 -pix_fmt yuv420p10le \
	-x265-params log-level=error -tag:v hvc1 \
	-color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
	-color_range tv -c:a aac -b:a 160k -movflags +faststart

encode_av "$output_dir/vp9-opus.webm" \
	-c:v libvpx-vp9 -deadline realtime -cpu-used 8 -crf 30 -b:v 0 -g 30 \
	-c:a libopus -b:a 160k

encode_av "$output_dir/av1-opus.webm" \
	-c:v libaom-av1 -cpu-used 8 -crf 34 -b:v 0 -g 30 -row-mt 1 \
	-c:a libopus -b:a 160k

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-i "$output_dir/h264-aac.mp4" -c copy \
	-movflags +faststart "$output_dir/h264-aac.mov"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-i "$output_dir/hevc-main10-aac.mp4" -c copy -tag:v hvc1 \
	-movflags +faststart "$output_dir/hevc-main10-aac.mov"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "testsrc2=size=640x360:rate=60:duration=${duration_seconds}" \
	-f lavfi -i "$audio_source" \
	-vf "select='if(lt(t,2),not(mod(n,2)),1)'" \
	-fps_mode vfr -shortest \
	-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
	-c:a aac -b:a 160k -movflags +faststart \
	"$output_dir/h264-vfr-aac.mp4"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-i "$output_dir/h264-aac.mp4" -map 0:v:0 -c copy \
	-metadata:s:v:0 rotate=90 "$output_dir/h264-rotated.mov"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "$audio_source" -c:a pcm_s24le "$output_dir/pcm24.wav"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "$audio_source" -c:a aac -b:a 160k "$output_dir/aac.m4a"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "$audio_source" -c:a libmp3lame -q:a 2 "$output_dir/audio.mp3"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "$audio_source" -c:a flac "$output_dir/audio.flac"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "$audio_source" -c:a libopus -b:a 160k "$output_dir/opus.ogg"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "$video_source" \
	-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
	-an -movflags +faststart "$output_dir/video-only.mp4"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
	-f lavfi -i "color=color=white:size=640x360:rate=30:duration=${duration_seconds}" \
	-f lavfi -i "$audio_source" \
	-shortest -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
	-c:a aac -b:a 160k -movflags +faststart "$output_dir/white-sync-reference.mp4"

dd if="$output_dir/h264-aac.mp4" of="$output_dir/corrupt.mp4" \
	bs=1024 count=1 status=none

"$ffprobe_bin" -v error -show_format -show_streams -of json \
	"$output_dir/h264-aac.mp4" > "$output_dir/reference-ffprobe.json"

printf 'Generated codec fixtures in %s\n' "$output_dir"
