"""Local CLAP inference; eligibility, ranking and review decisions belong to Rust."""
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
from transformers import ClapModel, ClapProcessor

parser = argparse.ArgumentParser()
parser.add_argument("manifest", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
files = ["config.json", "preprocessor_config.json", "pytorch_model.bin", "merges.txt",
         "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.json"]
options = dict(repo_id=manifest["modelId"], revision=manifest["modelRevision"], allow_patterns=files)
try:
    model_path = Path(snapshot_download(**options, local_files_only=True))
    if not all((model_path / name).is_file() for name in files):
        raise FileNotFoundError("Incomplete CLAP cache")
except (LocalEntryNotFoundError, FileNotFoundError):
    model_path = Path(snapshot_download(**options))
torch.set_num_threads(4)
model = ClapModel.from_pretrained(model_path, local_files_only=True, weights_only=True).eval()
processor = ClapProcessor.from_pretrained(model_path, local_files_only=True)
encoded = processor.tokenizer(manifest["queries"], padding=True, truncation=True, max_length=77, return_tensors="pt")
lengths = [len(processor.tokenizer(text, truncation=False)["input_ids"]) for text in manifest["queries"]]
with torch.inference_mode():
    text_vectors = model.get_text_features(**encoded).cpu().tolist()

def sha(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

records = []
rate = 48000
window = 480000
stride = 240000
for source in manifest["sounds"]:
    path = Path(source["path"])
    if sha(path) != source["sha256"]:
        raise ValueError("Sound changed before inference: " + source["id"])
    samples, original_rate = sf.read(path, dtype="float32", always_2d=True)
    if len(samples) == 0 or not np.isfinite(samples).all():
        raise ValueError("Invalid PCM")
    duration = len(samples) / original_rate
    factor = math.gcd(original_rate, rate)
    mono = resample_poly(samples.mean(axis=1), rate // factor, original_rate // factor).astype(np.float32)
    windows = []
    start = 0
    while True:
        audio = mono[start:start + window]
        # Bounded windows avoid CLAP's random truncation of long waveforms.
        features = processor.feature_extractor(audio, sampling_rate=rate, return_tensors="pt",
                                               padding="repeatpad", truncation="rand_trunc")
        with torch.inference_mode():
            vector = model.get_audio_features(**features)[0].cpu().tolist()
        windows.append({"start": start / rate, "end": min(duration, (start + len(audio)) / rate),
                        "repeated": len(audio) < window, "embedding": vector})
        if start + window >= len(mono):
            break
        start += stride
    if sha(path) != source["sha256"]:
        raise ValueError("Sound changed during inference: " + source["id"])
    records.append({"soundId": source["id"], "audioSha256": source["sha256"],
                    "durationSeconds": duration, "windows": windows})
    print(json.dumps({"completed": len(records), "total": len(manifest["sounds"])}), flush=True)

args.output.write_text(json.dumps({"modelId": manifest["modelId"], "modelRevision": manifest["modelRevision"],
    "modelSha256": sha(model_path / "pytorch_model.bin"),
    "featureConfigSha256": sha(model_path / "preprocessor_config.json"),
    "tokenizerSha256": sha(model_path / "tokenizer.json"), "engineVersion": transformers.__version__,
    "textVectors": [{"embedding": vector, "truncated": length > 77} for vector, length in zip(text_vectors, lengths)],
    "records": records}, allow_nan=False), encoding="utf-8")
