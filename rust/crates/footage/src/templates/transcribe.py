"""Inference adapter: return model word timing without inventing or repairing timestamps."""
import argparse
import json
import hashlib
from pathlib import Path
import faster_whisper
from faster_whisper import WhisperModel
from faster_whisper.utils import download_model
from huggingface_hub.errors import LocalEntryNotFoundError

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("model")
args = parser.parse_args()
if Path(args.model).is_dir():
    model_path = args.model
else:
    try:
        model_path = download_model(args.model, local_files_only=True)
    except LocalEntryNotFoundError:
        model_path = download_model(args.model)
model = WhisperModel(model_path, device="cpu", compute_type="int8", cpu_threads=4)
with (Path(model_path) / "model.bin").open("rb") as weights:
    model_sha256 = hashlib.file_digest(weights, "sha256").hexdigest()
segments, info = model.transcribe(
    str(args.source), beam_size=5, word_timestamps=True,
    vad_filter=True, condition_on_previous_text=False,
)
words = []
segment_records = []
for segment in segments:
    segment_records.append({
        "start": segment.start, "end": segment.end, "text": segment.text,
        "noSpeechProbability": segment.no_speech_prob,
        "averageLogProbability": segment.avg_logprob,
    })
    for word in segment.words or []:
        words.append({
            "text": word.word, "start": word.start, "end": word.end,
            "probability": word.probability,
        })
args.output.write_text(json.dumps({
    "modelSha256": model_sha256, "engineVersion": faster_whisper.__version__,
    "language": info.language, "languageProbability": info.language_probability,
    "words": words, "segments": segment_records,
}, ensure_ascii=False, allow_nan=False), encoding="utf-8")
