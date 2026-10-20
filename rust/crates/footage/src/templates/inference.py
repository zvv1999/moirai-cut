"""Local ML adapter. Catalog, candidate selection and review policy are owned by Rust."""
import argparse
from pathlib import Path

import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model


def separate(source: Path, output: Path) -> None:
    model = get_model("htdemucs")
    model.eval()
    data, rate = sf.read(source, dtype="float32", always_2d=True)
    if rate != model.samplerate or data.shape[1] != model.audio_channels:
        raise ValueError("Rust must supply 44100 Hz stereo input")
    waveform = torch.from_numpy(data.T.copy())
    reference = waveform.mean(0)
    mean, std = reference.mean(), reference.std()
    if not torch.isfinite(std) or std < 1e-8:
        raise ValueError("Input is silent or invalid")
    torch.manual_seed(0)
    torch.set_num_threads(4)
    with torch.no_grad():
        stems = apply_model(
            model, ((waveform - mean) / std)[None],
            device="cpu", shifts=1, split=True, overlap=0.25, progress=False,
        )[0] * std + mean
    output.mkdir(parents=True, exist_ok=True)
    for name, stem in zip(model.sources, stems):
        # Float WAV preserves model overshoot; playback normalization belongs downstream.
        sf.write(output / f"{name}.wav", stem.cpu().numpy().T, rate, subtype="FLOAT")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    separate(args.source, args.output)
