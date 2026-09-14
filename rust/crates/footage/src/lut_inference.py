"""Image-Adaptive-3DLUT sRGB classifier inference only; orchestration is in Rust.

Classifier architecture adapted from HuiZeng/Image-Adaptive-3DLUT models.py
(Apache-2.0), commit b491f6df64a588864739a157db271e5c848e1805.
No custom CUDA extension is needed to predict the three basis weights.
"""

import json
import sys
from pathlib import Path

import numpy as np
import torch
from torch import nn


class Classifier(nn.Module):
    def __init__(self):
        super().__init__()
        layers = [nn.Upsample(size=(256, 256), mode="bilinear", align_corners=False)]
        for index, (cin, cout) in enumerate([(3, 16), (16, 32), (32, 64), (64, 128), (128, 128)]):
            layers += [nn.Conv2d(cin, cout, 3, stride=2, padding=1), nn.LeakyReLU(0.2)]
            if index < 4:
                layers.append(nn.InstanceNorm2d(cout, affine=True))
        layers += [nn.Dropout(p=0.5), nn.Conv2d(128, 3, 8, padding=0)]
        self.model = nn.Sequential(*layers)

    def forward(self, image):
        return self.model(image)


def main():
    model_dir, frames = Path(sys.argv[1]), sys.argv[2:]
    torch.set_num_threads(2)
    classifier = Classifier().eval()
    classifier.load_state_dict(torch.load(model_dir / "classifier.pth", map_location="cpu", weights_only=True))
    basis = torch.load(model_dir / "LUTs.pth", map_location="cpu", weights_only=True)
    predictions = []
    with torch.inference_mode():
        for frame in frames:
            pixels = np.fromfile(frame, dtype=np.uint8).reshape(256, 256, 3).copy()
            image = torch.from_numpy(pixels).permute(2, 0, 1).float().unsqueeze(0) / 255.0
            predictions.append(classifier(image).reshape(3))
        weights = torch.stack(predictions).mean(dim=0)
        lut = sum(weights[i] * basis[str(i)]["LUT"] for i in range(3))
        if list(lut.shape) != [3, 33, 33, 33] or not torch.isfinite(lut).all():
            raise ValueError("Invalid model LUT")
        # Channel-first [RGB, blue, green, red] -> interleaved red-fastest cube.
        values = lut.permute(1, 2, 3, 0).contiguous().reshape(-1).tolist()
        print(json.dumps({"size": 33, "values": values}, allow_nan=False))


if __name__ == "__main__":
    main()
