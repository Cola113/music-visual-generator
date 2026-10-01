import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const playwrightRoot = process.env.MOONCUT_PLAYWRIGHT || 'C:\\Users\\买辣条送的电脑\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright';
const { chromium } = await import(pathToFileURL(path.join(playwrightRoot, 'index.mjs')).href);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const musicDir = path.resolve(root, '..', 'Music');
const audioPath = path.join(musicDir, 'Sway My Way.mp3');
const coverPath = path.join(musicDir, 'ab67616d0000b2737d14546dbde66888952efaf2.jpg');
const envelopePath = path.join(here, 'sway-envelope-v2.json');
const outputDir = path.join(root, 'exports');
const outputPath = path.join(outputDir, 'sway-my-way-moon-phase-v4.mp4');
const posterPath = path.join(outputDir, 'sway-my-way-moon-phase-v4-poster.jpg');
const frameDir = path.join(root, '.verification', 'sway-video-frames-v4');
const htmlPath = path.join(here, 'render-v4.html');
const fps = 30, start = 73.4, duration = 36.6;
const edge = process.env.MOONCUT_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ffmpeg = process.env.MOONCUT_FFMPEG || path.join(root, '..', '.render-tools', 'python-deps', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v7.1.exe');

function run(file, args) {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr })));
}

async function main() {
  if (!existsSync(edge)) throw new Error(`找不到 Edge：${edge}`);
  if (!existsSync(ffmpeg)) throw new Error(`找不到 FFmpeg：${ffmpeg}`);
  await mkdir(outputDir, { recursive: true }); await mkdir(frameDir, { recursive: true }); await rm(outputPath, { force: true }); await rm(posterPath, { force: true });
  const envelope = JSON.parse(await readFile(envelopePath, 'utf8'));
  const cover = `data:image/jpeg;base64,${(await readFile(coverPath)).toString('base64')}`;
  const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--disable-background-networking', '--disable-extensions', '--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.addInitScript(({ data, coverData }) => { window.__VIDEO_DATA__ = data; window.__COVER_DATA__ = coverData; }, { data: envelope, coverData: cover });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' }); await page.waitForFunction(() => window.renderFrame && window.renderReady);
  const frameCount = Math.round(duration * fps);
  for (let index = 0; index < frameCount; index++) { await page.evaluate(value => window.renderFrame(value), index / fps); await page.screenshot({ path: path.join(frameDir, `frame-${String(index + 1).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 93 }); if ((index + 1) % 120 === 0 || index === frameCount - 1) console.log(`渲染画面 ${index + 1}/${frameCount}`); }
  await browser.close();
  const filter = `atrim=duration=${duration},asetpts=N/SR/TB,afade=t=in:st=0:d=1,afade=t=out:st=${duration - 1}:d=1,loudnorm=I=-15:TP=-1.5:LRA=9`;
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frameDir, 'frame-%06d.jpg'), '-ss', String(start), '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-af', filter, '-movflags', '+faststart', outputPath]);
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '18', '-i', outputPath, '-frames:v', '1', '-q:v', '2', posterPath]);
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', outputPath, '-f', 'null', '-']); await rm(frameDir, { recursive: true, force: true });
  console.log(JSON.stringify({ output: outputPath, poster: posterPath, start, duration }));
}

main().catch(error => { console.error(error.stderr || error.stack || error.message || error); process.exitCode = 1; });
