# 剪辑工程导出

入口：编辑器右上角 **导出 → 工程互通**。导出当前场景的内存快照，包含尚未自动保存的编辑；不会改写原工程或时间线。

| 目标 | 入口文件 | 继续编辑方式 |
| --- | --- | --- |
| Premiere Pro / DaVinci Resolve | `timeline.xml`（FCP7 XML / xmeml v4） | 导入 XML 时间线 |
| Final Cut Pro | `timeline.fcpxml`（1.10） | 文件 → 导入 → XML |
| 剪映专业版 | `draft_info.json`、`draft_content.json`、`draft_meta_info.json` | 添加到本机草稿库，重启剪映 |
| CapCut | 同上，使用 CapCut 的应用标识 | 添加到本机草稿库，重启 CapCut |

现有的已保存版本 FCPXML 导出与逐项兼容性报告保留在同一页面的折叠入口中，继续执行保存与 revision 校验。上方工程包导出捕获当前内存快照。

## 交付内容

导出目录在 `<OPENCUT_PROJECTS_DIR>/<projectId>/exports/nle-<uuid>/`，旁边保存完整 ZIP。页面支持下载与重新打开历史导出。ZIP 以流式响应下载，避免把整个素材包加载到服务器内存。

- `media/`：复制原素材与渲染后的兼容素材。复制不使用硬链接，外部软件修改媒体不会改动 Moirai 原文件。
- `subtitles.srt`：文字内容与时间，供目标软件另外导入。导入 SRT 时注意不要与已保留的文字画面重复显示。
- `source-project.json`、`source-media-index.json`：导出时的原工程快照和媒体索引。需要恢复 Moirai 工程时，将快照另存为 `project.json`、索引放到 `media/index.json`，保留媒体相对布局。
- `export-report.json`：逐项列出转换及渲染说明。
- `README.txt`：对应软件的导入步骤。

素材路径为本机绝对路径。同机可以直接导入入口文件；跨电脑需解压整个包并重新链接 `media/`。剪映／CapCut 的“添加到本机草稿库”读取应用配置的草稿位置，创建新的独立目录并重写其中的素材路径，不覆盖已有草稿。

## 编辑能力与转换边界

| 内容 | 处理 |
| --- | --- |
| 原视频／图片、剪切点、源素材入点、多轨、间隙 | 保留为独立片段；重叠片段分配独立轨道 |
| 位置、均匀缩放 | 换算 Moirai 的 contain 适配比例后写入目标格式 |
| 原声音量、隐藏、静音、独奏 | 保留状态；剪映／CapCut 的简单原声跟随视频，处理过的声音独立放置，避免重复播放 |
| 基础文字 | FCPXML／剪映／CapCut 为可编辑文字；字体、换行和字效可能不同，报告提示核对 |
| Premiere 的文字 | 渲染为透明 PNG／视频，同时提供 SRT |
| 旋转、裁切、镜像、不透明度、关键帧、特效、遮罩、变速 | 使用编辑器同一渲染器生成独立素材；静态内容用 PNG，动态内容用带 Alpha 的 ProRes 4444。保留片段剪切能力，内部效果不再独立 |
| 可变帧率、XML 导出中的混合帧率视频 | 渲染到工程帧率；XML 混合帧率原声同时转为 WAV，避免不同软件对源帧数的解释差异 |
| 音频淡入淡出、动画或变速 | 使用编辑器音频渲染器生成逐片段 PCM WAV，避免目标软件包络语义差异 |
| 跨轨混合／效果、转场、复合片段、模糊背景 | 合成为整段画面；复合片段的音频用整段混音，其他情况保留音频片段 |
| 素材缺失、非法时间、低于一帧的片段 | 报错，不静默省略 |

时序以 120000 ticks/s 转换，首尾分别量化到工程帧率，相邻剪切点共用同一边界。FCPXML 使用有理数秒；剪映使用微秒。Premiere XML 仅接受整数帧率或 1000/1001 帧率，避免隐式更换帧率。

这不是原生 `.prproj` 导出，也不是对全部编辑器功能的无损往返。剪映／CapCut 的草稿结构不是公开稳定接口，必须用实际交付版本验证。OpenFilm 的序列化约定作为参考，保留 MIT 声明于 `rust/crates/project-export/THIRD_PARTY_NOTICES.md`；参考版本为 `fce7879e1e5aae20098434eaf1d3e2e03043b2ac`。

## 实现与运行

- `rust/crates/project-export`：时间线计划、兼容性判断、XML/FCPXML/草稿序列化。
- Web：渲染、文件系统、FFmpeg、浏览器交互适配；所有格式共享 Rust 的同一计划。
- `/api/project-interchange/:projectId`：prepare → 上传渲染分片 → finish；DELETE 清理未完成导出；GET 读取历史／下载 ZIP；install 创建本机草稿。
- 依赖：Rust/Cargo（开发时首次调用编译）、FFmpeg/ffprobe、`zip`。部署可设置 `MOIRAI_PROJECT_EXPORT_BIN` 指向预编译二进制；现有 `FFMPEG_BIN`、`FFPROBE_BIN` 和新增 `ZIP_BIN` 支持显式路径。Windows 需要可用的 zip 可执行程序。
- 导出与视频导出共享后台任务进度及取消入口。取消或失败清理未完成目录；完成结果持久化，重试不会重复编码，丢失 HTTP 响应不会删除已完成交付。

## 验证

```sh
cargo test -p moirai-project-export
cargo clippy -p moirai-project-export --all-targets -- -D warnings
cd apps/web
bun test src/server/__tests__/project-interchange.test.ts
bun --bun node_modules/typescript/bin/tsc --noEmit
```

原生测试使用 FFmpeg 构造媒体，验证四种格式、XML 语法、ZIP 完整性、素材复制、草稿路径重写、透明 ProRes 解码、缺帧失败、重试、取消和路径边界。集成测试需要 `ffmpeg`、`ffprobe`、`zip`、`unzip`、`xmllint`。

浏览器验收使用独立测试工程，检查导出入口、格式切换、真实画面渲染、完成报告、历史恢复和取消状态。

### 2026-10-26 剪映 11.1.0 原生验收

本机应用为 `/Applications/VideoFusion-macOS.app`（bundle ID `com.lemon.lvpro`）。使用本地调饮素材创建独立测试工程。通过 Moirai 页面导出并添加到草稿库，重启剪映后打开、播放完整时间线，再由剪映界面输出 MP4。

- 工程：1080×1920、30 fps、12 秒；3 个原视频片段、3 段可编辑文字、1 条独立配乐，切点为 4 秒和 8 秒。第二镜头的缩放与横向位置保留，素材路径全部有效。
- 画面：最终原生输出为 H.264、360 帧，完整解码无错误、没有全黑帧；核对首尾、两个切点前后及 1／5／9 秒代表帧。文字尺寸修正后，“慢慢品尝”的白色字形范围为 332×78 px，Moirai 参考版为 332×79 px；字体渲染和基线仍略有差异。
- 声音：原声与独立配乐均在输出中。单声道上混补偿后，三个片段与参考混音的 RMS 差分别为 −0.005／−0.050／−0.005 dB，输出峰值 −17.64 dBFS，无削波。剪映原声与对应源素材的相关峰延迟为 0 ms。Moirai 参考 MP4 相对剪映存在约 49.3 ms 的固定偏移，三段没有累计漂移；这不是逐样本一致性验收，也未替代人工监听。剪映 AAC 流长 11.9815 秒，视频流长 12 秒。
- 本轮修复：导入时显示名不能改变媒体扩展名／MIME；剪映文字按画布宽度换算字号；补偿剪映与 Moirai 的单声道上混差异；草稿目录包含工程名，避免本机草稿列表只显示 UUID。补偿写入转换报告，立体声与已渲染 WAV 不重复加增益。
- 验证：18 个 Rust 测试、6 个真实媒体导出集成测试、2 个 MCP 导入测试通过；Rust clippy、Web 类型检查及修改文件 ESLint 通过。

可复查证据位于本地 `artifacts/jianying-acceptance-20261026/`：`acceptance.json`、可重跑的 `check.py`、Moirai 导出完成截图、剪映时间线截图、代表帧及最终 MP4。测试工程、原素材与验收媒体保留在本地，不随源码提交。

已知验收边界：播放到终点后的一次剪映原生输出只有 359 帧；不修改工程、将播放头移到中间重新导出后得到 360 帧，交付文件使用后者，原因尚未确定。附加的纯文字横屏校准草稿在准备导出时曾停留于模态遮罩，重启恢复；不把该样本计为通过。本次结论限于上述真实素材工程与剪映 11.1.0 macOS，Premiere、Final Cut Pro、Resolve、CapCut 尚未完成目标应用中的实际导入验收。
