"""Run neural speech-enhancement models over samples/original.

Separate from try_denoise.py because these pull large pretrained weights and
run far slower than the spectral methods there.
"""

import pathlib
import subprocess
import sys

import numpy as np
import soundfile as sf
import torch

SRC = pathlib.Path("samples/original")
OUT = pathlib.Path("samples/neural")
# The pretrained models are trained at 16 kHz, which is also what the app records.
SAMPLE_RATE = 16000


def load(path: pathlib.Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path),
         "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def save(name: str, audio: np.ndarray) -> None:
    peak = np.max(np.abs(audio)) or 1.0
    sf.write(OUT / f"{name}.wav", audio / peak * 0.9, SAMPLE_RATE)


def run_denoiser(model_name: str):
    """facebookresearch/denoiser (DEMUCS in the waveform domain)."""
    from denoiser import pretrained

    model = getattr(pretrained, model_name)().eval()

    def apply(audio: np.ndarray) -> np.ndarray:
        with torch.no_grad():
            tensor = torch.from_numpy(audio)[None, None]
            return model(tensor)[0, 0].numpy()

    return apply


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    methods = {}
    for label, name in [("n1_dns64", "dns64"), ("n2_dns48", "dns48"),
                        ("n3_master64", "master64")]:
        try:
            methods[label] = run_denoiser(name)
            print(f"loaded {label}")
        except Exception as error:  # noqa: BLE001 - report and try the rest
            print(f"FAIL load {label}: {type(error).__name__}: {error}")

    for path in sorted(SRC.glob("*.mp4")):
        prefix = path.stem[:8]
        audio = load(path)
        for label, fn in methods.items():
            try:
                save(f"{prefix}_{label}", fn(audio))
                print(f"ok   {prefix} {label}")
            except Exception as error:  # noqa: BLE001
                print(f"FAIL {prefix} {label}: {type(error).__name__}: {error}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
