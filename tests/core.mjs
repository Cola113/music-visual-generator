import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLRC, serializeLRC, lyricIndexAt, normalizeClip } from '../js/lyrics.js';
import { DEMO_TRACKS } from '../js/demo-tracks.js';
import { readableAccent } from '../js/visuals.js';

assert.deepEqual(parseLRC('[ar:自生成]\n[00:08.25][00:12.500]月光\n[00:09]远方'), [
  { time: 8.25, text: '月光' }, { time: 9, text: '远方' }, { time: 12.5, text: '月光' },
]);
assert.deepEqual(parseLRC('[offset:-500]\n[00:00.20]开始\n[01:02.1]继续'), [
  { time: 0, text: '开始' }, { time: 61.6, text: '继续' },
]);
assert.deepEqual(parseLRC('  '), []);
assert.throws(() => parseLRC('没有时间戳'), /第 1 行/);
assert.throws(() => parseLRC('[00:80]错误'), /时间标签无效/);
assert.throws(() => parseLRC('[00:10]正确\n[错误]不可忽略'), /第 2 行/);
assert.throws(() => parseLRC('[ti:只有标题]'), /未找到可用歌词/);
const lyric = [{ time: 8.25, text: '<img onerror=alert(1)>' }, { time: 16, text: '普通歌词' }];
assert.deepEqual(parseLRC(serializeLRC(lyric)), lyric);
assert.equal(lyricIndexAt(lyric, 0), -1);
assert.equal(lyricIndexAt(lyric, 9), 0);
assert.equal(lyricIndexAt(lyric, 16), 1);
assert.deepEqual(normalizeClip(50, 20, 45, 'start'), { start: 30, end: 45 });
assert.deepEqual(normalizeClip(8, 11, 45, 'end'), { start: 0, end: 15 });
assert.deepEqual(normalizeClip(-5, 200, 240), { start: 0, end: 60 });
assert.deepEqual(normalizeClip(20, 180, 240, 'end'), { start: 120, end: 180 });
assert.deepEqual(normalizeClip(0, 30, 9), { start: 0, end: 9 });
assert.equal(DEMO_TRACKS.length, 3);
assert.equal(readableAccent('#86d8df'), '#86d8df');
assert.notEqual(readableAccent('#000000'), '#000000');
for (const track of DEMO_TRACKS) {
  assert.ok(track.clip.end - track.clip.start >= 15 && track.clip.end - track.clip.start <= 60);
  const wav = await readFile(new URL(`../${track.audioUrl}`, import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40) / 44100 / 4, 45);
  await readFile(new URL(`../${track.coverUrl}`, import.meta.url));
}
console.log('通过：LRC 多时间戳、偏移、错误、序列化、查找；片段边界；三首 45 秒立体声 WAV 与封面。');
