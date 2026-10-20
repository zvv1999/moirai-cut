# 彩纸庆祝 r3 泛化验证 · 2026-10-08

冻结 `style-study-20260928-celebrate` revision 3。保持七个分别可编辑的矩形彩纸、四色及位移/旋转/透明度关键帧；只调整本次 Application 的整体尺寸、位置、最短展示和语义触发选择，没有写入人物、台词、固定时间特判。

| 应用 | 输入与画幅 | 实际事件 | 批次 | 内部分数 |
|---|---|---|---|---:|
| completed | 本地 TTS「完成，然后继续」，720×720 | 0–0.75 s；下一词 0.84 s | `production-46e21ca658cdc0d85f4e7b43fcc9e370` | 84 |
| confirmed | 本地 TTS 检查通过，1280×720 | 2.62–3.77 s；下一句 3.94 s | `production-463378a0625b340c5904dd8a135fe08d` | 85 |
| milestone | 本地 TTS 第一阶段完成，720×1280 | 0.60–1.60 s；下一段 1.92 s | `production-e27f5a4352bf5c42d066ce4e31a39acd` | 84 |
| advice-negative（保留原目录名） | Deborah 真人童年叙述，1280×720 | 无事件、0 彩纸 | `production-1df2ee5bf636ceadea92441f3f3ce707` | 不评分 |

三个正例为既有本地系统 TTS 加原生 ASR，不是三种真人背景。确认案仅取「都已通过」，阶段案仅取第一次完成，抑制相邻重复表达；未来「继续」「下一步」不触发。保留 ASR「交付→交互」「新的→新队」等差异，未重写时间或声称已听校。

负例原提交 brief 误写成导师建议；实际内容是拆坏哥哥的计算器而母亲没有生气的童年叙述，没有新达成结果。原 manifest 与 baseline 回执保留，`adaptation.json.metadataCorrection` 和后续原生应用历史明确纠正。所有 keyword 为 null，成片零彩纸。它验证本次标注下不触发，不能证明自动理解或真人正例遮挡安全。

## 验证与效果发现

四批均通过正常 production/author 和 renderer 发布；输出 SHA256、preview SHA256、textMeasurements.outputSha256 一致，marker=1、sampled、droppedRecords=0。纯图形没有文字测量记录，这是正确事实，不作为视觉通过证据。四份 MP4 全文件 FFmpeg 解码、源文件 SHA、原生 words 逐字段、transcript revision 及当前工程 scenes/settings 回读均通过。音轨存在、时长及技术指标验证通过，**未试听**。

每个正例七粒、总共三个事件；按导出 30 fps 加原生关键时间采样编译 Bezier，计算每片旋转矩形边界，全在画幅内。首尾 alpha=0；事件后完整黑底帧亮度超过 20 的像素数为 0。`particle-paths.json` 保留逐片坐标/角度/alpha 与包围盒。该采样不保证帧间数学极值，也不是脸/字幕像素碰撞检测。

共提取 111 帧。实际查看 completed/confirmed/milestone 五阶段摘要、completed 第一张联系页与中帧、confirmed 和 milestone 第二张联系页、负例联系页；精确范围写入 `visual-review-log.json`，没有声称逐张看完所有提取帧或连续实时观片。画面里彩纸干净、能够散开并退场，但七块长期保持过整齐半圆，旋转节奏同步，庆祝自然感不足。这个共同缺陷应通过通用粒子造型与运动升级解决，不能逐个案例调整来凑分。

## 原生记录与未完成项

当前系列 `style-review-series-097f10a3217d385fb305b33bd5a082e6d8f0acc44575d7d8964e1f4c7ed569f6`（以本地 `review-series-readback.json` 为精确记录），三个内部分数 84/85/84，未达 90。保存时 `current=true`、`evidenceCurrent=true`。四个 context 均沿 baseline head 保存完整 Application/Sample/生产证据，回读 `restorable=true`。`listened=false`、`aestheticQualityVerified=false`。

下一步：通用造型与运动候选采用非对称发散、不同角速度及减速—下落节奏，仍保留每粒可编辑；先与 r3 对照，再决定是否发布新 revision 和回归三原案。真人完成语义、复杂背景、脸与字幕遮挡、密集事件及连续观片试听尚缺，不能从黑底正例推断通过。

证据入口：`/Users/zhengwei/Downloads/celebrate-generalization-20261008/review.html`。同目录保存冻结定义、4 套 Application/原生输入/Sample/manifest/回执/成片/验证/应用历史、路径采样、原生系列评审和实际看帧记录。39 个报告内本地链接均存在。未改主账本，未重启服务。

后续已实际查看候选并升级为 r4，详见 [r4 通用升级与回归](celebrate-r4-generalization-20261008.md)。r3 评审回读 current=false、evidenceCurrent=true，保留历史成片和原分数，不作为当前样式评分。
