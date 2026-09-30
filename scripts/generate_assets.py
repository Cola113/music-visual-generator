"""用 Python 标准库合成可随仓库分发的原创演示音频与 SVG 封面。"""
from array import array
from pathlib import Path
import json
import math
import random
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
DURATION = 45
TAU = math.tau

TRACKS = [
    {
        "id": "mist-letter", "title": "雾港来信", "artist": "遥屿",
        "mood": "冷蓝 · 氛围电子", "bpm": 76, "accent": "#86d8df",
        "clip": {"start": 8, "end": 38}, "scene": "moon",
        "phrase": "让没说完的话，慢慢靠岸。",
        "lyrics": [(0, "城市还在沉睡"), (8, "把月光寄给远方"),
                   (13, "风经过安静的海"), (18, "你是雾里的一束光"),
                   (23, "那些没说完的话"), (28, "都在潮汐里回响"),
                   (33, "等夜色慢慢靠岸"), (38, "我们再说一次晚安")],
        "chords": [(45, 52, 57, 60), (41, 48, 53, 57), (48, 55, 60, 64), (43, 50, 55, 59)],
        "melody": [69, 72, 76, 72, 67, 69, 72, 64, 67, 72, 74, 72, 67, 71, 74, 67],
    },
    {
        "id": "orange-echo", "title": "橘色回声", "artist": "未眠电台",
        "mood": "暖橘 · 怀旧慢拍", "bpm": 86, "accent": "#f0b47d",
        "clip": {"start": 6, "end": 41}, "scene": "afterglow",
        "phrase": "旧日的光，也会照亮今天。",
        "lyrics": [(0, "黄昏停在窗边"), (6, "把今天折成一张旧唱片"),
                   (12, "橘色的光落在你肩上"), (17, "那条小路还没有变"),
                   (22, "我们走过缓慢的夏天"), (27, "让回声留在风里面"),
                   (32, "不必赶着抵达明天"), (37, "此刻就值得被纪念")],
        "chords": [(48, 55, 59, 64), (45, 52, 55, 60), (41, 48, 52, 57), (43, 50, 53, 59)],
        "melody": [72, 71, 67, 64, 69, 67, 64, 60, 65, 64, 60, 57, 67, 65, 62, 59],
    },
    {
        "id": "night-signal", "title": "夜航信号", "artist": "棱镜计划",
        "mood": "紫夜 · 律动合成器", "bpm": 118, "accent": "#b9a0f5",
        "clip": {"start": 12, "end": 42}, "scene": "orbit",
        "phrase": "向着亮处，继续夜航。",
        "lyrics": [(0, "夜色是一片无声的海"), (7, "城市的灯向后退"),
                   (12, "让心跳成为夜航的信号"), (17, "穿过每一段未知的黑"),
                   (22, "微小的光也能汇成星河"), (27, "不必等谁告诉你方向"),
                   (32, "把这一秒装进口袋"), (37, "带着光继续出发"), (42, "我们终会在黎明相见")],
        "chords": [(42, 49, 54, 57), (38, 45, 50, 54), (45, 52, 57, 61), (40, 47, 52, 56)],
        "melody": [66, 69, 73, 78, 62, 66, 69, 74, 69, 73, 76, 81, 64, 68, 71, 76],
    },
]


def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def synthesize(track, index):
    """原创和声、琶音与合成鼓；没有采样或第三方素材。"""
    length = RATE * DURATION
    left, right = array("f", [0.0]) * length, array("f", [0.0]) * length
    rng = random.Random(8128 + index)
    beat = 60 / track["bpm"]

    def add_tone(start, duration, note, amplitude, pan=0.0, kind="pad"):
        start_sample = max(0, int(start * RATE))
        count = min(int(duration * RATE), length - start_sample)
        if count <= 0:
            return
        hz = frequency(note)
        attack = 0.26 if kind == "pad" else 0.006
        gain_l = math.sqrt((1 - pan) / 2)
        gain_r = math.sqrt((1 + pan) / 2)
        for n in range(count):
            t = n / RATE
            phase = TAU * hz * t
            if kind == "pad":
                env = min(1.0, t / attack) * min(1.0, (duration - t) / 0.8)
                value = (math.sin(phase) + 0.22 * math.sin(phase * 2 + 0.15)
                         + 0.1 * math.sin(TAU * hz * 1.003 * t)) * env
            elif kind == "bell":
                env = min(1.0, t / attack) * math.exp(-t * 2.5)
                value = (math.sin(phase + 0.6 * math.sin(phase * 2) * math.exp(-4 * t))
                         + 0.18 * math.sin(phase * 3)) * env
            else:
                env = min(1.0, t / attack) * math.exp(-t * 5)
                value = (math.sin(phase) + 0.32 * math.sin(phase * 2)
                         + 0.12 * math.sin(phase * 4)) * env
            value *= amplitude
            pos = start_sample + n
            left[pos] += value * gain_l
            right[pos] += value * gain_r

    bar = 4 * beat
    for measure in range(math.ceil(DURATION / bar)):
        start = measure * bar
        chord = track["chords"][measure % 4]
        for voice, note in enumerate(chord):
            add_tone(start, bar + 0.7, note + 12, 0.05 if index == 2 else 0.075,
                     (voice - 1.5) * 0.3)
        for pulse in range(4 if index < 2 else 8):
            spacing = beat if index < 2 else beat / 2
            add_tone(start + pulse * spacing, spacing * 0.9, chord[0] - 12,
                     0.13 if index == 2 else 0.085, kind="pluck")
        melody = track["melody"]
        for pulse in range(4):
            offset = pulse * beat + (0.025 if index == 1 and pulse % 2 else 0)
            add_tone(start + offset, 1.9 if index == 0 else 1.0,
                     melody[(measure * 4 + pulse) % len(melody)],
                     0.10 if index == 0 else 0.095,
                     math.sin(measure + pulse) * 0.45, "bell")
        if index == 2:
            for pulse in range(8):
                add_tone(start + pulse * beat / 2, 0.3, chord[pulse % 4] + 24,
                         0.044, math.sin(pulse) * 0.6, "pluck")

    # 全部鼓声都是正弦扫频和确定性噪声的代码合成。
    for pulse in range(math.ceil(DURATION / beat)):
        start = int(pulse * beat * RATE)
        for n in range(min(int(0.22 * RATE), length - start)):
            t = n / RATE
            kick = math.sin(TAU * (48 * t + 8 * (1 - math.exp(-30 * t)))) * math.exp(-18 * t)
            value = kick * (0.19 if index == 2 else 0.075 if index == 1 else 0.04)
            left[start + n] += value
            right[start + n] += value
        if pulse % 2:
            for n in range(min(int(0.13 * RATE), length - start)):
                t = n / RATE
                noise = rng.uniform(-1, 1) * math.exp(-35 * t)
                value = noise * (0.064 if index == 2 else 0.033 if index == 1 else 0.012)
                left[start + n] += value * 0.85
                right[start + n] += value
        hat_start = start + int(beat * RATE / 2)
        for n in range(max(0, min(int(0.045 * RATE), length - hat_start))):
            t = n / RATE
            value = rng.uniform(-1, 1) * math.exp(-95 * t) * (0.025 if index == 2 else 0.008)
            left[hat_start + n] += value * 0.8
            right[hat_start + n] += value

    # 短延迟增加立体声空间；渐入渐出；软限幅保留动态。
    delay = int(RATE * (0.31 if index == 0 else 0.22))
    pcm = array("h")
    for i in range(length):
        t = i / RATE
        fade = min(1, t / 0.45, (DURATION - t) / 1.5)
        echo_l = right[i - delay] * 0.16 if i >= delay else 0
        echo_r = left[i - delay] * 0.16 if i >= delay else 0
        pcm.append(round(math.tanh((left[i] + echo_l) * 1.5) * fade * 28500))
        pcm.append(round(math.tanh((right[i] + echo_r) * 1.5) * fade * 28500))
    if sys.byteorder != "little":
        pcm.byteswap()
    destination = ROOT / "assets" / "audio" / f'{track["id"]}.wav'
    with wave.open(str(destination), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    print(f"已合成 {destination.name}: 45 秒 / 44.1 kHz / 立体声", flush=True)


def draw_cover(track, index):
    palettes = [("#081b26", "#357487", "#bfdede"),
                ("#351f22", "#b36945", "#f3c89a"),
                ("#17142d", "#61518d", "#e2c0fc")]
    dark, middle, light = palettes[index]
    rng = random.Random(42 + index)
    stars = "".join(f'<circle cx="{rng.randrange(35, 765)}" cy="{rng.randrange(35, 710)}" '
                    f'r="{rng.choice([0.8, 1.2, 1.8])}" fill="{light}" opacity="{rng.uniform(.15, .6):.2f}"/>'
                    for _ in range(65))
    if index == 0:
        artwork = f'<circle cx="490" cy="280" r="178" fill="{light}" opacity=".85"/>' \
                  f'<circle cx="415" cy="225" r="175" fill="{dark}"/>' \
                  f'<path d="M0 520 Q160 380 340 550 T800 500 V800 H0Z" fill="{middle}" opacity=".5"/>' \
                  f'<path d="M0 620 Q230 490 430 630 T800 570 V800 H0Z" fill="{dark}" opacity=".8"/>'
    elif index == 1:
        artwork = f'<circle cx="400" cy="365" r="205" fill="{light}" opacity=".9"/>' \
                  f'<path d="M0 480 Q240 390 460 530 T800 460 V800 H0Z" fill="{middle}"/>' \
                  f'<path d="M0 575 Q220 490 430 610 T800 565 V800 H0Z" fill="{dark}" opacity=".75"/>' \
                  f'<path d="M270 695 L380 502 L408 505 L334 695Z" fill="{light}" opacity=".16"/>'
    else:
        artwork = f'<circle cx="400" cy="365" r="225" fill="none" stroke="{light}" stroke-width="2" opacity=".55"/>' \
                  f'<circle cx="400" cy="365" r="167" fill="none" stroke="{light}" stroke-width="1" opacity=".25"/>' \
                  f'<ellipse cx="400" cy="365" rx="300" ry="85" transform="rotate(-28 400 365)" fill="none" stroke="{light}" stroke-width="3" opacity=".7"/>' \
                  f'<circle cx="400" cy="365" r="80" fill="{middle}"/>' \
                  f'<circle cx="644" cy="237" r="13" fill="{light}"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="{track['title']}，代码自绘封面">
<defs><radialGradient id="sky"><stop stop-color="{middle}"/><stop offset="1" stop-color="{dark}"/></radialGradient>
<filter id="grain"><feTurbulence baseFrequency=".7" numOctaves="3" seed="{index + 7}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".15"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs>
<rect width="800" height="800" fill="url(#sky)"/>{stars}{artwork}
<rect width="800" height="800" fill="transparent" filter="url(#grain)"/>
<path d="M50 52 H90 M50 52 V92 M750 52 H710 M750 52 V92 M50 748 H90 M50 748 V708 M750 748 H710 M750 748 V708" stroke="{light}" opacity=".4" fill="none"/>
<text x="58" y="105" fill="{light}" font-family="sans-serif" font-size="15" letter-spacing="5">{['MIST / 01', 'ECHO / 02', 'SIGNAL / 03'][index]}</text>
<text x="58" y="706" fill="{light}" font-family="sans-serif" font-size="30" letter-spacing="8">{track['title']}</text>
</svg>'''
    (ROOT / "assets" / "covers" / f'{track["id"]}.svg').write_text(svg, encoding="utf-8")


def main():
    for folder in ("assets/audio", "assets/covers", "assets/lyrics", "js"):
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    demos = []
    for index, track in enumerate(TRACKS):
        synthesize(track, index)
        draw_cover(track, index)
        lyrics = [{"time": time, "text": text} for time, text in track["lyrics"]]
        lrc = "\n".join(f"[{time // 60:02d}:{time % 60:02d}.00]{text}" for time, text in track["lyrics"])
        (ROOT / "assets" / "lyrics" / f'{track["id"]}.lrc').write_text(lrc + "\n", encoding="utf-8")
        demos.append({"id": track["id"], "title": track["title"], "artist": track["artist"],
                      "audioUrl": f'assets/audio/{track["id"]}.wav',
                      "coverUrl": f'assets/covers/{track["id"]}.svg',
                      "duration": DURATION, "clip": track["clip"], "lyrics": lyrics,
                      "visual": {"scene": track["scene"], "accentColor": track["accent"],
                                 "intensity": {"particles": .42, "halo": .62, "grain": .17}},
                      "mood": track["mood"], "phrase": track["phrase"], "bpm": track["bpm"],
                      "isDemo": True})
    (ROOT / "js" / "demo-tracks.js").write_text(
        "// Python 标准库自生成；音频、封面和文案可随仓库分发。\nexport const DEMO_TRACKS = "
        + json.dumps(demos, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    main()
