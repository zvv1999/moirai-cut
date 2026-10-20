# 彩纸庆祝 r4 通用轨迹升级与回归 · 2026-10-08

r3 三个正例长期呈现规则半圆，是模板重复缺陷。本轮先做未保存候选的同源规范画布对照，实际查看成片抽帧后保存 `style-study-20260928-celebrate` revision 4，再用原三份正例和同一负例回归。

## 通用定义

七片仍是分别可编辑的原生矩形，保留原绑定、语义触发、时间锚点与四色。调整为 13–25 px × 17–39 px 的不同粒径、非对称目标高度和左右范围、不同正反角速度，并将运动明确为紧凑出射、发散减速、逐渐下落和淡出。160 ms 入场、120 ms 退场映射到实际事件，定义里没有 case 的台词、词下标或固定时间。

规范 720 方形对照批次 `production-22ab4ff357946ea8a7ee65f0520fb909`，同一「完成，然后继续」TTS 原生 ASR、0.75 秒窗口。实际查看 r3 摘要、候选摘要/两张逐帧联系页/中帧；候选打破半圆、彩纸变轻，扩散和下落差异可见，尾部无残留。两份解码 PCM 相同。未连续实时观片/试听，也未给候选继承旧分数。

保存后通过原生投影复核元素、样式、composition、layouts、canvas 等视觉字段与已看候选一致。可移植定义另存 `scripts/templates/seeds/celebrate.json`（revision 0 供新库导入，不代表本地版本倒退）。

## 原应用回归

原 Application 仅 assetRevision 从 3 改 4，所有位置、尺寸、画幅、保持时间和 Sample 标注不变。三正例仍为既有 TTS 黑底，不能当作升级后的新输入泛化。

| 应用 | r4 批次 | 内部分数 |
|---|---|---:|
| completed | `production-329178f8cfc73235c8dc00a337e1d7e8` | 87 |
| confirmed | `production-0606d3d875b18bd0767c11d3a3ac8595` | 86 |
| milestone | `production-2c24f0701f9df9ace3caeea6f99aef3b` | 88 |
| advice-negative | `production-d9e85a4fae9ecd3b562fd2d9fbab580f` | 不评分 |

事件仍为 completed 0–0.75 秒、confirmed 2.62–3.77 秒、milestone 0.60–1.60 秒；各七片。真人负例实际是 Deborah 童年叙述，不是导师建议（原 r3 brief 的误标已保留并在历史纠正）；无新达成结果、keyword 全 null，r4 仍 0 粒。相邻成果复述与未来下一步均不重复触发。

四份输出正常 published，完整解码、源 SHA/原词与当前 transcript revision、输出/preview/测量 SHA、marker 1 / sampled / droppedRecords 0、工程 scenes/settings 回读全部通过。图形没有文本，空 records 不作为视觉通过依据。每粒按 30 fps 与原生 keytimes 采样旋转矩形边界，在画幅内；alpha 首尾为 0，事件后完整黑底帧亮度>20 的像素为 0。该采样不保证帧间数学极值或感知遮挡。

四对 r3/r4 解码 PCM 逐一相同，事件窗口与 Sample 逐字段相等，见 `r3-r4-regression.json`。当前历史沿原 context 的 r3 检查记录追加 r4 基线和检查，四份最终记录回读 restorable=true。

实际看帧范围：三个正例五阶段摘要、completed 第2页、confirmed 第3页、milestone 第2页联系页，以及负例联系页，详见 `visual-review-log.json`。没有声称逐张看完全部111个提取帧或连续播放。相较r3，运动提高到22/25；横屏的小粒子仍偏细，黑底留白和缺少真实成果画面限制了构图与适配分数。

## 当前评审与边界

原生系列 `style-review-series-f6acbf03e7c050cb81c4f5f723235db0718f399d34624fabec9bfa652bd95b35`，87/86/88，最低86，保存时 current=true、evidenceCurrent=true。listened=false、aestheticQualityVerified=false。r3系列已进入历史，不再代表当前版本；本轮没有把技术发布或比原版好等同达标。

仍缺：未参与调参的新输入、真人成果画面、不同明暗复杂背景、实际字幕叠加与整条路径遮挡、密集事件及连续视听。下一步应补这些内容证据，再按具体画面调整 Application 的位置/尺寸/密度；不继续把单例坐标写入定义。

证据入口 `/Users/zhengwei/Downloads/celebrate-r4-generalization-20261008/review.html`；候选比较 `/Users/zhengwei/Downloads/celebrate-r4-candidate-20261008/review.html`。报告链接均存在，原始定义/请求/输出/逐粒路径/历史/评审回执保留。未改主账本，未重启服务。
