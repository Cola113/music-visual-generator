import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const playwrightRoot = process.env.MOONCUT_PLAYWRIGHT || 'C:\\Users\\买辣条送的电脑\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright';
const { chromium } = await import(pathToFileURL(path.join(playwrightRoot, 'index.mjs')).href);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, 'exports');
const templatePath = path.join(here, 'cover-dancing.html');
const renderPath = path.join(here, 'render-dancing.html');
const envelopePath = path.join(here, 'dancing-envelope.json');
const musicDir = path.join(root, '..', 'Music', 'Dancing with my phone (cover HYBS)-Estela Sun.mp3');
const coverPath = path.join(musicDir, 'Estela Sun_有腔调的英文歌_4.jpg');
const edition = process.argv[2] || '002';
assert.match(edition, /^\d{3}$/, '作品编号必须是三位数字，例如 001 或 002');
const filename = `dancing-with-my-phone-xiaohongshu-cover-${edition}`;
const frameTime = 14.4;
const edge = process.env.MOONCUT_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

await mkdir(outputDir, { recursive: true });
const envelope = JSON.parse(await readFile(envelopePath, 'utf8'));
const coverData = `data:image/jpeg;base64,${(await readFile(coverPath)).toString('base64')}`;
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--disable-background-networking', '--disable-extensions', '--force-device-scale-factor=1'] });
const errors = [];

try {
  const framePage = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  framePage.on('pageerror', error => errors.push(error.message));
  await framePage.addInitScript(({ data, image }) => { window.__VIDEO_DATA__ = data; window.__COVER_DATA__ = image; }, { data: envelope, image: coverData });
  await framePage.goto(pathToFileURL(renderPath).href, { waitUntil: 'load' });
  await framePage.addStyleTag({ content: '#lyrics-block, #title-block { display: none !important; }' });
  await framePage.evaluate(time => window.renderFrame(time), frameTime);
  const cleanFrame = `data:image/png;base64,${(await framePage.screenshot({ type: 'png' })).toString('base64')}`;
  await framePage.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ image, value }) => { window.__CLEAN_FRAME__ = image; window.__EDITION__ = value; }, { image: cleanFrame, value: edition });
  await page.goto(pathToFileURL(templatePath).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await window.coverReady; await document.fonts.ready; });
  const geometry = await page.evaluate(() => {
    const heading = document.querySelector('.heading').getBoundingClientRect();
    const footer = document.querySelector('.genre-block').getBoundingClientRect();
    const fits = [...document.querySelectorAll('.heading span, .genre')].every(element => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    });
    return { fits, headingBottom: heading.bottom, footerTop: footer.top, width: innerWidth, height: innerHeight };
  });
  assert.equal(geometry.fits, true, '封面文字超出画面');
  assert.ok(geometry.headingBottom < geometry.footerTop, '顶部编号与底部风格重叠');
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
  const thumbnailPath = path.join(root, '.verification', `${filename}-thumbnail.jpg`);
  await writeFile(thumbnailPath, Buffer.from(thumbnail, 'base64'));
  console.log(JSON.stringify({ png, jpg, thumbnail: thumbnailPath, frameTime, edition, ...geometry }));
} finally {
  await browser.close();
}
