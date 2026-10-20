# 青色强调：浅青字面与硬影候选 AB

2026-10-08。当前保存样式 `style-study-20260928-cyan-impact` revision 3 及原 89 / 89 / 89 系列不变。本轮只产出**一个未保存材质候选**，没有升级 revision、提交新分数或改主账本。

[查看两个真实背景的正常生产 AB](/Users/zhengwei/Downloads/cyan-material-candidate-20261008/review.html)。

## 观察与设计假设

当前 Alex 紫色几何背景与 Deborah 浅墙背景的正式 390px 帧，青色填充和深描边清楚，但更像普通单色字幕标注，材质层次弱。候选在同一原生文字图层上改成浅青字面 `#78EBF3`、较细的深青轮廓 `#12373F`、向下的深蓝硬影 `#0B2830`。设计尺寸下描边 4px，阴影 (1,6)px、blur 0、opacity 1；由原 Application 比例同比换算，不按演员或具体词分支。

保留 PingFang SC / 900、原始字号、自然字形比例、行高和排版。90ms 入场、1.06 峰值与 40ms 退出全部不改，以便单独观察材质收益。字幕仍为原生可编辑文字，描边/阴影/透明度可编辑，未烘焙为图片，也未新增模型字段。

独立保存本地 `candidate-definition-unsaved.json` 及两个候选模板，不将它们登记为原 r3 的精确样式应用。候选更改了风格，未来采用时需要明确保存与重新评审。

## 对照约束与真实生产

沿用 `direct-overlay` 的精确 Application 和完整 Sample，各字段逐项相等。没有移动坐标、改整体大小、删词或延长事件；全部原声音、各自输入的所有原对齐词与时间完整保留。此轮是已有背景上的受控开发对照，不是未见语料泛化。

| 来源 | 生产批次 | A/B 项目后缀 | 内容 |
| --- | --- | --- | --- |
| Alex | `production-c224cf6d74ee5ae080404a4e793b51ca` | `tpl-preview-4baea8ac686319a4674a3814612b20cd-0-0` / `-1-0` | June / sun |
| Deborah | `production-02509fa8f261c722c5e0010440e554ad` | `tpl-preview-b85ba415ef3068e67dc61a9ee2625273-0-0` / `-1-0` | anything / calculator |

两批各 A/B 两项，共四份正常生产、独立工程与完整成片，全部 published。A 使用当前 r3 的精确投影，只有生产模板 ID/name 改为本轮标识；B 从同一投影仅改材质字段。不是 FFmpeg 另做字幕冒充原生渲染。

## 验证结果

- 四片完整解码通过；Alex 各 420 帧，Deborah 各 210 帧。成片 SHA 与测量输出 SHA、生产记录一致。
- 原源文件 SHA、全部原对齐词与时间、完整 Application/Sample、可编辑工程 scenes/settings 已读回核对。
- A/B 字形实际字号、字体声明、glyph 宽高、行数、换行与溢出结果相同。390px 显示：Alex 23.994px；Deborah 25.137px，均未缩字。
- 描边减细会让编译 `text.maxWidth/maxHeight` 各增加两倍描边差；本轮实际字形及换行未变。这不证明任意长词的布局都不受影响，不能删除旧六词长从句失败。
- 四事件的所有原生几何姿态记录，时间、样本数量、position、scaleX/Y、rotation 均逐项 A/B 相同。编译关键帧也一致；measurement `geometryCoverage=constant_record_pose_v1`、`droppedRecords=0`。
- 完整动作保守范围含 1.06 峰值、描边与硬影偏移，未越画框、未交叠原人工保护区。该结果不声称自动人物识别。
- 实际稳定帧首末相隔：Alex 两事件各 1.066667s；Deborah 各 1.633333s。原编译稳定段仍分别 1.12s / 1.67s，两种口径分开保留。每事件均有真实编码淡出帧及消失后空帧；保持原阅读预算。
- 每个来源 A/B 整段 44.1kHz 双声道 s16le PCM 的 SHA 与字节数一致，未修改音轨。未试听、未连续播放，不能写成听感通过。

已查看候选四个事件的全部 206 张局部逐帧图、32 个全幅阶段图条目和完整 390px AB 帧。浅青字面更明亮，轮廓压力较小，深蓝影增加少量厚度；390px 整体变化比较克制，不能据此自行认定跨过 90 分。根 Agent 已完成独立复核，结论见下。

`fontIdentityVerified=false` 保留，实际 fallback 字体身份尚未确认。未验证新背景、中文复杂实拍、英文长从句、面板交互或实时听感；旧失败、旧修订与系列证据不覆盖。

## 根评审决定

根 Agent 独立查看四个事件的实际 AB 图及 Alex 阶段帧后确认：浅青字面更亮，硬影有微量层次，但在 390px 下的收益不足以解决原 89 分的风格表现问题。本候选不晋升 r4，不评分；保留单候选及全部成片证据，当前 r3 和原评审系列不变。

原系列 `style-review-series-1d07ac6ea4b0da5ef701155b67eb0890d7bfcff9105a8285ab0721ea12f9f501` 仍为 89 / 89 / 89，最低 89。这是当前保存版的既有分数，不是本候选的新分数。本轮到此结束，没有开启第二候选，没有改主账本。

[根评审记录](/Users/zhengwei/Downloads/cyan-material-candidate-20261008/decision.json)

## 文件与回执

证据根目录 `/Users/zhengwei/Downloads/cyan-material-candidate-20261008/`。`receipt-summary.json` 记录四片批次/工程/SHA/PCM，`verification.json` 记录全部姿态和阶段指标，`*-item.json` / `*-document.json` 保存原生读回。四组 `*-event-*-ab.png` 为实际输出相同时间完整画面对照；`*-candidate-event-*-stages.jpg` 与 `*-motion.jpg` 为实际成片阶段及全事件帧。

[完整回执](/Users/zhengwei/Downloads/cyan-material-candidate-20261008/receipt-summary.json) · [核验数据](/Users/zhengwei/Downloads/cyan-material-candidate-20261008/verification.json) · [原 r3 及失败记录](/Users/zhengwei/code/moirai-cut/docs/cyan-generalization-20261008.md)
