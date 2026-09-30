import { lyricIndexAt } from './lyrics.js';

const KEYWORDS = ['月光', '一束光', '星河', '心跳', '回声', '夏天', '黎明', '夜航', '此刻', '远方', '晚安', '出发', '明天'];

export function readableAccent(hex) {
  let channels = hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
  const luminance = () => channels.map(value => {
    const normalized = value / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
  // 保留主题色相，同时给暗背景上的关键词设置亮度下限。
  for (let step = 0; step < 30 && luminance() < .38; step++)
    channels = channels.map(value => value + (255 - value) * .08);
  return `#${channels.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

export class VisualEngine {
  constructor(stage, fit, audio, onFrame) {
    this.stage = stage;
    this.fit = fit;
    this.scene = stage.querySelector('.stage-scene');
    this.audio = audio;
    this.onFrame = onFrame;
    this.track = null;
    this.canvas = document.querySelector('#particle-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.grain = document.querySelector('#grain-canvas');
    this.grainCtx = this.grain.getContext('2d');
    this.measure = document.createElement('canvas').getContext('2d');
    this.level = { low: .06, mid: .03, high: .02, vocal: .1 };
    this.rotation = 0;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? .35 : 1;
    this.last = 0;
    this.lastGrain = 0;
    this.lastUI = 0;
    this.lastLyric = '';
    this.lastMain = '';
    this.spectrum = new Float32Array(72);
    this.particles = Array.from({ length: 88 }, (_, i) => ({
      x: ((i * 713 + 331) % 1080), y: ((i * 197 + 127) % 1920),
      radius: 1.1 + (i % 5) * .45, speed: 1.2 + (i % 9) * .6,
      phase: i * 1.67, opacity: .1 + (i % 8) * .028,
    }));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(fit);
    this.makeGrain();
    this.resize();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resize() {
    const bounds = this.fit.getBoundingClientRect();
    const scale = Math.max(0, Math.min(bounds.width / 1080, bounds.height / 1920));
    this.stage.style.width = `${1080 * scale}px`;
    this.stage.style.height = `${1920 * scale}px`;
    this.scene.style.transform = `scale(${scale})`;
  }

  setTrack(track, edition) {
    this.track = track;
    this.lastLyric = '';
    document.querySelector('#stage-title').textContent = track.title;
    document.querySelector('#stage-artist').textContent = track.artist;
    this.setCover(track.coverUrl);
    this.setVisual(track.visual);
    this.updateLyrics(this.audio.currentTime);
  }

  setCover(url) {
    const fallback = 'assets/covers/mist-letter.svg';
    document.querySelector('#vinyl-cover').src = url || fallback;
    this.scene.querySelector('.cover-backdrop').style.backgroundImage = `url("${url || fallback}")`;
  }

  setVisual(visual) {
    this.stage.dataset.scene = visual.scene;
    this.scene.style.setProperty('--accent', visual.accentColor);
    this.scene.style.setProperty('--lyric-accent', readableAccent(visual.accentColor));
    this.scene.style.setProperty('--halo', visual.intensity.halo);
    this.scene.style.setProperty('--grain', visual.intensity.grain);
    this.lastLyric = '';
    this.updateLyrics(this.audio.currentTime);
  }

  fitLine(element, text, size, emphasize = false) {
    element.replaceChildren();
    let keyword = emphasize ? KEYWORDS.find(word => text.includes(word)) : null;
    if (keyword) {
      const position = text.indexOf(keyword);
      element.append(document.createTextNode(text.slice(0, position)));
      const span = document.createElement('span');
      span.className = 'keyword';
      span.textContent = keyword;
      element.append(span, document.createTextNode(text.slice(position + keyword.length)));
    } else element.textContent = text;
    this.measure.font = `${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    const width = this.measure.measureText(text).width * (keyword ? 1.035 : 1);
    element.style.fontSize = `${Math.min(size, size * 840 / Math.max(1, width))}px`;
  }

  updateLyrics(time) {
    if (!this.track) return;
    const lyrics = this.track.lyrics;
    const index = lyricIndexAt(lyrics, time);
    let main, secondary, position;
    if (!lyrics.length) {
      main = this.track.title;
      secondary = this.track.phrase || '让这一刻，在光里停留。';
      position = '一段声音 · 一种情绪';
    } else if (index < 0) {
      main = this.track.title;
      secondary = lyrics[0]?.text || '';
      position = '故事将要开始';
    } else {
      main = lyrics[index].text;
      // 两行上限：切句时保留上一句的残影，随后预告下一句。
      const previous = index > 0 && time - lyrics[index].time < 1.3;
      secondary = (previous ? lyrics[index - 1] : lyrics[index + 1])?.text || '';
      position = `此刻 · ${lyrics[index].time.toFixed(1)}″`;
    }
    const key = `${this.track.id}:${index}:${main}:${secondary}:${this.track.visual.scene}`;
    if (key === this.lastLyric) return;
    this.lastLyric = key;
    const container = document.querySelector('#lyric-display');
    this.fitLine(document.querySelector('#lyric-main'), main, this.track.visual.scene === 'orbit' ? 66 : 48, true);
    this.fitLine(document.querySelector('#lyric-secondary'), secondary, this.track.visual.scene === 'orbit' ? 32 : 30);
    container.dataset.lyricIndex = index;
    container.classList.toggle('no-lyrics', !lyrics.length);
    const mainChanged = main !== this.lastMain;
    this.lastMain = main;
    container.classList.remove('change', 'secondary-change');
    void container.offsetWidth;
    container.classList.add(mainChanged ? 'change' : 'secondary-change');
  }

  makeGrain() {
    const image = this.grainCtx.createImageData(270, 480);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 90 + Math.random() * 165;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 140;
    }
    this.grainCtx.putImageData(image, 0, 0);
  }

  updateSpectrum(playing, delta) {
    const source = playing ? this.audio.frequencies : null;
    const smoothing = 1 - Math.exp(-delta * (playing ? 14 : 2.2));
    for (let i = 0; i < this.spectrum.length; i++) {
      let target = 0;
      if (source?.length) {
        // Logarithmic sampling makes the lower musical bands visible without losing treble movement.
        const start = Math.floor(Math.pow(i / this.spectrum.length, 1.55) * source.length * .72);
        const end = Math.min(source.length, start + 3 + Math.floor(i / 18));
        for (let n = start; n < end; n++) target = Math.max(target, source[n] / 255);
        target = Math.pow(target, .72);
      }
      this.spectrum[i] += (target - this.spectrum[i]) * smoothing;
    }
  }

  drawReactiveHalo(time) {
    if (!this.track) return;
    const scene = this.track.visual.scene;
    const centerX = 540;
    const centerY = scene === 'orbit' ? 654 : 770;
    const radius = scene === 'orbit' ? 334 : 374;
    const accent = this.track.visual.accentColor;
    const intensity = this.track.visual.intensity.halo;
    const count = this.spectrum.length;
    const ctx = this.ctx;
    const lowPulse = this.level.low * (24 + intensity * 24);
    const wavePoints = (offset, scale, phase) => Array.from({ length: count }, (_, i) => {
      const angle = i / count * Math.PI * 2 + phase;
      const left = this.spectrum[(i + count - 2) % count];
      const current = this.spectrum[i];
      const right = this.spectrum[(i + 2) % count];
      const energy = (left + current * 2 + right) / 4;
      const ripple = Math.sin(angle * 3 + time * .18) * (3.5 + this.level.mid * 4)
        + Math.cos(angle * 6 - time * .12) * (1.2 + this.level.high * 2);
      const distance = radius + offset + lowPulse + energy * (30 + intensity * 34) * scale + ripple;
      return [centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance];
    });
    const drawWave = (offset, scale, phase, alpha, width, blur) => {
      const points = wavePoints(offset, scale, phase);
      ctx.beginPath();
      ctx.moveTo((points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2);
      for (let i = 0; i < count; i++) {
        const point = points[i];
        const next = points[(i + 1) % count];
        const midpointX = (point[0] + next[0]) / 2;
        const midpointY = (point[1] + next[1]) / 2;
        ctx.quadraticCurveTo(point[0], point[1], midpointX, midpointY);
      }
      ctx.closePath();
      ctx.strokeStyle = accent;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha * (.55 + intensity * .45);
      ctx.shadowColor = accent;
      ctx.shadowBlur = blur;
      ctx.stroke();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawWave(0, 1, time * .012, .42, 2.7, 22);
    drawWave(7, .45, -time * .009, .1, 1.15, 10);
    ctx.restore();
  }

  drawParticles(time, delta) {
    if (!this.track) return;
    const intensity = this.track.visual.intensity.particles;
    const scene = this.track.visual.scene;
    const slow = scene === 'afterglow' ? .35 : 1;
    const count = Math.round(12 + intensity * 68);
    this.ctx.clearRect(0, 0, 1080, 1920);
    this.drawReactiveHalo(time);
    this.ctx.fillStyle = this.track.visual.accentColor;
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      p.y -= delta * p.speed * (1 + this.level.mid * 9) * slow * this.motion;
      if (p.y < 80) p.y = 1880;
      const spread = Math.sin(time * .035 + p.phase) * (14 + this.level.mid * 48);
      const x = p.x + spread;
      const fade = Math.min(1, p.y / 170, (1920 - p.y) / 180);
      this.ctx.globalAlpha = p.opacity * fade * (.3 + intensity * .7) * (1 + this.level.high * .6);
      this.ctx.beginPath();
      this.ctx.arc(x, p.y, p.radius * (1 + this.level.high * 1.4), 0, Math.PI * 2);
      this.ctx.fill();
      if (scene === 'orbit' && i % 7 === 0) {
        this.ctx.strokeStyle = this.track.visual.accentColor;
        this.ctx.globalAlpha *= .45;
        this.ctx.lineWidth = .8;
        this.ctx.beginPath();
        this.ctx.moveTo(x - 13, p.y);
        this.ctx.lineTo(x + 13, p.y);
        this.ctx.stroke();
      }
    }
    if (scene === 'orbit') {
      this.ctx.strokeStyle = this.track.visual.accentColor;
      this.ctx.lineWidth = 1;
      this.ctx.globalAlpha = .07 + this.level.high * .07;
      this.ctx.beginPath();
      this.ctx.ellipse(540, 771, 465, 170, -.4 + Math.sin(time * .015) * .035, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.globalAlpha = 1;
  }

  animate(now) {
    const delta = Math.min(.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const time = now / 1000;
    const playing = this.audio.playing;
    const targets = playing ? this.audio.levels() : {
      low: .065 + Math.sin(time * .5) * .025, mid: .025, high: .025, vocal: .12,
    };
    const smoothing = 1 - Math.exp(-delta * (playing ? 5 : 1.7));
    for (const band of Object.keys(this.level)) {
      this.level[band] += (targets[band] - this.level[band]) * smoothing;
      this.scene.style.setProperty(`--${band}`, this.level[band].toFixed(4));
    }
    const restrained = this.track?.visual.scene === 'afterglow';
    const breath = 1 + this.level.low * (restrained ? .014 : .035) * (this.track?.visual.intensity.halo ?? .6);
    this.scene.style.setProperty('--breath', breath.toFixed(4));
    this.scene.style.setProperty('--record-scale', (1 + this.level.low * (restrained ? .008 : .02)).toFixed(4));
    this.scene.style.setProperty('--energy', (this.level.low * .7 + this.level.mid * .3).toFixed(4));
    this.scene.classList.toggle('is-playing', playing);
    this.updateSpectrum(playing, delta);
    this.rotation = (this.rotation + delta * (playing ? restrained ? 3.2 : 5.8 + this.level.low * 4.5 : .32) * this.motion) % 360;
    this.scene.style.setProperty('--rotation', `${this.rotation.toFixed(3)}deg`);
    this.scene.style.setProperty('--meter', (1 + this.level.mid * 2).toFixed(3));
    this.scene.querySelector('.fog-one').style.transform = `translate(${Math.sin(time * .018) * 48}px, ${Math.cos(time * .014) * 36}px) rotate(-25deg)`;
    this.drawParticles(time, delta);
    if (now - this.lastGrain > 180 && (this.track?.visual.intensity.grain ?? 0) > .005) {
      this.makeGrain();
      this.lastGrain = now;
    }
    if (now - this.lastUI > 90) {
      this.updateLyrics(this.audio.currentTime);
      this.onFrame?.(this.audio.currentTime, playing);
      this.lastUI = now;
    }
    requestAnimationFrame(this.animate);
  }
}
