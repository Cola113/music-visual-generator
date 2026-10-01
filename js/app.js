import { DEMO_TRACKS } from './demo-tracks.js';
import { FEATURED_TRACK } from './featured-track.js';
import { AudioEngine } from './audio.js';
import { VisualEngine, readableAccent } from './visuals.js';
import { SessionStore } from './storage.js';
import { parseLRC, serializeLRC, formatTime, lyricIndexAt, normalizeClip } from './lyrics.js';

const $ = selector => document.querySelector(selector);
const audio = new AudioEngine();
const storage = new SessionStore();
const restored = storage.read();
const restoredTracks = Array.isArray(restored?.tracks) ? restored.tracks : [];
const objectURLs = new Map();
let toastTimer, saveTimer, hintTimer, activeLyric = -2;
let clean = false;
let selecting = 0;
let ready = false;
let draggingProgress = false;

function sanitizeTrack(track) {
  const visual = track.visual || {};
  const intensity = visual.intensity || {};
  return { ...track,
    title: String(track.title || '未命名声音').slice(0, 80),
    artist: String(track.artist || '本地创作者').slice(0, 80),
    lyrics: Array.isArray(track.lyrics) ? track.lyrics.filter(line => Number.isFinite(line.time) && line.time >= 0 && typeof line.text === 'string').sort((a, b) => a.time - b.time) : [],
    clip: normalizeClip(track.clip?.start, track.clip?.end, track.duration),
    visual: { scene: ['moon', 'orbit', 'afterglow', 'pocket'].includes(visual.scene) ? visual.scene : 'moon',
      accentColor: /^#[0-9a-f]{6}$/i.test(visual.accentColor) ? visual.accentColor : '#86d8df',
      intensity: Object.fromEntries(['particles', 'halo', 'grain'].map((name, i) => [name, Number.isFinite(intensity[name]) ? Math.max(0, Math.min(1, intensity[name])) : [.42, .62, .17][i]])) },
  };
}

const featuredSaved = restoredTracks.find(track => track?.id === FEATURED_TRACK.id);
const featuredLyrics = Array.isArray(featuredSaved?.lyrics) && featuredSaved.lyrics.length
  ? featuredSaved.lyrics.map(line => {
    const source = FEATURED_TRACK.lyrics.find(reference => Math.abs(reference.time - line.time) < .03);
    return source?.translation && !line.translation ? { ...line, translation: source.translation } : line;
  })
  : structuredClone(FEATURED_TRACK.lyrics);
const featured = sanitizeTrack({ ...structuredClone(FEATURED_TRACK), ...featuredSaved,
  lyrics: featuredLyrics,
  audioUrl: FEATURED_TRACK.audioUrl, coverUrl: FEATURED_TRACK.coverUrl, isDemo: true, isFeatured: true,
  duration: FEATURED_TRACK.duration });
let tracks = [featured, ...DEMO_TRACKS.map(demo => {
  const saved = restoredTracks.find(track => track?.id === demo.id);
  return sanitizeTrack({ ...structuredClone(demo), ...saved, audioUrl: demo.audioUrl,
    coverUrl: demo.coverUrl, isDemo: true, duration: demo.duration });
})];
if (restoredTracks.length) {
  tracks.push(...restoredTracks.filter(track => track && !track.isDemo && typeof track.id === 'string')
    .map(track => sanitizeTrack({ ...track, audioUrl: null, coverUrl: 'assets/covers/mist-letter.svg' })));
}
let current = tracks.find(track => track.id === restored?.selectedId) || tracks[0];
let volume = Number.isFinite(restored?.volume) ? Math.max(0, Math.min(1, restored.volume)) : .7;
const visual = new VisualEngine($('#stage'), $('.stage-fit'), audio, updatePlayback);

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 6500 : 3300);
}

function persist(immediate = false) {
  const save = () => {
    const snapshot = tracks.map(track => {
      const copy = { ...track };
      // blob URL 只在页面内有效；刷新使用 IndexedDB 二进制重建。
      if (copy.audioAssetKey) copy.audioUrl = null;
      if (copy.coverAssetKey) copy.coverUrl = null;
      return copy;
    });
    const ok = storage.save({ selectedId: current.id, tracks: snapshot, volume,
      position: audio.currentTime, selectedPositionId: current.id });
    $('#session-status').textContent = ok ? '本标签页已自动保存' : storage.problem;
  };
  clearTimeout(saveTimer);
  if (immediate) save();
  else saveTimer = setTimeout(save, 160);
}

function setObjectURL(track, kind, blob) {
  const key = `${track.id}:${kind}`;
  const old = objectURLs.get(key);
  const url = URL.createObjectURL(blob);
  objectURLs.set(key, url);
  track[kind === 'audio' ? 'audioUrl' : 'coverUrl'] = url;
  if (old) URL.revokeObjectURL(old);
  return url;
}

function renderTracks() {
  const list = $('#track-list');
  list.replaceChildren();
  tracks.forEach(track => {
    const button = document.createElement('button');
    button.className = `track-card${track.id === current.id ? ' selected' : ''}`;
    button.dataset.trackId = track.id;
    button.setAttribute('aria-pressed', String(track.id === current.id));
    const image = document.createElement('img');
    image.className = 'track-cover';
    image.src = track.coverUrl || 'assets/covers/mist-letter.svg';
    image.alt = `${track.title}封面`;
    const copy = document.createElement('span');
    copy.className = 'track-copy';
    const title = document.createElement('strong');
    title.textContent = track.title;
    const artist = document.createElement('small');
    artist.textContent = `${track.artist} · ${track.mood || '本地导入'}`;
    copy.append(title, artist);
    const end = document.createElement('span');
    if (track.id === current.id) {
      end.className = 'track-indicator';
      end.append(...Array.from({ length: 3 }, () => document.createElement('i')));
    } else { end.className = 'track-duration'; end.textContent = formatTime(track.duration); }
    button.append(image, copy, end);
    button.addEventListener('click', () => void selectTrack(track));
    list.append(button);
  });
  $('#track-count').textContent = tracks.length === 4 ? '1 个主题 · 3 首自生成演示' : `${tracks.length} 首声音`;
}

function syncClipUI() {
  const { start, end } = current.clip;
  $('#clip-start').value = Number(start.toFixed(2));
  $('#clip-end').value = Number(end.toFixed(2));
  $('#clip-start').max = Math.max(0, current.duration - Math.min(15, current.duration));
  $('#clip-end').max = current.duration;
  $('#clip-length').textContent = `${(end - start).toFixed(1)} 秒`;
  $('#progress').min = start;
  $('#progress').max = end;
  $('#progress').value = Math.max(start, Math.min(end, audio.currentTime));
  $('#audio-duration').textContent = formatTime(current.duration);
  $('#clip-end-time').textContent = formatTime(end);
  $('#wave-selection').style.left = `${start / current.duration * 100}%`;
  $('#wave-selection').style.width = `${(end - start) / current.duration * 100}%`;
}

function syncVisualUI() {
  const settings = current.visual;
  document.documentElement.style.setProperty('--accent', readableAccent(settings.accentColor));
  document.querySelectorAll('.scene-card').forEach(button => {
    const selected = button.dataset.scene === settings.scene;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('.color-swatch').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === settings.accentColor)));
  $('#accent-color').value = settings.accentColor;
  for (const name of ['particles', 'halo', 'grain']) {
    $(`#${name}`).value = Math.round(settings.intensity[name] * 100);
    $(`#${name}`).nextElementSibling.value = $(`#${name}`).value;
  }
  visual.setVisual(settings);
}

function renderLyricList() {
  activeLyric = -2;
  const list = $('#lyric-list');
  list.replaceChildren();
  $('#lyric-count').textContent = `${current.lyrics.length} 句歌词`;
  if (!current.lyrics.length) {
    const empty = document.createElement('p');
    empty.className = 'lyric-list-empty';
    empty.textContent = '暂无歌词 · 舞台显示歌名与情绪短句';
    list.append(empty);
  }
  current.lyrics.forEach((line, index) => {
    const row = document.createElement('div');
    row.className = 'lyric-row';
    row.dataset.index = index;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `${formatTime(line.time, true)} ${line.text}，点击跳转，双击编辑`);
    row.classList.toggle('outside', line.time < current.clip.start || line.time > current.clip.end);
    const timestamp = document.createElement('span');
    timestamp.className = 'lyric-time';
    timestamp.textContent = formatTime(line.time, true);
    timestamp.title = '双击修改时间（秒）';
    const text = document.createElement('span');
    text.className = 'lyric-text';
    text.textContent = line.text;
    text.title = '双击修改这句歌词';
    row.append(timestamp, text);
    const jump = () => {
      audio.seek(line.time);
      updatePlayback(audio.currentTime, audio.playing);
      if (line.time < current.clip.start || line.time > current.clip.end) toast('这句在片段外，已跳转到最近的片段边界。');
      persist();
    };
    row.addEventListener('click', event => { if (event.target.tagName !== 'INPUT' && event.detail === 1) jump(); });
    row.addEventListener('keydown', event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); jump(); } });
    timestamp.addEventListener('dblclick', event => { event.stopPropagation(); editLyric(row, line, timestamp, 'time'); });
    text.addEventListener('dblclick', event => { event.stopPropagation(); editLyric(row, line, text, 'text'); });
    list.append(row);
  });
  highlightLyric(audio.currentTime);
}

function editLyric(row, line, element, property) {
  if (row.querySelector('input')) return;
  const input = document.createElement('input');
  input.type = property === 'time' ? 'number' : 'text';
  input.value = line[property];
  input.className = property === 'time' ? 'time-edit' : 'text-edit';
  input.setAttribute('aria-label', property === 'time' ? '歌词时间（秒）' : '单句歌词文字');
  if (property === 'time') { input.min = 0; input.step = '.01'; }
  else input.maxLength = 500;
  element.replaceWith(input);
  input.focus();
  input.select();
  let committed = false;
  const commit = cancel => {
    if (committed) return;
    committed = true;
    if (!cancel) {
      if (property === 'time') {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0 || input.value === '') toast('歌词时间必须是大于或等于 0 的秒数。', true);
        else line.time = Math.round(value * 1000) / 1000;
      } else if (input.value.trim()) line.text = input.value.trim();
      else toast('歌词文字不能为空；清空全部歌词可在 LRC 编辑框中操作。', true);
      current.lyrics.sort((a, b) => a.time - b.time);
      current.lrcDraft = serializeLRC(current.lyrics);
      $('#lrc-editor').value = current.lrcDraft;
      visual.lastLyric = '';
      persist();
    }
    renderLyricList();
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commit(false); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); commit(true); }
  });
  input.addEventListener('blur', () => commit(false));
}

function highlightLyric(time) {
  const index = lyricIndexAt(current.lyrics, time);
  if (index === activeLyric) return;
  activeLyric = index;
  document.querySelectorAll('.lyric-row').forEach(row => {
    const isCurrent = Number(row.dataset.index) === index;
    row.classList.toggle('active', isCurrent);
    row.setAttribute('aria-current', isCurrent ? 'true' : 'false');
    if (isCurrent && !$('#lyric-list').querySelector('input')) {
      const list = $('#lyric-list');
      const offset = row.offsetTop - list.offsetTop;
      if (offset < list.scrollTop || offset + row.clientHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = Math.max(0, offset - list.clientHeight / 2 + row.clientHeight / 2);
    }
  });
}

function updatePlayback(time, playing) {
  if (!current) return;
  if (!draggingProgress) $('#progress').value = time;
  $('#current-time').textContent = formatTime(time);
  $('#wave-playhead').style.left = `${Math.max(0, Math.min(100, time / current.duration * 100))}%`;
  highlightLyric(time);
}

function drawWaveform(peaks = []) {
  const canvas = $('#waveform');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = current.visual.accentColor;
  const maximum = Math.max(.1, ...peaks);
  for (let i = 0; i < 130; i++) {
    const height = peaks.length ? Math.max(3, peaks[i] / maximum * 86) : 4 + Math.abs(Math.sin(i * .7)) * 6;
    ctx.globalAlpha = .5;
    ctx.fillRect(i * 4 + 1, (112 - height) / 2, 2, height);
  }
  ctx.globalAlpha = 1;
}

async function selectTrack(track, resumePosition = false) {
  const request = ++selecting;
  ready = false;
  current = track;
  audio.pause();
  audio.offset = track.clip.start;
  audio.clip = { ...track.clip };
  renderTracks();
  syncClipUI();
  $('#player-title').textContent = track.title;
  $('#cover-preview').src = track.coverUrl || 'assets/covers/mist-letter.svg';
  $('#cover-status').textContent = track.isFeatured ? '主题封面 · 随项目一起使用' : track.coverAssetKey ? '已导入封面 · 本标签页刷新可恢复' : track.isDemo ? '正在使用自绘演示封面' : '使用默认封面';
  $('#cover-status').classList.remove('error');
  $('#track-metadata').hidden = track.isDemo;
  $('#track-title').value = track.title;
  $('#track-artist').value = track.artist;
  $('#lrc-editor').value = track.lrcDraft ?? serializeLRC(track.lyrics);
  $('#lrc-message').textContent = '点击一句跳转 · 双击文字或时间微调';
  $('#lrc-message').classList.remove('error');
  $('#clip-message').textContent = track.duration < 15 ? '音频不足 15 秒，使用整段音频。' : '选取 15–60 秒，把最好的一段留下来。';
  visual.setTrack(track, tracks.indexOf(track) + 1);
  syncVisualUI();
  renderLyricList();
  drawWaveform();
  await audio.load(track.audioUrl, track.clip);
  if (request !== selecting) return;
  if (resumePosition && restored?.selectedPositionId === track.id && Number.isFinite(restored.position)) audio.seek(restored.position);
  persist();
}

audio.addEventListener('loading', () => {
  $('#audio-status').textContent = '正在准备声音…';
  $('#play-toggle').disabled = true;
  $('#restart-play').disabled = true;
  $('#stage-error').hidden = true;
  $('#stage').classList.remove('audio-error');
});
audio.addEventListener('ready', event => {
  ready = true;
  current.duration = event.detail.duration;
  current.clip = normalizeClip(current.clip.start, current.clip.end, current.duration);
  $('#clip-message').textContent = current.duration < 15 ? '音频不足 15 秒，已保留完整声音。' : '选取 15–60 秒，把最好的一段留下来。';
  audio.setClip(current.clip);
  syncClipUI();
  drawWaveform(event.detail.peaks);
  renderLyricList();
  $('#audio-status').textContent = '片段已就绪 · 点击播放';
  $('#play-toggle').disabled = false;
  $('#restart-play').disabled = false;
  $('#stage-error').hidden = true;
  $('#stage').classList.remove('audio-error');
});
audio.addEventListener('error', event => {
  ready = Boolean(audio.buffer);
  $('#audio-status').textContent = ready ? '播放失败 · 可重试' : '声音加载失败';
  $('#play-toggle').disabled = !ready;
  $('#restart-play').disabled = !ready;
  $('#stage-error').textContent = `声音暂时未能抵达。${event.detail.message} 画面仍在待机。`;
  $('#stage-error').hidden = false;
  $('#stage').classList.add('audio-error');
  toast(event.detail.message, true);
});
audio.addEventListener('state', event => {
  const { playing, ended } = event.detail;
  $('#play-toggle').classList.toggle('is-playing', playing);
  $('#play-toggle').setAttribute('aria-label', playing ? '暂停' : '播放');
  $('#play-toggle use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  $('#play-state').classList.toggle('active', playing);
  if (ready) $('#audio-status').textContent = playing ? '正在播放所选片段' : ended ? '片段结束 · 可从头播放' : '已暂停 · 画面仍在呼吸';
  if (ended) persist();
});
audio.addEventListener('seek', () => { visual.updateLyrics(audio.currentTime); updatePlayback(audio.currentTime, audio.playing); });

$('#play-toggle').addEventListener('click', () => { if (audio.playing) { audio.pause(); persist(); } else void audio.play(); });
$('#restart-play').addEventListener('click', () => void audio.play(true));
$('#progress').addEventListener('pointerdown', () => { draggingProgress = true; });
$('#progress').addEventListener('input', () => { audio.seek(Number($('#progress').value)); visual.updateLyrics(audio.currentTime); persist(); });
window.addEventListener('pointerup', () => { draggingProgress = false; });
$('#progress').addEventListener('blur', () => { draggingProgress = false; });
$('#volume').value = Math.round(volume * 100);
$('#volume-value').value = `${Math.round(volume * 100)}%`;
audio.setVolume(volume);
$('#volume').addEventListener('input', () => {
  volume = Number($('#volume').value) / 100;
  audio.setVolume(volume);
  $('#volume-value').value = `${$('#volume').value}%`;
  persist();
});

for (const [selector, field] of [['#clip-start', 'start'], ['#clip-end', 'end']]) {
  $(selector).addEventListener('change', () => {
    const start = Number($('#clip-start').value), end = Number($('#clip-end').value);
    const normalized = normalizeClip(start, end, current.duration, field);
    const adjusted = Math.abs(normalized.start - start) > .001 || Math.abs(normalized.end - end) > .001;
    current.clip = normalized;
    audio.setClip(normalized);
    syncClipUI();
    renderLyricList();
    visual.updateLyrics(audio.currentTime);
    $('#clip-message').textContent = current.duration < 15 ? '音频不足 15 秒，已保留完整声音。' : adjusted ? '已将片段调整到音频范围内，并保持 15–60 秒。' : '片段已更新，播放将停在结束位置。';
    persist();
  });
}

$('#apply-lrc').addEventListener('click', () => {
  try {
    const parsed = parseLRC($('#lrc-editor').value);
    current.lyrics = parsed;
    current.lrcDraft = $('#lrc-editor').value;
    $('#lrc-message').textContent = parsed.length ? `已应用 ${parsed.length} 句 · 点击跳转，双击微调` : '歌词已清空，舞台显示歌名与情绪短句。';
    $('#lrc-message').classList.remove('error');
    renderLyricList();
    visual.lastLyric = '';
    visual.updateLyrics(audio.currentTime);
    persist();
  } catch (error) {
    $('#lrc-message').textContent = error.message;
    $('#lrc-message').classList.add('error');
    toast(error.message, true);
  }
});
$('#lrc-editor').addEventListener('input', () => { current.lrcDraft = $('#lrc-editor').value; persist(); });
$('#lrc-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  const target = current;
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('LRC 文件过大，请使用 1 MB 以内的纯文本歌词。');
    const text = await file.text();
    const parsed = parseLRC(text);
    target.lrcDraft = text;
    target.lyrics = parsed;
    if (current === target) {
      $('#lrc-editor').value = text;
      renderLyricList();
      visual.lastLyric = '';
      $('#lrc-message').textContent = `已导入 ${parsed.length} 句歌词 · 时间以整首歌曲为基准`;
      $('#lrc-message').classList.remove('error');
    }
    persist();
  } catch (error) { $('#lrc-message').textContent = error.message; $('#lrc-message').classList.add('error'); toast(error.message, true); }
  event.target.value = '';
});

document.querySelectorAll('.scene-card').forEach(button => button.addEventListener('click', () => {
  current.visual.scene = button.dataset.scene;
  syncVisualUI();
  persist();
}));
function applyColor(color) { current.visual.accentColor = color; syncVisualUI(); drawWaveform(audio.peaks); persist(); }
document.querySelectorAll('.color-swatch').forEach(button => button.addEventListener('click', () => applyColor(button.dataset.color)));
$('#accent-color').addEventListener('input', () => applyColor($('#accent-color').value));
for (const name of ['particles', 'halo', 'grain']) {
  $(`#${name}`).addEventListener('input', () => {
    current.visual.intensity[name] = Number($(`#${name}`).value) / 100;
    $(`#${name}`).nextElementSibling.value = $(`#${name}`).value;
    visual.scene.style.setProperty(`--${name}`, current.visual.intensity[name]);
    persist();
  });
}

async function importAudio(file) {
  if (!file) return;
  if (file.size > 150 * 1024 * 1024) { toast('请选择 150 MB 以内的音频，以免浏览器解码时占用过多内存。', true); return; }
  const track = sanitizeTrack({
    id: `local-${crypto.randomUUID()}`, title: file.name.replace(/\.[^.]+$/, ''), artist: '本地创作者',
    isDemo: false, audioUrl: null, coverUrl: 'assets/covers/mist-letter.svg',
    duration: 45, clip: { start: 0, end: 30 }, lyrics: [], mood: '本地导入',
    phrase: '让这一刻，在光里停留。', visual: structuredClone(current.visual),
  });
  try { track.audioAssetKey = await storage.put(track.id, 'audio', file); }
  catch (error) { toast(error.message, true); }
  setObjectURL(track, 'audio', file);
  tracks.push(track);
  await selectTrack(track);
  persist();
}
$('#audio-file').addEventListener('change', async event => { await importAudio(event.target.files[0]); event.target.value = ''; });

async function importCover(file) {
  if (!file) return;
  const target = current;
  if (!file.type.startsWith('image/')) { toast('请导入 PNG、JPEG、WebP、SVG 等图片文件。', true); return; }
  if (file.size > 25 * 1024 * 1024) { toast('请选择 25 MB 以内的封面图片。', true); return; }
  const probeURL = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = probeURL;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效。');
    try { target.coverAssetKey = await storage.put(target.id, 'cover', file); }
    catch (error) { delete target.coverAssetKey; toast(error.message, true); }
    setObjectURL(target, 'cover', file);
    if (current === target) {
      $('#cover-preview').src = target.coverUrl;
      visual.setCover(target.coverUrl);
      $('#cover-status').textContent = target.coverAssetKey ? '封面已更新 · 本标签页刷新可恢复' : '封面已更新 · 当前页面临时使用';
      $('#cover-status').classList.remove('error');
    }
    renderTracks();
    persist();
  } catch { $('#cover-status').textContent = '图片无法读取，请更换有效的图片文件。'; $('#cover-status').classList.add('error'); toast('封面无法读取，请更换有效的图片文件。', true); }
  finally { URL.revokeObjectURL(probeURL); }
}
$('#cover-file').addEventListener('change', async event => { await importCover(event.target.files[0]); event.target.value = ''; });
$('#cover-drop').addEventListener('click', () => $('#cover-file').click());
$('#cover-drop').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#cover-file').click(); } });
$('#cover-drop').addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; $('#cover-drop').classList.add('drag-over'); });
$('#cover-drop').addEventListener('dragleave', () => $('#cover-drop').classList.remove('drag-over'));
$('#cover-drop').addEventListener('drop', event => { event.preventDefault(); $('#cover-drop').classList.remove('drag-over'); void importCover(event.dataTransfer.files[0]); });
window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
window.addEventListener('drop', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
document.addEventListener('paste', event => {
  if (clean) return;
  const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/'));
  if (!item) return;
  event.preventDefault();
  void importCover(item.getAsFile());
});

for (const [selector, property] of [['#track-title', 'title'], ['#track-artist', 'artist']]) {
  $(selector).addEventListener('change', () => {
    current[property] = $(selector).value.trim() || (property === 'title' ? '未命名声音' : '本地创作者');
    $(selector).value = current[property];
    $('#player-title').textContent = current.title;
    visual.setTrack(current, tracks.indexOf(current) + 1);
    renderTracks();
    persist();
  });
}

function setCleanMode(value) {
  clean = value;
  document.body.classList.toggle('clean-mode', value);
  clearTimeout(hintTimer);
  $('#clean-hint').hidden = !value;
  $('#clean-hint').classList.remove('fade');
  if (value) {
    $('#help-dialog').close();
    document.activeElement?.blur();
    hintTimer = setTimeout(() => { $('#clean-hint').classList.add('fade'); hintTimer = setTimeout(() => { $('#clean-hint').hidden = true; }, 650); }, 2100);
  }
  requestAnimationFrame(() => visual.resize());
}
$('#clean-mode').addEventListener('click', () => setCleanMode(true));
$('#clean-start').addEventListener('click', async () => {
  if (!ready) { toast('请先等待音频就绪；加载失败时请重新选择或导入音频。', true); return; }
  const playing = await audio.play(true);
  if (playing) setCleanMode(true);
});
document.addEventListener('keydown', event => {
  const editing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable;
  if (event.key === 'Escape' && clean) { event.preventDefault(); setCleanMode(false); return; }
  if (editing || event.ctrlKey || event.metaKey || event.altKey || event.repeat || $('#help-dialog').open) return;
  if (event.key.toLowerCase() === 'h') { event.preventDefault(); setCleanMode(!clean); }
  if (event.code === 'Space') { event.preventDefault(); if (audio.playing) { audio.pause(); persist(); } else void audio.play(); }
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); void audio.play(true); }
});
$('#record-help').addEventListener('click', () => $('#help-dialog').showModal());
$('#close-help').addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', event => { if (event.target === $('#help-dialog')) $('#help-dialog').close(); });
window.addEventListener('pagehide', () => persist(true));

async function initialize() {
  if (location.protocol === 'file:') toast('请在仓库运行 python -m http.server，通过 http://localhost:8000 打开；file:// 无法可靠解码音频。', true);
  const recoveries = await Promise.allSettled(tracks.map(async track => {
    for (const kind of ['audio', 'cover']) {
      const key = track[`${kind}AssetKey`];
      if (!key) continue;
      const blob = await storage.get(key);
      if (blob) setObjectURL(track, kind, blob);
      else if (kind === 'audio') track.audioUrl = null;
      else { delete track.coverAssetKey; toast('上次导入的封面已不可用，已恢复自绘封面。', true); }
    }
  }));
  if (recoveries.some(result => result.status === 'rejected')) toast('部分本地素材未能恢复，请重新导入。', true);
  await selectTrack(current, true);
  if (storage.problem) toast(storage.problem, true);
}
void initialize().catch(error => {
  toast(`工作台初始化遇到问题：${error.message}`, true);
  $('#stage-error').textContent = '声音暂时无法加载，请刷新或重新导入。视觉仍在待机。';
  $('#stage-error').hidden = false;
  $('#stage').classList.add('audio-error');
});
