"""Local embedding inference only; retrieval and compatibility decisions live in Rust."""
import argparse
import hashlib
import json
from pathlib import Path

import torch
import transformers
from huggingface_hub import snapshot_download
from huggingface_hub.errors import LocalEntryNotFoundError
from transformers import AutoModel, AutoTokenizer

parser = argparse.ArgumentParser()
parser.add_argument("manifest", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
data = json.loads(args.manifest.read_text())
options = dict(repo_id=data["modelId"], revision=data["modelRevision"], allow_patterns=[
    "config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json",
    "special_tokens_map.json", "sentencepiece.bpe.model"])
try:
    model_path = Path(snapshot_download(**options, local_files_only=True))
    if not (model_path / "model.safetensors").is_file():
        raise FileNotFoundError("Incomplete model cache")
except (LocalEntryNotFoundError, FileNotFoundError):
    model_path = Path(snapshot_download(**options))
torch.set_num_threads(4)
tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
model = AutoModel.from_pretrained(model_path, local_files_only=True, use_safetensors=True).eval()
vectors = []
for start in range(0, len(data["texts"]), 8):
    texts = data["texts"][start:start + 8]
    encoded = tokenizer(texts, max_length=512, padding=True, truncation=True, return_tensors="pt")
    original_lengths = [len(tokenizer(text, truncation=False)["input_ids"]) for text in texts]
    with torch.inference_mode():
        hidden = model(**encoded).last_hidden_state
        mask = encoded["attention_mask"].unsqueeze(-1)
        mean = (hidden * mask).sum(dim=1) / mask.sum(dim=1)
        embeddings = torch.nn.functional.normalize(mean, p=2, dim=1).cpu().tolist()
    vectors.extend({"embedding": vector, "truncated": length > 512} for vector, length in zip(embeddings, original_lengths))

def sha(name):
    with (model_path / name).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

args.output.write_text(json.dumps({"modelId": data["modelId"], "modelRevision": data["modelRevision"],
    "modelSha256": sha("model.safetensors"), "tokenizerSha256": sha("tokenizer.json"),
    "engineVersion": transformers.__version__, "vectors": vectors}, allow_nan=False), encoding="utf-8")
