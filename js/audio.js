export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.context = null;
    this.analyser = null;
    this.gain = null;
    this.source = null;
    this.buffer = null;
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.clip = { start: 0, end: 45 };
    this.volume = .7;
    this.loadVersion = 0;
    this.playVersion = 0;
    this.abort = null;
    this.frequencies = null;
    this.peaks = [];
  }

  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  ensureContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('此浏览器不支持 Web Audio，请使用新版 Chrome 或 Edge。');
      this.context = new AudioContextClass();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = .78;
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.analyser.connect(this.gain);
      this.gain.connect(this.context.destination);
      this.frequencies = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return this.context;
  }

  async load(url, clip) {
    const version = ++this.loadVersion;
    this.pause();
    if (this.abort) this.abort.abort();
    this.abort = new AbortController();
    this.buffer = null;
    this.peaks = [];
    this.clip = { ...clip };
    this.offset = clip.start;
    this.emit('loading');
    try {
      if (!url) throw new Error('音频文件已丢失，请重新导入本地音频。');
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error(`音频请求失败（${response.status}），请确认本地 HTTP 服务与素材文件。`);
      const bytes = await response.arrayBuffer();
      if (version !== this.loadVersion) return;
      const context = this.ensureContext();
      const buffer = await context.decodeAudioData(bytes);
      if (version !== this.loadVersion) return;
      this.buffer = buffer;
      const data = buffer.getChannelData(0);
      const stride = Math.max(1, Math.floor(data.length / 132));
      this.peaks = Array.from({ length: 132 }, (_, i) => {
        let peak = 0;
        const last = Math.min(data.length, (i + 1) * stride);
        for (let n = i * stride; n < last; n += 23) peak = Math.max(peak, Math.abs(data[n]));
        return peak;
      });
      this.emit('ready', { duration: buffer.duration, peaks: this.peaks });
    } catch (error) {
      if (version !== this.loadVersion || error.name === 'AbortError') return;
      const message = error.message.includes('decode') || error.name === 'EncodingError'
        ? '音频无法解码，格式可能不受支持或文件损坏。请尝试 WAV、MP3 或其他浏览器支持的音频。'
        : error.name === 'TypeError' ? '音频无法获取，请确认文件和本地 HTTP 服务，或重新导入音频。'
        : error.message || '音频加载失败，请确认通过本地 HTTP 服务打开页面。';
      this.emit('error', { message });
    }
  }

  get duration() { return this.buffer?.duration || 0; }
  get currentTime() {
    if (!this.playing || !this.context) return this.offset;
    return Math.min(this.clip.end, this.offset + this.context.currentTime - this.startedAt);
  }

  disconnectSource() {
    if (!this.source) return;
    this.source.onended = null;
    try { this.source.stop(); } catch { /* 已结束的音源无需再次停止。 */ }
    this.source.disconnect();
    this.source = null;
  }

  pause() {
    ++this.playVersion;
    this.offset = this.currentTime;
    this.playing = false;
    this.disconnectSource();
    this.emit('state', { playing: false });
  }

  async play(fromStart = false) {
    if (!this.buffer) return false;
    if (this.playing && !fromStart) return true;
    if (this.playing) this.pause();
    const request = ++this.playVersion;
    const loadVersion = this.loadVersion;
    try {
      const context = this.ensureContext();
      await context.resume();
      if (request !== this.playVersion || loadVersion !== this.loadVersion || !this.buffer) return false;
      if (context.state !== 'running') throw new Error('浏览器尚未允许播放，请再次点击播放按钮。');
      if (fromStart || this.offset >= this.clip.end - .025) this.offset = this.clip.start;
      this.offset = Math.max(this.clip.start, Math.min(this.clip.end, this.offset));
      const source = context.createBufferSource();
      source.buffer = this.buffer;
      source.connect(this.analyser);
      this.source = source;
      this.startedAt = context.currentTime;
      this.playing = true;
      source.onended = () => {
        if (this.source !== source) return;
        this.offset = this.clip.end;
        this.playing = false;
        source.disconnect();
        this.source = null;
        this.emit('state', { playing: false, ended: true });
      };
      source.start(0, this.offset, Math.max(.001, this.clip.end - this.offset));
      this.emit('state', { playing: true });
      return true;
    } catch (error) {
      this.playing = false;
      this.disconnectSource();
      this.emit('error', { message: error.message || '播放失败，请再次点击播放。' });
      return false;
    }
  }

  seek(time) {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.max(this.clip.start, Math.min(this.clip.end, Number(time) || 0));
    if (wasPlaying && this.offset < this.clip.end - .001) void this.play();
    this.emit('seek', { time: this.offset });
  }

  setClip(clip) {
    const wasPlaying = this.playing;
    const time = this.currentTime;
    this.pause();
    this.clip = { ...clip };
    this.offset = Math.max(clip.start, Math.min(clip.end, time));
    if (wasPlaying && this.offset < clip.end - .001) void this.play();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.gain) this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, .035);
  }

  levels() {
    if (!this.playing || !this.analyser) return { low: 0, mid: 0, high: 0, vocal: 0 };
    this.analyser.getByteFrequencyData(this.frequencies);
    const nyquist = this.context.sampleRate / 2;
    const average = (from, to) => {
      const a = Math.max(0, Math.floor(from / nyquist * this.frequencies.length));
      const b = Math.min(this.frequencies.length, Math.ceil(to / nyquist * this.frequencies.length));
      let total = 0;
      for (let i = a; i < b; i++) total += this.frequencies[i];
      return total / Math.max(1, b - a) / 255;
    };
    return { low: Math.min(1, average(35, 220) * 1.65), mid: Math.min(1, average(220, 2400) * 2),
      high: Math.min(1, average(2400, 11000) * 3.5), vocal: Math.min(1, average(300, 3400) * 2.1) };
  }
}
