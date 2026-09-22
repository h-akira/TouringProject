"""Try several non-ffmpeg denoisers on the recordings in samples/original.

Each method writes one WAV per input into samples/py/, named
<uuid-prefix>_<method>.wav so it sits next to the ffmpeg attempts.
"""

import pathlib
import subprocess
import sys

import numpy as np
import soundfile as sf

SRC = pathlib.Path("samples/original")
OUT = pathlib.Path("samples/py")
SAMPLE_RATE = 16000


def load(path: pathlib.Path) -> np.ndarray:
    """Decode an m4a/mp4 to mono float32 at SAMPLE_RATE via ffmpeg."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path),
         "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def save(name: str, audio: np.ndarray) -> None:
    peak = np.max(np.abs(audio)) or 1.0
    sf.write(OUT / f"{name}.wav", (audio / peak * 0.9), SAMPLE_RATE)


def nr_stationary(audio: np.ndarray) -> np.ndarray:
    import noisereduce as nr
    return nr.reduce_noise(y=audio, sr=SAMPLE_RATE, stationary=True, prop_decrease=1.0)


def nr_nonstationary(audio: np.ndarray) -> np.ndarray:
    import noisereduce as nr
    return nr.reduce_noise(y=audio, sr=SAMPLE_RATE, stationary=False, prop_decrease=1.0)


def nr_gentle(audio: np.ndarray) -> np.ndarray:
    """Same as stationary but leaving some noise, in case full removal eats speech."""
    import noisereduce as nr
    return nr.reduce_noise(y=audio, sr=SAMPLE_RATE, stationary=True, prop_decrease=0.75)


def spectral_gate_first_second(audio: np.ndarray) -> np.ndarray:
    """Classic spectral subtraction using the first 0.5s as the noise profile."""
    import noisereduce as nr
    noise = audio[: SAMPLE_RATE // 2]
    return nr.reduce_noise(y=audio, sr=SAMPLE_RATE, y_noise=noise, stationary=True)


METHODS = {
    "p1_nr_stationary": nr_stationary,
    "p2_nr_nonstationary": nr_nonstationary,
    "p3_nr_gentle": nr_gentle,
    "p4_nr_profile": spectral_gate_first_second,
}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for path in sorted(SRC.glob("*.mp4")):
        prefix = path.stem[:8]
        audio = load(path)
        for name, fn in METHODS.items():
            try:
                save(f"{prefix}_{name}", fn(audio))
                print(f"ok   {prefix} {name}")
            except Exception as error:  # noqa: BLE001 - report and keep going
                print(f"FAIL {prefix} {name}: {type(error).__name__}: {error}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
