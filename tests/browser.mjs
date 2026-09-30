import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.verification');
await mkdir(output, { recursive: true });
const port = 9224;
const edge = process.env.MOONCUT_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const processHandle = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${path.join(output, 'edge-profile')}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--disable-features=msEdgeSidebarV2',
  '--disable-crash-reporter', '--disable-breakpad', '--hide-scrollbars', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const pending = new Map();
let id = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const events = [];

function command(method, params = {}) {
  const key = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`超时：${method}`)); }, 15000);
    pending.set(key, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}

async function evaluate(expression, userGesture = false) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await delay(120);
  }
  throw new Error(`状态未就绪：${expression}`);
}

async function click(selector) {
  const rect = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}

async function input(selector, value, type = 'input') {
  await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(String(value))}; e.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true})); })()`);
}

async function attachFile(selector, filename) {
  const { root: documentRoot } = await command('DOM.getDocument');
  const { nodeId } = await command('DOM.querySelector', { nodeId: documentRoot.nodeId, selector });
  await command('DOM.setFileInputFiles', { nodeId, files: [path.join(root, filename)] });
}

async function key(key, code, windowsVirtualKeyCode) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
}

async function screenshot(filename) {
  const image = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, filename), Buffer.from(image.data, 'base64'));
}

const checks = [];
function passed(name, detail) { checks.push({ name, passed: true, detail }); console.log(`通过：${name}${detail ? ` (${detail})` : ''}`); }

try {
  let endpoint;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      endpoint = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl;
      if (endpoint) break;
    } catch { /* Edge 启动期间等待本地调试端口。 */ }
    await delay(150);
  }
  if (!endpoint) throw new Error('Edge 调试端口未能启动。');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (packet.id) {
      const task = pending.get(packet.id);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(packet.id);
      if (packet.error) task.reject(new Error(packet.error.message)); else task.resolve(packet.result);
    } else if (['Runtime.exceptionThrown', 'Network.loadingFailed', 'Network.responseReceived'].includes(packet.method)) events.push(packet);
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__mooncutTestAudio = { gains: [], sources: [], analysers: [], contexts: [] };
    const originalGain = AudioContext.prototype.createGain;
    const originalSource = AudioContext.prototype.createBufferSource;
    const originalAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createGain = function(...args) { const node = originalGain.apply(this,args); __mooncutTestAudio.gains.push(node); __mooncutTestAudio.contexts.push(this); return node; };
    AudioContext.prototype.createBufferSource = function(...args) { const node=originalSource.apply(this,args); const originalStart=node.start; node.start=function(...startArgs) { node.__startArguments=startArgs; return originalStart.apply(this,startArgs); }; __mooncutTestAudio.sources.push(node); return node; };
    AudioContext.prototype.createAnalyser = function(...args) { const node=originalAnalyser.apply(this,args); __mooncutTestAudio.analysers.push(node); return node; };
  ` });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: 'http://127.0.0.1:8765/' });
  await waitFor("document.querySelector('#play-toggle') && !document.querySelector('#play-toggle').disabled");
  await delay(750);
  passed('页面与演示曲初始化');
  await screenshot('desktop-initial.png');
  assert.equal(await evaluate("[...document.querySelectorAll('img')].every(image=>image.complete&&image.naturalWidth>0)"), true);

  for (const track of ['mist-letter', 'orange-echo', 'night-signal']) {
    await click(`[data-track-id="${track}"]`);
    await waitFor("!document.querySelector('#play-toggle').disabled");
    await click('#play-toggle');
    await waitFor("document.querySelector('#play-toggle').classList.contains('is-playing')");
    const before = await evaluate("Number(document.querySelector('#progress').value)");
    await delay(600);
    const after = await evaluate("Number(document.querySelector('#progress').value)");
    assert.ok(after > before + .3);
    await click('#play-toggle');
    const pause = await evaluate("Number(document.querySelector('#progress').value)");
    await delay(220);
    assert.ok(Math.abs(await evaluate("Number(document.querySelector('#progress').value)") - pause) < .15);
    passed(`演示曲播放、暂停、切换：${track}`);
    await delay(650);
    await screenshot(`cover-${track}.png`);
  }

  await input('#volume', 23);
  assert.equal(await evaluate("document.querySelector('#volume-value').value"), '23%');
  await delay(200);
  assert.ok(Math.abs(await evaluate("__mooncutTestAudio.gains[0].gain.value") - .23) < .003);
  await input('#progress', 26.2);
  assert.ok(Math.abs(await evaluate("Number(document.querySelector('#progress').value)") - 26.2) < .2);
  passed('进度拖动与音量状态');

  await input('#clip-start', 10, 'change');
  await input('#clip-end', 30, 'change');
  assert.equal(await evaluate("document.querySelector('#progress').min"), '10');
  assert.equal(await evaluate("document.querySelector('#progress').max"), '30');
  await input('#progress', 29.7);
  await click('#play-toggle');
  const sourceRange = await evaluate("__mooncutTestAudio.sources.at(-1).__startArguments");
  assert.ok(Math.abs(sourceRange[1] - 29.7) < .01 && Math.abs(sourceRange[2] - .3) < .01);
  await delay(650);
  assert.equal(await evaluate("document.querySelector('#play-toggle').classList.contains('is-playing')"), false);
  assert.equal(await evaluate("Number(document.querySelector('#progress').value)"), 30);
  await input('#clip-start', 100, 'change');
  assert.equal(await evaluate("Number(document.querySelector('#clip-start').value)"), 30);
  assert.equal(await evaluate("Number(document.querySelector('#clip-end').value)"), 45);
  passed('片段起止限制、边界调整和结束自动停止');

  await input('#clip-start', 10, 'change');
  await input('#clip-end', 40, 'change');
  await input('#lrc-editor', '[00:05.00]边界外\n[00:12.00][00:18.50]月光信号\n[00:24.00]下一句');
  await click('#apply-lrc');
  assert.equal(await evaluate("document.querySelectorAll('.lyric-row').length"), 4);
  await click('.lyric-row[data-index="2"]');
  await delay(180);
  assert.ok(Math.abs(await evaluate("Number(document.querySelector('#progress').value)") - 18.5) < .1);
  assert.equal(await evaluate("document.querySelector('.lyric-row.active').dataset.index"), '2');
  assert.equal(await evaluate("document.querySelector('#lyric-main').textContent"), '月光信号');
  await click('.lyric-row[data-index="0"]');
  assert.equal(await evaluate("Number(document.querySelector('#progress').value)"), 10);
  await input('#lrc-editor', '[错误]这不是有效歌词');
  await click('#apply-lrc');
  assert.equal(await evaluate("document.querySelector('#lrc-message').classList.contains('error')"), true);
  assert.equal(await evaluate("document.querySelectorAll('.lyric-row').length"), 4);
  passed('LRC 多时间戳、当前句高亮、点击跳转、范围约束和明确错误');

  await attachFile('#lrc-file', 'assets/lyrics/orange-echo.lrc');
  await waitFor("document.querySelectorAll('.lyric-row').length === 8");
  passed('本地 LRC 文件导入');
  await evaluate("document.querySelector('.lyric-row[data-index=\"2\"] .lyric-text').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await input('.text-edit', '手动修改的一束光');
  await key('Enter', 'Enter', 13);
  assert.ok(await evaluate("document.querySelector('#lrc-editor').value.includes('手动修改的一束光')"));
  await evaluate("document.querySelector('.lyric-row[data-index=\"2\"] .lyric-time').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await input('.time-edit', '13.25');
  await key('Enter', 'Enter', 13);
  assert.ok(await evaluate("document.querySelector('#lrc-editor').value.includes('[00:13.25]手动修改的一束光')"));
  passed('单句文字与时间微调');

  for (const scene of ['moon', 'orbit', 'afterglow']) {
    await click(`.scene-card[data-scene="${scene}"]`);
    assert.equal(await evaluate("document.querySelector('#stage').dataset.scene"), scene);
    await delay(800);
    await screenshot(`scene-${scene}.png`);
  }
  await click('#play-toggle');
  const sceneAudioTime = await evaluate("Number(document.querySelector('#progress').value)");
  await click('.scene-card[data-scene="moon"]');
  await click('.scene-card[data-scene="orbit"]');
  await click('.scene-card[data-scene="afterglow"]');
  await delay(200);
  assert.equal(await evaluate("document.querySelector('#play-toggle').classList.contains('is-playing')"), true);
  assert.ok(await evaluate("Number(document.querySelector('#progress').value)") >= sceneAudioTime);
  await click('#play-toggle');
  await input('#progress', 13.4);
  await input('#accent-color', '#000000');
  await delay(180);
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#lyric-main .keyword')).color"), 'rgb(0, 0, 0)');
  assert.equal(await evaluate("document.querySelector('#accent-color').value"), '#000000');
  await input('#particles', 65);
  await input('#halo', 35);
  await input('#grain', 20);
  await click('[data-color="#e5a6b5"]');
  passed('三场景实时切换、配色和三项强度');

  await attachFile('#cover-file', 'assets/covers/orange-echo.svg');
  await waitFor("document.querySelector('#cover-preview').src.startsWith('blob:')");
  const directCover = await evaluate("document.querySelector('#cover-preview').src");
  await delay(750);
  await screenshot('cover-import-warm.png');
  const blue = (await readFile(path.join(root, 'assets/covers/mist-letter.svg'))).toString('base64');
  const purple = (await readFile(path.join(root, 'assets/covers/night-signal.svg'))).toString('base64');
  await evaluate(`(() => { const bytes=Uint8Array.from(atob('${blue}'),c=>c.charCodeAt(0)); const d=new DataTransfer(); d.items.add(new File([bytes],'自生成拖拽封面.svg',{type:'image/svg+xml'})); document.querySelector('#cover-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:d})); })()`);
  await waitFor(`document.querySelector('#cover-preview').src !== ${JSON.stringify(directCover)}`);
  const dropCover = await evaluate("document.querySelector('#cover-preview').src");
  await evaluate(`(() => { const bytes=Uint8Array.from(atob('${purple}'),c=>c.charCodeAt(0)); const d=new DataTransfer(); d.items.add(new File([bytes],'自生成粘贴封面.svg',{type:'image/svg+xml'})); document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d})); })()`);
  await waitFor(`document.querySelector('#cover-preview').src !== ${JSON.stringify(dropCover)}`);
  passed('本地封面、拖拽事件与剪贴板粘贴事件', '拖拽和粘贴用浏览器事件模拟；系统剪贴板待人工验证');

  await evaluate(`(async () => { const c=document.createElement('canvas'); c.width=c.height=800; const ctx=c.getContext('2d'); ctx.fillStyle='#fff5d5'; ctx.fillRect(0,0,800,800); ctx.fillStyle='#e6acb5'; ctx.fillRect(200,150,400,500); const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png')); const d=new DataTransfer(); d.items.add(new File([blob],'代码自绘明亮封面.png',{type:'image/png'})); document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d})); })()`);
  const purpleCover = await evaluate("document.querySelector('#cover-preview').src");
  await waitFor(`document.querySelector('#cover-preview').src !== ${JSON.stringify(purpleCover)}`);
  await delay(850);
  await screenshot('cover-import-bright.png');
  const readability = await evaluate("(() => { const m=document.querySelector('#lyric-main'),s=document.querySelector('#lyric-secondary'),song=document.querySelector('.stage-song'),r=m.getBoundingClientRect(),a=s.getBoundingClientRect(),b=song.getBoundingClientRect(); return {color:getComputedStyle(m).color,currentFits:m.scrollWidth<=m.clientWidth,secondaryFits:s.scrollWidth<=s.clientWidth,noOverlap:r.bottom<=a.top&&a.bottom<=b.top,lineCount:2}; })()");
  assert.equal(readability.currentFits, true);
  assert.equal(readability.secondaryFits, true);
  assert.equal(readability.noOverlap, true);
  passed('冷蓝、暖橘、紫夜与代码自绘明亮封面可读布局', '已截图；歌词最多两行、不溢出、不遮挡歌曲信息');

  await attachFile('#audio-file', 'assets/audio/orange-echo.wav');
  await waitFor("document.querySelectorAll('.track-card').length === 4 && !document.querySelector('#play-toggle').disabled");
  await input('#track-title', '本机合成的测试曲', 'change');
  await input('#track-artist', '测试创作者', 'change');
  await input('#clip-start', 5, 'change');
  await input('#clip-end', 35, 'change');
  await input('#lrc-editor', '[00:05.00]刷新后的月光\n[00:10.00]仍然留在本机');
  await click('#apply-lrc');
  await attachFile('#cover-file', 'assets/covers/orange-echo.svg');
  await waitFor("document.querySelector('#cover-preview').src.startsWith('blob:')");
  await delay(350);
  await command('Page.reload');
  await waitFor("document.querySelector('#player-title')?.textContent === '本机合成的测试曲' && !document.querySelector('#play-toggle').disabled");
  assert.equal(await evaluate("document.querySelector('#cover-preview').src.startsWith('blob:')"), true);
  assert.equal(await evaluate("Number(document.querySelector('#clip-start').value)"), 5);
  assert.ok(await evaluate("document.querySelector('#lrc-editor').value.includes('刷新后的月光')"));
  assert.equal(await evaluate("document.querySelector('#particles').value"), '65');
  assert.equal(await evaluate("document.querySelector('#volume').value"), '23');
  const restoredBinary = await evaluate(`(async () => {
    const session=JSON.parse(sessionStorage.getItem('mooncut.session.v1'));
    const track=session.tracks.find(item=>item.id===session.selectedId);
    const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('mooncut-session-assets');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
    const sizes=await Promise.all([track.audioAssetKey,track.coverAssetKey].map(key=>new Promise(resolve=>{const r=database.transaction('assets').objectStore('assets').get(key);r.onsuccess=()=>resolve(r.result?.size||0);}))); database.close(); return sizes;
  })()`);
  assert.ok(restoredBinary[0] > 7000000 && restoredBinary[1] > 1000);
  await click('#play-toggle');
  await waitFor("document.querySelector('#play-toggle').classList.contains('is-playing')");
  await click('#play-toggle');
  passed('本地音频导入与刷新恢复：音频、封面、曲目、歌词、片段、视觉、音量');

  await input('#lrc-editor', '');
  await click('#apply-lrc');
  await delay(120);
  assert.equal(await evaluate("document.querySelector('#lyric-main').textContent"), '本机合成的测试曲');
  passed('无歌词时的歌曲与情绪短句');

  const layouts = [];
  for (const [width, height] of [[1440, 1000], [1280, 800], [1024, 768], [820, 1000], [390, 844], [1280, 540], [390, 450]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.scrollTo(0, 0)');
    await delay(200);
    const geometry = await evaluate("(() => { const s=document.querySelector('#stage').getBoundingClientRect(), f=document.querySelector('.stage-fit').getBoundingClientRect(); return {ratio:s.width/s.height,width:s.width,height:s.height,fitWidth:f.width,fitHeight:f.height,inViewport:s.top>=0&&s.left>=0&&s.bottom<=innerHeight+1&&s.right<=innerWidth+1,overflow:document.documentElement.scrollWidth>innerWidth}; })()");
    assert.ok(Math.abs(geometry.ratio - 9 / 16) < .0001);
    assert.ok(geometry.width <= geometry.fitWidth + 1 && geometry.height <= geometry.fitHeight + 1);
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.inViewport, true);
    layouts.push({ viewportWidth: width, viewportHeight: height, ...geometry });
    await screenshot(`layout-${width}-${height}.png`);
  }
  passed('七种窗口舞台完整保持 9:16', '1440、1280、1024、820、390 宽；另含两种矮窗口');

  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await click('#clean-start');
  await waitFor("document.body.classList.contains('clean-mode')");
  await delay(3100);
  assert.equal(await evaluate("document.querySelector('#clean-hint').hidden"), true);
  const pure = await evaluate("(() => { const visible=[...document.querySelectorAll('button,input,textarea,dialog,.panel,.app-header')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0); const r=document.querySelector('#stage').getBoundingClientRect(); return {controls:visible.length,ratio:r.width/r.height,scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth,playing:document.querySelector('#play-toggle').classList.contains('is-playing')}; })()");
  assert.equal(pure.controls, 0);
  assert.equal(pure.scroll, false);
  assert.equal(pure.playing, true);
  assert.ok(Math.abs(pure.ratio - 9 / 16) < .0001);
  await screenshot('pure-stage.png');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await delay(200);
  assert.equal(await evaluate("document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth"), false);
  await screenshot('pure-mobile.png');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await key('Escape', 'Escape', 27);
  assert.equal(await evaluate("document.body.classList.contains('clean-mode')"), false);
  await key('h', 'KeyH', 72);
  assert.equal(await evaluate("document.body.classList.contains('clean-mode')"), true);
  await key('Escape', 'Escape', 27);
  passed('纯净模式、起点播放、自动隐藏退出提示、H/ESC 与无控件无滚动条');

  await click('#play-toggle');
  const rot1 = await evaluate("Number.parseFloat(document.querySelector('.stage-scene').style.getPropertyValue('--rotation'))");
  const pixels1 = await evaluate("Array.from(document.querySelector('#particle-canvas').getContext('2d').getImageData(0,0,1080,1920).data).filter((v,i)=>i%4===3&&v>0).length");
  await delay(500);
  const rot2 = await evaluate("Number.parseFloat(document.querySelector('.stage-scene').style.getPropertyValue('--rotation'))");
  const levels = await evaluate("['low','mid','high','vocal'].map(b=>Number.parseFloat(document.querySelector('.stage-scene').style.getPropertyValue('--'+b)))");
  assert.ok(rot2 !== rot1 && pixels1 > 0 && levels[0] > .07);
  passed('非空粒子画布、唱片连续旋转与低中高频驱动');

  await command('Network.setBlockedURLs', { urls: ['*mist-letter.wav'] });
  await click('[data-track-id="mist-letter"]');
  await waitFor("document.querySelector('#stage-error').hidden === false");
  assert.ok(await evaluate("document.querySelector('#stage-error').textContent.includes('画面仍在待机')"));
  const idle1 = await evaluate("document.querySelector('.stage-scene').style.getPropertyValue('--rotation')");
  await delay(300);
  const idle2 = await evaluate("document.querySelector('.stage-scene').style.getPropertyValue('--rotation')");
  assert.notEqual(idle1, idle2);
  await screenshot('audio-error.png');
  passed('音频加载失败中文提示与视觉待机持续运行');
  await command('Network.setBlockedURLs', { urls: [] });
  await click('[data-track-id="mist-letter"]');
  await waitFor("!document.querySelector('#play-toggle').disabled");

  await writeFile(path.join(output, 'broken-audio.wav'), Buffer.from('这是代码构造的解码错误测试文件，不是音频。'));
  await attachFile('#audio-file', '.verification/broken-audio.wav');
  await waitFor("document.querySelector('#stage-error').textContent.includes('音频无法解码') && !document.querySelector('#stage-error').hidden");
  const previousCover = await evaluate("document.querySelector('#cover-preview').src");
  await writeFile(path.join(output, 'broken-cover.svg'), Buffer.from('<svg>invalid xml'));
  await attachFile('#cover-file', '.verification/broken-cover.svg');
  await waitFor("document.querySelector('#cover-status').classList.contains('error')");
  assert.equal(await evaluate("document.querySelector('#cover-preview').src"), previousCover);
  const errorGeometry = await evaluate("(() => { const e=document.querySelector('#stage-error').getBoundingClientRect(),s=document.querySelector('.stage-song').getBoundingClientRect(); return {separate:e.bottom<s.top,lyricsHidden:getComputedStyle(document.querySelector('#lyric-display')).visibility==='hidden'}; })()");
  assert.equal(errorGeometry.separate, true);
  assert.equal(errorGeometry.lyricsHidden, true);
  passed('损坏音频解码与损坏图片错误处理', '保留原封面，错误提示与歌曲信息不重叠');

  const samples = 44100 * 7;
  const shortWav = Buffer.alloc(44 + samples * 4);
  shortWav.write('RIFF'); shortWav.writeUInt32LE(shortWav.length - 8, 4); shortWav.write('WAVE', 8);
  shortWav.write('fmt ', 12); shortWav.writeUInt32LE(16, 16); shortWav.writeUInt16LE(1, 20);
  shortWav.writeUInt16LE(2, 22); shortWav.writeUInt32LE(44100, 24); shortWav.writeUInt32LE(176400, 28);
  shortWav.writeUInt16LE(4, 32); shortWav.writeUInt16LE(16, 34); shortWav.write('data', 36);
  shortWav.writeUInt32LE(samples * 4, 40);
  for (let n = 0; n < samples; n++) {
    const value = Math.round(Math.sin(n / 44100 * Math.PI * 2 * 261.63) * 3000);
    shortWav.writeInt16LE(value, 44 + n * 4); shortWav.writeInt16LE(value, 46 + n * 4);
  }
  await writeFile(path.join(output, 'short-synthetic.wav'), shortWav);
  await attachFile('#audio-file', '.verification/short-synthetic.wav');
  await waitFor("!document.querySelector('#play-toggle').disabled");
  assert.equal(await evaluate("Number(document.querySelector('#clip-start').value)"), 0);
  assert.equal(await evaluate("Number(document.querySelector('#clip-end').value)"), 7);
  assert.ok(await evaluate("document.querySelector('#clip-message').textContent.includes('不足 15 秒')"));
  await input('#progress', 6.8);
  await click('#play-toggle');
  await delay(500);
  assert.equal(await evaluate("document.querySelector('#play-toggle').classList.contains('is-playing')"), false);
  passed('不足 15 秒的自生成音频', '使用完整 7 秒，中文提示，结束停止');

  await attachFile('#cover-file', 'assets/covers/mist-letter.svg');
  await waitFor("document.querySelector('#cover-preview').src.startsWith('blob:')");
  await evaluate("(async () => { const {SessionStore}=await import('./js/storage.js'); window.__mooncutOriginalPut=SessionStore.prototype.put; SessionStore.prototype.put=async function(){throw new Error('模拟本地存储空间不足');}; })()");
  const savedCoverURL = await evaluate("document.querySelector('#cover-preview').src");
  await attachFile('#cover-file', 'assets/covers/orange-echo.svg');
  await waitFor(`document.querySelector('#cover-preview').src !== ${JSON.stringify(savedCoverURL)}`);
  await delay(250);
  assert.ok(await evaluate("document.querySelector('#cover-status').textContent.includes('临时使用')"));
  assert.equal(await evaluate("(() => { const state=JSON.parse(sessionStorage.getItem('mooncut.session.v1')); return Boolean(state.tracks.find(track=>track.id===state.selectedId).coverAssetKey); })()"), false);
  await evaluate("(async () => { const {SessionStore}=await import('./js/storage.js'); SessionStore.prototype.put=window.__mooncutOriginalPut; })()");
  passed('素材保存失败的提示与临时封面', '不会误称新封面可在刷新后恢复');

  const exceptions = events.filter(event => event.method === 'Runtime.exceptionThrown');
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  const external = events.filter(event => event.method === 'Network.responseReceived' && /^https?:/.test(event.params.response.url) && !event.params.response.url.startsWith('http://127.0.0.1:8765'));
  assert.equal(external.length, 0);
  assert.ok(events.filter(event => event.method === 'Network.responseReceived' && /assets\/(audio|covers)\//.test(event.params.response.url)).every(event => event.params.response.status === 200 || event.params.response.status === 304));
  passed('无未捕获脚本异常，无外部网络请求');
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify({ browser: '本机 Edge headless / CDP', checks, layouts, exceptions, limitation: '音频输出设备听感、操作系统原生拖拽与真实剪贴板、录屏视频未验证。' }, null, 2));
  console.log(`已记录 ${checks.length} 项检查与截图：.verification/`);
} catch (error) {
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify({ checks, error: error.stack, events }, null, 2));
  if (socket?.readyState === WebSocket.OPEN) { try { await screenshot('failure.png'); } catch { /* 保留已有测试证据。 */ } }
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await command('Browser.close'); } catch { /* 浏览器关闭可能先断开调试连接。 */ }
    socket.close();
  }
  processHandle.kill();
}
