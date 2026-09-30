import argparse
import json
from pathlib import Path

import av
import numpy as np


def decode_mono(path):
    container = av.open(str(path))
    stream = next(item for item in container.streams if item.type == "audio")
    chunks = []
    for frame in container.decode(stream):
        data = frame.to_ndarray()
        if data.ndim > 1:
            data = data.mean(axis=0)
        data = data.astype(np.float32)
        if np.max(np.abs(data), initial=0) > 2:
            data /= 32768.0
        chunks.append(data)
    return np.concatenate(chunks), int(stream.rate)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--start", type=float, default=74.0)
    parser.add_argument("--duration", type=float, default=36.0)
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()
    samples, rate = decode_mono(args.audio)
    nfft = 4096
    bands = 72
    frequencies = np.fft.rfftfreq(nfft, 1 / rate)
    edges = np.geomspace(35, min(16000, rate / 2), bands + 1)
    frame_count = int(round(args.duration * args.fps))
    all_bands, lows, mids, highs, rms_values = [], [], [], [], []
    for frame_index in range(frame_count):
        center = int((args.start + frame_index / args.fps) * rate)
        begin = max(0, center - nfft // 2)
        segment = np.zeros(nfft, dtype=np.float32)
        source = samples[begin:min(len(samples), begin + nfft)]
        segment[: len(source)] = source
        spectrum = np.abs(np.fft.rfft(segment * np.hanning(nfft)))
        values = []
        for low_edge, high_edge in zip(edges[:-1], edges[1:]):
            mask = (frequencies >= low_edge) & (frequencies < high_edge)
            values.append(float(np.mean(spectrum[mask])) if np.any(mask) else 0.0)
        all_bands.append(values)
        lows.append(float(np.mean(spectrum[(frequencies >= 35) & (frequencies < 220)])))
        mids.append(float(np.mean(spectrum[(frequencies >= 220) & (frequencies < 2400)])))
        highs.append(float(np.mean(spectrum[(frequencies >= 2400) & (frequencies < 11000)])))
        rms_values.append(float(np.sqrt(np.mean(source * source))))

    def normalize(values, percentile=97):
        values = np.asarray(values, dtype=np.float32)
        return np.clip(values / max(float(np.percentile(values, percentile)), 1e-6), 0, 1)

    band_array = np.asarray(all_bands, dtype=np.float32)
    band_array = np.clip(band_array / np.maximum(np.percentile(band_array, 97, axis=0), 1e-6), 0, 1)
    low_array, mid_array, high_array, rms_array = map(normalize, (lows, mids, highs, rms_values))
    payload = {
        "start": args.start,
        "duration": args.duration,
        "fps": args.fps,
        "frameCount": frame_count,
        "sampleRate": rate,
        "frames": [
            {
                "bands": [round(float(value), 4) for value in band_array[index]],
                "low": round(float(low_array[index]), 4),
                "mid": round(float(mid_array[index]), 4),
                "high": round(float(high_array[index]), 4),
                "rms": round(float(rms_array[index]), 4),
            }
            for index in range(frame_count)
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "frames": frame_count, "start": args.start, "duration": args.duration}))


if __name__ == "__main__":
    main()
