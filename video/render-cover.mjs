import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const playwrightRoot = process.env.MOONCUT_PLAYWRIGHT || 'C:\\Users\\买辣条送的电脑\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright';
const { chromium } = await import(pathToFileURL(path.join(playwrightRoot, 'index.mjs')).href);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, 'exports');
const variant = process.argv[2] || 'art';
assert.ok(['art', 'promo'].includes(variant), '封面版本应为 art 或 promo');
const edition = process.argv[3] || '001';
assert.match(edition, /^\d{3}$/, '作品编号必须是三位数字，例如 001 或 002');
const filename = `sway-my-way-xiaohongshu-cover-${edition}${variant === 'promo' ? '-promo' : ''}`;
const template = variant === 'promo' ? 'cover-promo.html' : 'cover.html';
const edge = process.env.MOONCUT_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const frameTime = 32.65;

await mkdir(outputDir, { recursive: true });
const envelope = JSON.parse(await readFile(path.join(here, 'sway-envelope-v2.json'), 'utf8'));
const coverData = `data:image/jpeg;base64,${(await readFile(path.join(root, '..', 'Music', 'ab67616d0000b2737d14546dbde66888952efaf2.jpg'))).toString('base64')}`;
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--disable-background-networking', '--disable-extensions', '--force-device-scale-factor=1'] });
const errors = [];

try {
  const framePage = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  framePage.on('pageerror', error => errors.push(error.message));
  await framePage.addInitScript(({ data, image }) => { window.__VIDEO_DATA__ = data; window.__COVER_DATA__ = image; }, { data: envelope, image: coverData });
  await framePage.goto(pathToFileURL(path.join(here, 'render.html')).href);
  await framePage.addStyleTag({ content: '#lyrics-block, #title-block { display: none !important; }' });
  await framePage.evaluate(time => window.renderFrame(time), frameTime);
  const cleanFrame = `data:image/png;base64,${(await framePage.screenshot({ type: 'png' })).toString('base64')}`;
  await framePage.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ image, edition }) => { window.__CLEAN_FRAME__ = image; window.__EDITION__ = edition; }, { image: cleanFrame, edition });
  await page.goto(pathToFileURL(path.join(here, template)).href);
  await page.evaluate(async () => { await window.coverReady; await document.fonts.ready; });
  const geometry = await page.evaluate(() => {
    const heading = document.querySelector('.heading').getBoundingClientRect();
    const hook = document.querySelector('.hook')?.getBoundingClientRect();
    const title = document.querySelector('.song')?.getBoundingClientRect() ?? null;
    const artist = document.querySelector('.artist')?.getBoundingClientRect() ?? null;
    const footer = document.querySelector('.song-block, .genre-block').getBoundingClientRect();
    const fits = [...document.querySelectorAll('.heading span, .song span, .artist, .genre')].every(element => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    });
    return { fits, headingBottom: heading.bottom, hookBottom: hook?.bottom ?? null, titleBottom: title?.bottom ?? null, artistTop: artist?.top ?? null, footerTop: footer.top, width: innerWidth, height: innerHeight };
  });
  assert.equal(geometry.fits, true, '封面文字超出画面');
  if (geometry.titleBottom !== null && geometry.artistTop !== null) assert.ok(geometry.titleBottom <= geometry.artistTop, '歌名与歌手重叠');
  assert.ok(geometry.headingBottom < geometry.footerTop, '主标题与底部信息重叠');
  assert.equal(errors.length, 0, errors.join('\n'));
  const png = path.join(outputDir, `${filename}.png`);
  const jpg = path.join(outputDir, `${filename}.jpg`);
  const pngBuffer = await page.screenshot({ path: png, type: 'png' });
  await page.screenshot({ path: jpg, type: 'jpeg', quality: 97 });
  const thumbnail = await page.evaluate(async pngData => {
    const image = new Image();
    image.src = `data:image/png;base64,${pngData}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 360; canvas.height = 480;
    canvas.getContext('2d').drawImage(image, 0, 0, 360, 480);
    return canvas.toDataURL('image/jpeg', .94).split(',')[1];
  }, pngBuffer.toString('base64'));
  await mkdir(path.join(root, '.verification'), { recursive: true });
  await writeFile(path.join(root, '.verification', `${filename}-thumbnail.jpg`), Buffer.from(thumbnail, 'base64'));
  console.log(JSON.stringify({ png, jpg, frameTime, variant, ...geometry }));
} finally {
  await browser.close();
}
