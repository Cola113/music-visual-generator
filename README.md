# 月相切片

一张唱片，承载一段歌词、一种情绪和一首歌最值得记住的几十秒。

原生浏览器音乐视觉工作台。左侧选择声音、封面和片段，中央是完整的 9:16 舞台，右侧编辑歌词和视觉。无需框架、构建、npm 或 pip；浏览器只向本地静态服务请求仓库文件，不会上传导入素材。

## 打开

在仓库根目录运行：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8000/>。入口是根目录 `index.html`，请勿通过 `file://` 打开。演示音频用 `fetch` 获取，再由 Web Audio 解码。端口被占用时改成其他端口即可。

推荐桌面版新版 Edge 或 Chrome。初次播放必须点击播放按钮或使用播放快捷键，以满足浏览器的音频手势要求。小窗口会重排编辑面板，舞台始终完整保持 9:16。舞台逻辑尺寸为 1080×1920，屏幕实际像素由窗口与缩放比例决定。

## 创作与录屏

1. 选择演示曲，或导入本地 WAV、MP3 等浏览器支持的音频。导入后可修改歌名与艺术家。
2. 修改片段开始和结束秒数。正常音频保持 15–60 秒；不足 15 秒的音频保留整段。开始、结束、播放进度和歌词跳转都受片段范围限制，结束时自动暂停。
3. 点击封面区上传图片，拖入图片，或粘贴剪贴板中的图片。PNG、JPEG、WebP 和有效 SVG 均可。文字粘贴仍按普通编辑处理。
4. 粘贴 LRC 并点击「应用歌词」，也可导入 UTF-8 `.lrc` / `.txt`。时间以整首歌曲为基准，无需减去片段起点。点击歌词列表跳转；双击单句时间或文字修改，Enter 或失焦提交，ESC 取消。清空编辑框后应用，会恢复歌名与情绪短句。
5. 切换「唱片月相」「歌词轨道」「情绪残影」「口袋夜舞」，调整主题色、粒子、光环和胶片强度。
6. 点击「从片段起点进入纯净模式」，或按 `H` 进入后按 `R` 从起点播放。退出提示约 3 秒后消失，再开始录屏；需要准确录到起点时，在提示消失后按 `R`。使用浏览器或系统录屏工具，选择系统声音，并按舞台边界裁剪为 9:16。片段结束后按 `ESC` 返回。

快捷键：`H` 切换纯净模式；`ESC` 退出纯净模式；`空格` 播放 / 暂停；`R` 从片段起点播放。输入框编辑时不触发播放快捷键。纯净模式保留舞台，隐藏所有编辑器、按钮、错误浮层和滚动条。

网页工作台没有 MediaRecorder、MP4 编码、自动上传、自动发布、账号、批量渲染或定时任务。录屏质量与系统声音采集由外部录屏工具决定。仓库另附下述离线视频渲染脚本。

## 离线视频样片

`exports/` 保存《Sway My Way》的唱片月相样片及预览图。v4 为 1080×1920、30 fps、36.6 秒，截取原曲 73.4–110.0 秒，保留唱片与月相波形，标题和歌手置于上方，歌词上移到唱片下方的留白区。v5 恢复第一版的整句节奏，并加入英文中心展开、中文延迟跟进、轻微光扫和柔和退场；外圈波形响应音乐频谱，唱片匀速自转，背景渐变、星尘和环境曲线独立慢速运动。v6 在同样的内容和动效上重新安排手机安全区：标题组下移、主标题更醒目、歌手行拉开间距，唱片同步下移，为系统状态栏和平台导航留出空间。v7 使用用户提供的 QQMusic 本地 `_qm.qrc` 原文和 `_qmts.qrc` 翻译，按 QRC 毫秒起点重新计算片段内 cue，保留 v6 的视觉和歌词过渡。成片音频仍使用 `Music/Sway My Way.mp3`。

- [第二版 MP4](exports/sway-my-way-moon-phase-v2.mp4)
- [第二版预览图](exports/sway-my-way-moon-phase-v2-poster.jpg)
- [第三版 MP4](exports/sway-my-way-moon-phase-v3.mp4)
- [第三版预览图](exports/sway-my-way-moon-phase-v3-poster.jpg)
- [第四版 MP4](exports/sway-my-way-moon-phase-v4.mp4)
- [第四版预览图](exports/sway-my-way-moon-phase-v4-poster.jpg)
- [第五版 MP4](exports/sway-my-way-moon-phase-v5.mp4)
- [第五版预览图](exports/sway-my-way-moon-phase-v5-poster.jpg)
- [第六版 MP4](exports/sway-my-way-moon-phase-v6.mp4)
- [第六版预览图](exports/sway-my-way-moon-phase-v6-poster.jpg)
- [第七版 MP4](exports/sway-my-way-moon-phase-v7.mp4)
- [第七版预览图](exports/sway-my-way-moon-phase-v7-poster.jpg)

当前主题曲《Dancing with my phone》使用封面中的亮黄、湖蓝和珊瑚红，配合手机轮廓、通知光点和节拍柱，形成「Pocket Night / 口袋夜舞」场景。默认片段为原曲 02:02.49–02:32.49 的副歌，离线样片为 1080×1920、30 fps、30 秒：

- [Pocket Night MP4](exports/dancing-with-my-phone-pocket-night.mp4)
- [Pocket Night 预览图](exports/dancing-with-my-phone-pocket-night-poster.jpg)

渲染代码在 `video/`：`analyze.py` 用 PyAV 和 NumPy 生成逐帧频谱，`render.html` / `render-v3.html` / `render-v4.html` / `render-v5.html` / `render-v6.html` / `render-v7.html` 绘制确定性的画面，`render.mjs` / `render-v3.mjs` / `render-v4.mjs` / `render-v5.mjs` / `render-v6.mjs` / `render-v7.mjs` 用 Playwright、Edge 和 FFmpeg 合成 H.264 / AAC 视频。该脚本独立于网页工作台，需要上述工具；脚本中的本机默认路径可通过 `MOONCUT_PLAYWRIGHT`、`MOONCUT_EDGE`、`MOONCUT_FFMPEG` 覆盖。`MOONCUT_PLAYWRIGHT` 指向包含 `index.mjs` 的 Playwright 包目录，其余两个变量指向可执行文件。

原始音频与封面由用户提供，放在仓库同级的 `Music/`，文件名分别为 `Sway My Way.mp3` 和 `ab67616d0000b2737d14546dbde66888952efaf2.jpg`。它们不属于下面的原创演示素材；渲染依赖和原始素材需要在本机准备。

```powershell
python video/analyze.py "../Music/Sway My Way.mp3" video/sway-envelope-v2.json --start 73.4 --duration 36.6 --fps 30
node video/render-v3.mjs
# 生成歌词上移后的第四版
node video/render-v4.mjs
# 生成整句高级过渡的第五版
node video/render-v5.mjs
# 生成顶部安全区重新排版的第六版
node video/render-v6.mjs
# 使用本地 QQMusic QRC 时间重新对齐歌词的第七版
node video/render-v7.mjs
```

第二版至第七版共用 `video/sway-envelope-v2.json` 频谱数据。`render-v4.mjs` 使用 `render-v4.html` 渲染逐词歌词；`render-v5.mjs` 使用 `render-v5.html` 恢复整句歌词，并加入中心展开、中文延迟和慢速背景动效；`render-v6.mjs` 使用 `render-v6.html` 增加手机顶部安全区排版；`render-v7.mjs` 使用 `render-v7.html` 应用本地 QRC 的逐句时间和中英歌词。临时帧位于被 Git 忽略的 `.verification/`，完成后会自动删除临时帧并进行完整解码检查。

本地 QQMusic 歌词可用 `video/qrc_decrypt.py` 复用解密：它内置 QMC1 XOR 和不校正 DES 奇偶位的 3DES-ECB，不依赖 PyCryptodome、OpenSSL 或 .NET。输入 `_qm.qrc`、`_qmts.qrc` 或 `_qmRoma.qrc`，输出分别是原文 XML、翻译 LRC 或音译内容：

```powershell
python video/qrc_decrypt.py "G:\QQMusicCache\QQMusicLyricNew\歌曲_qm.qrc" -o .verification\lyrics.xml
python video/qrc_decrypt.py "G:\QQMusicCache\QQMusicLyricNew\歌曲_qmts.qrc" -o .verification\lyrics-translation.lrc
```

## 小红书封面

艺术版封面只保留三个角的文字：左上角为作品编号，左下角为中文风格，右下角为英文风格；中间不叠加歌名和歌手，让唱片月相成为唯一主体。当前作品为 `001`，下一张使用 `002`，编号由渲染命令的第二个参数传入：

```powershell
# 当前作品
node video/render-cover.mjs art 001
# 下一张作品
node video/render-cover.mjs art 002
```

这首歌的艺术版首稿使用独立模板和编号 `002`，避免复用旧示例曲目的 Sway My Way 素材：

```powershell
node video/render-dancing-cover.mjs 002
```

输出为 `exports/dancing-with-my-phone-xiaohongshu-cover-002.png` / `.jpg`。

输出文件会按编号保存为 `exports/sway-my-way-xiaohongshu-cover-001.png` / `.jpg` 或对应的 `002` 文件。`video/cover.html` 已将唱片主体略微放大并上移，以适应移除中间大字后的留白构图；`cover-promo.html` 仍保留宣传版模板，需要宣传文案时单独使用 `promo` 版本。

## 确认版视频制作流程

以后制作同类音乐可视化视频，默认沿用第七版的流程与验收标准：

1. **素材与选段**：使用用户提供的音频和封面；有官方歌词视频时只用它核对歌词出现时间，最终成片音频仍使用用户指定的音频文件。优先选择副歌或情绪最完整的片段，并先确定固定时长、画幅和起始时间。
2. **视觉主体**：保留唱片月相作为主视觉。唱片保持匀速旋转，只有外圈波形响应音乐；背景渐变、星尘和曲线做非常慢的独立运动，避免唱片和背景随音频抽搐。
3. **文字层级**：顶部只保留带书名号的歌名和歌手；歌词放在唱片下方的留白区。歌词采用中英对照的整句显示，英文先出现、中文稍后跟进，句末不加句号，不加入封面专用的宣传文字。
4. **歌词动效**：使用整句中心展开、轻微光扫、短暂柔焦和柔和退场；不使用逐词变色或逐词跳动。优先读取用户提供的本地 QQMusic QRC：`_qm.qrc` 提供原文 XML 的毫秒起点，`_qmts.qrc` 提供翻译 LRC；将整首歌时间减去片段起点后写入整句 cue，发现局部误差时优先调整整句 cue，而不是拆成逐词 cue。
5. **渲染与交付**：先生成频谱数据，再运行对应版本的 Playwright + Edge + FFmpeg 渲染脚本。交付 MP4 和预览图，并核对分辨率、帧率、时长、音视频流、完整解码和本地 HTTP 访问；临时抽帧放在 `.verification/`，检查后清理。

## 演示素材

**三首演示音频、三张封面与配套歌词均为「自生成、可随仓库分发」。** 标题、艺术家和歌词是本项目原创虚构内容。音频完全由 Python 标准库合成正弦和声、琶音、噪声鼓声与立体声延迟；封面是代码绘制的 SVG。不包含下载的歌曲、歌词、采样、照片或第三方图片。演示曲为器乐合成，配套歌词用于检验舞台排版与时间同步。

| 曲目 / 虚构艺术家 | 情绪 / 封面 | 默认片段 | 默认场景 |
| --- | --- | --- | --- |
| 雾港来信 / 遥屿 | 冷蓝氛围电子 / 月与雾港 | 08–38 秒，30 秒 | 唱片月相 |
| 橘色回声 / 未眠电台 | 暖橘怀旧慢拍 / 日落与山线 | 06–41 秒，35 秒 | 情绪残影 |
| 夜航信号 / 棱镜计划 | 紫夜律动合成器 / 星与轨道 | 12–42 秒，30 秒 | 歌词轨道 |

每首均为 45 秒、44.1 kHz、16-bit、双声道 WAV，约 7.94 MB。重新生成全部素材与曲目清单：

```powershell
python scripts/generate_assets.py
```

只有 Python 标准库，没有安装步骤。生成耗时取决于 CPU。

## 文件地图

```text
index.html                     中文工作台与纯净舞台入口
css/workspace.css              三栏布局、响应式规则、四场景与切句样式
js/app.js                      界面事件、导入、编辑、曲目状态与会话恢复
js/audio.js                    fetch / 解码、片段音源、音量、频段分析
js/lyrics.js                   LRC 解析、序列化、定位与片段边界
js/visuals.js                  唱片、画布粒子、颗粒、平滑频段与两行歌词
js/storage.js                  sessionStorage 设置与 IndexedDB 二进制
js/demo-tracks.js              生成的三首曲目清单与默认设置
js/featured-track.js           主题曲《Dancing with my phone》与口袋夜舞设置
assets/audio/*.wav             三首自生成演示曲
assets/audio/dancing-with-my-phone.mp3 用户提供的主题曲副本
assets/covers/*.svg            三张代码自绘封面
assets/covers/dancing-with-my-phone.jpg 用户提供的主题封面副本
assets/lyrics/*.lrc            演示歌词与主题曲翻译歌词
assets/icon.svg                自绘月相图标
scripts/generate_assets.py     Python 标准库素材生成器
scripts/format_css.mjs         可选 CSS 阅读格式化工具
tests/core.mjs                 LRC、片段和 WAV 格式检查
tests/browser.mjs              无额外依赖的本机 Edge CDP 验收
.verification/                本机测试报告、截图、隔离浏览器资料，已忽略
```

运行网页不需要 Node。Node 24+ 仅用于可选的自动验证工具。

## 状态与视觉

统一曲目结构：

```js
{
  id, title, artist, audioUrl, coverUrl,
  clip: { start, end },
  lyrics: [{ time, text }],
  visual: {
    scene: 'moon', // moon / orbit / afterglow / pocket
    accentColor: '#86d8df',
    intensity: { particles: 0.42, halo: 0.62, grain: 0.17 }
  }
}
```

三个强度控件都写回 `visual.intensity`，不存在独立场景播放器。低频驱动光环与唱片呼吸，中频驱动粒子扩散，高频驱动星尘、细线与高光，所有频段按时间平滑插值。暂停或加载失败时转为低强度待机，不停止视觉循环。情绪残影减小运动幅度与转速。

歌词当前句清晰，关键词适度强调；切句时上一句短暂保留为残影，随后由下一句接替。舞台总计最多两行，不做逐字卡拉 OK。长句按容器宽度缩小；建议用短句获得更好的录屏可读性。

`sessionStorage` 保存当前曲目、每首曲目的片段 / 歌词 / 未应用草稿 / 视觉、音量与播放位置。`IndexedDB` 按本标签页的会话标识保存导入音频与封面二进制，刷新后创建新的 blob URL；音频恢复后保持暂停，不自动出声。素材只在本机处理。关闭标签页后设置不作为长期项目保留；IndexedDB 中的旧二进制可能保留到浏览器清理网站数据，后续新会话不会读取旧会话的素材。更换主机名或端口会形成不同的存储来源。

## 实际验证

已在本机 Edge headless 的真实网页中运行 23 组检查，并人工查看桌面、手机、四场景、三色封面、明亮封面和纯净舞台截图。验证记录为 `.verification/browser-report.json` 与同目录 PNG；该目录不进入 Git。

| 验收项 | 验证结果 |
| --- | --- |
| 页面、CSS、JS、三首 WAV / SVG / LRC | HTTP 加载与解码通过；无未捕获脚本异常，无外部网络请求 |
| 演示曲播放、暂停、切换、进度与音量 | 三曲通过；实际播放时间推进、暂停停止，GainNode 增益同步 |
| 本地音频与封面 | 本地 WAV / SVG 文件选择器导入通过，导入后可播放 |
| 拖拽 / 剪贴板封面 | 浏览器 DragEvent / ClipboardEvent 分别模拟 SVG、PNG 导入通过；原生系统操作未验证 |
| 片段限制 | 最小 / 最大长度、音频边界、进度约束与自动停止通过；检查实际音源 start 的偏移与持续时间 |
| LRC | 多时间戳、偏移、解析错误、当前高亮、点击跳转、范围约束、单句时间 / 文字修改、本地文件导入通过 |
| 会话恢复 | 同标签刷新恢复导入音频、封面、曲目、歌词、片段、三项强度、主题与音量；实际检查 IndexedDB 二进制 |
| 四场景 | 即时切换通过，切换过程中播放继续 |
| 歌词对比与布局 | 冷蓝、暖橘、紫夜、明亮自绘封面截图检查通过；两行不溢出、不重叠；黑色自定义主题自动提高关键词亮度 |
| 舞台比例 | 1440×1000、1280×800、1024×768、820×1000、390×844、1280×540、390×450 完整保持 9:16，舞台不超出视口，无横向溢出 |
| 纯净模式 | 起点播放、H / ESC、退出提示自动隐藏通过；桌面和手机无编辑控件与滚动条 |
| 动态与错误 | 非空画布、持续平稳旋转、实际频段变化通过；模拟音频请求失败后中文提示和待机动画继续 |
| 异常素材与短音频 | 损坏音频显示中文解码错误；损坏图片保留原封面；7 秒自生成短音频使用整段并自动停止 |
| 存储失败 | 模拟二进制保存失败后提示临时使用，并清除失效的封面恢复标识 |
| 第一秒与画面观感 | 首屏无需播放就有唱片、月环与待机光；截图观察效果克制、文字清楚、纯净舞台干净；离线样片另见上节 |

复现核心检查：

```powershell
node tests/core.mjs
```

复现浏览器检查，需要本机 Edge 和 8765 端口的本地服务；测试会使用 9224 调试端口及仓库内隔离资料目录，运行结束自动关闭测试浏览器：

```powershell
# 在一个终端启动静态服务
python -m http.server 8765 --bind 127.0.0.1

# 在另一个终端运行
node tests/browser.mjs
```

可用 `MOONCUT_EDGE` 指定 Edge 可执行文件位置。测试只使用仓库自生成素材与画布绘图。

## 已知限制与未验证项

- 未通过扬声器人工试听、未验证真实操作系统剪贴板与原生拖拽、未验证系统录屏。离线样片已生成并检查预览帧及完整解码；合成事件验收不能替代系统级操作。
- 人声区域亮度基于 300–3400 Hz 能量估算，会受到器乐影响；不是人声分离或识别，也不自动生成歌词。
- 解码完整音频会占用内存；音频限制 150 MB，封面限制 25 MB，LRC 文件限制 1 MB。浏览器不支持的音频或损坏文件会显示中文错误。
- LRC 使用 UTF-8；不包含 GBK 自动探测、增强 LRC 逐字标签或自动歌词识别。无效标签会提示错误并保留已应用歌词。
- 很长的歌词会缩小文字，不适合录屏；导入封面采用居中裁切，不提供图像裁剪编辑器。
- 系统或浏览器阻止存储、空间不足时会给出明确提示；这种情况下临时素材的刷新恢复不能保证。
- 未验证 Safari、Firefox、iOS、其他机器的字体与性能。低性能设备或后台标签页可能降低动画帧率，录屏请保持页面前台。
- 不内置视频导出、发布、上传或账号，不会创建 Git 远程、push 或 Pull Request。
