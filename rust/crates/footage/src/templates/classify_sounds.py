"""Local AudioSet inference adapter. Classification is evidence, not sound approval."""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import transformers
from huggingface_hub import snapshot_download
from huggingface_hub.errors import LocalEntryNotFoundError
from scipy.signal import resample_poly
from transformers import ASTFeatureExtractor, ASTForAudioClassification

parser = argparse.ArgumentParser()
parser.add_argument("manifest", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
download_args = dict(repo_id=manifest["modelId"], revision=manifest["modelRevision"],
                     allow_patterns=["config.json", "preprocessor_config.json", "model.safetensors"])
try:
    model_path = Path(snapshot_download(**download_args, local_files_only=True))
    if not (model_path / "model.safetensors").is_file():
        raise FileNotFoundError("Model cache incomplete")
except (LocalEntryNotFoundError, FileNotFoundError):
    model_path = Path(snapshot_download(**download_args))
torch.set_num_threads(4)
extractor = ASTFeatureExtractor.from_pretrained(model_path, local_files_only=True)
model = ASTForAudioClassification.from_pretrained(model_path, local_files_only=True, use_safetensors=True).eval()

def sha(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

records = []
rate = 16000
window_samples = 163840
stride_samples = 81920
for source in manifest["sounds"]:
    path = Path(source["path"])
    if sha(path) != source["sha256"]:
        raise ValueError("Sound changed before inference: " + source["id"])
    samples, original_rate = sf.read(path, dtype="float32", always_2d=True)
    if not np.isfinite(samples).all() or len(samples) == 0:
        raise ValueError("Invalid PCM")
    duration = len(samples) / original_rate
    mono = samples.mean(axis=1)
    factor = math.gcd(original_rate, rate)
    mono = resample_poly(mono, rate // factor, original_rate // factor).astype(np.float32)
    windows = []
    start = 0
    while True:
        audio = mono[start:start + window_samples]
        actual_length = len(audio)
        if len(audio) < 400:
            audio = np.pad(audio, (0, 400 - len(audio)))
        features = extractor(audio, sampling_rate=rate, return_tensors="pt")
        with torch.inference_mode():
            scores = model(**features).logits[0].sigmoid().cpu().tolist()
        windows.append({"start": start / rate, "end": min(duration, (start + actual_length) / rate), "scores": scores})
        if start + window_samples >= len(mono):
            break
        start += stride_samples
    if sha(path) != source["sha256"]:
        raise ValueError("Sound changed during inference: " + source["id"])
    records.append({"soundId": source["id"], "audioSha256": source["sha256"], "durationSeconds": duration, "windows": windows})
    print(json.dumps({"completed": len(records), "total": len(manifest["sounds"]), "soundId": source["id"]}), flush=True)

args.output.write_text(json.dumps({
    "modelId": manifest["modelId"], "modelRevision": manifest["modelRevision"],
    "modelSha256": sha(model_path / "model.safetensors"),
    "featureConfigSha256": sha(model_path / "preprocessor_config.json"),
    "engineVersion": transformers.__version__,
    "labels": [model.config.id2label[i] for i in range(model.config.num_labels)],
    "records": records,
}, ensure_ascii=False, allow_nan=False), encoding="utf-8")
