export function parseLRC(source) {
  if (!source.trim()) return [];
  const lyrics = [];
  const errors = [];
  let offset = 0;
  const offsetMatch = source.match(/\[offset:([+-]?\d+)\]/i);
  if (offsetMatch) offset = Number(offsetMatch[1]) / 1000;
  source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    if (/^\s*\[(ar|ti|al|by|re|ve|length|offset):[^\]]*\]\s*$/i.test(line)) return;
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length || stamps.some(stamp => Number(stamp[2]) >= 60)) {
      errors.push(index + 1);
      return;
    }
    const content = line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
    if (/\[[^\]]*\]/.test(content)) {
      errors.push(index + 1);
      return;
    }
    if (!content) return;
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
      lyrics.push({ time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + fraction + offset), text: content });
    }
  });
  if (errors.length) throw new Error(`第 ${errors.slice(0, 5).join('、')} 行时间标签无效，请使用 [分:秒.百分秒]文字。`);
  if (!lyrics.length) throw new Error('未找到可用歌词，请输入如 [00:08.00]把月光寄给远方 的 LRC。');
  return lyrics.sort((a, b) => a.time - b.time);
}

export function formatTime(seconds, precise = false) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const whole = Math.floor(safe % 60);
  const fraction = Math.floor((safe - Math.floor(safe)) * 100 + 0.00001);
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}${precise ? `.${String(fraction).padStart(2, '0')}` : ''}`;
}

export function serializeLRC(lyrics) {
  return lyrics.map(line => `[${formatTime(line.time, true)}]${line.text}`).join('\n');
}

export function lyricIndexAt(lyrics, time) {
  let low = 0, high = lyrics.length - 1, result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lyrics[mid].time <= time + 0.015) { result = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return result;
}

export function normalizeClip(start, end, duration, edited = 'both') {
  const limit = Number.isFinite(duration) && duration > 0 ? duration : 45;
  const minimum = Math.min(15, limit);
  let a = Number.isFinite(Number(start)) ? Number(start) : 0;
  let b = Number.isFinite(Number(end)) ? Number(end) : limit;
  a = Math.max(0, Math.min(a, limit - minimum));
  b = Math.max(minimum, Math.min(b, limit));
  if (b - a < minimum) {
    if (edited === 'end') a = Math.max(0, b - minimum);
    else b = Math.min(limit, a + minimum);
  }
  if (b - a > 60) {
    if (edited === 'end') a = b - 60;
    else b = a + 60;
  }
  return { start: Math.round(a * 1000) / 1000, end: Math.round(b * 1000) / 1000 };
}
