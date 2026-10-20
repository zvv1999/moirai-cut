# 双圈原生文字 r3：通用顺序圆弧与正式输入回归

2026-10-08。`candidate-rings-text-bound-20261008` 已通过 CAS 从 r2 保存为 r3，仍属于原第 10 个双圈方向。四个精确保存版本的实际输出评为 **89 / 89 / 88 / 90，系列取最低 88**，未达到 90 分系列目标。不是第 21 种新风格。

证据入口：[正式 r3 对照页](/Users/zhengwei/Downloads/rings-sequential-r3-20261008/review.html)。旧 r2 最低 85、r1 最低 83、原对象圈及 A/B/D 失败均保留；本次不改主验收总账本。所有结果仍为 `listened=false`、`aestheticQualityVerified=false`。

## 保存的通用规则

在原暖白原生文字、四个原生 ellipse 叶层与 `text_box` 尺寸绑定上，仅改变两笔的路径和显现顺序：

| 通道 | 主笔 | 辅笔 |
| --- | --- | --- |
| 原生圆弧 | 从 −35° 画 320° 开放长弧 | 从 20° 画 155° 下侧短弧 |
| 描边显现 | 0–140ms，ease_out | 120–240ms，linear |
| 透明度 | 45ms 达到 1 | 120ms 开始，160ms 达到 0.78 |
| 收束 / 最终倾角 | 原 120ms，1.035→1，−2° | 原 180ms，1.035→1，+3.5° |
| 退出 | 100ms | 100ms |

最多 20ms 画笔交叠。文字仍在 80ms 完整，原文字动效、字号、事件窗口、原词时间和声音保持。为使用统一 240ms graphic 入场 phase，非 reveal/opacity 的旧关键点按原实际秒数重映射，已在原生编译结果逐通道核对。`reveal`、`opacity`、`rotation`、`scale` 独立组合，文字依附关系与尺寸绑定保持。

便携种子：[rings-text-bound.json](../scripts/templates/seeds/rings-text-bound.json)，revision 0；与保存 r3 除 revision 外完全相同。`usageGuide` 说明当前姿态测量、字体/阅读预算、保护区、fallback 与短窗限制，不包含本次输入的坐标、台词、词下标或绝对事件时刻。guide 中“尚未评分/待正式输出”是保存瞬间的快照；后续实际状态以不可变的本次评审回执与本文为准，未为更新叙述再改动 r3 定义导致证据失效。

## 四个正式 Application

Deborah、John、中文仅更新 `assetRevision=3`；June 只再平移中心。Sample、关键词、自然换行提示、原词对齐保持。三个英文片段仍是两种实拍背景、三个人物构图；中文为已有原声音频黑底排版控制。同源返修不算新背景。

| 输入 | 构图 / 动作 / 素材 / 适配 / 可编辑 | 总分 | 390宽实际稳定字号 | 文本稳定实际PTS跨度 |
| --- | --- | --- | --- | --- |
| Deborah | 22 / 24 / 18 / 16 / 9 | 89 | 21.483–21.499px | 1.267 / 1.567 / 1.600s |
| John | 22 / 24 / 18 / 16 / 9 | 89 | 19.74375px | 1.667 / 1.700s |
| June | 21 / 24 / 18 / 16 / 9 | 88 | 19.74375px | 1.700s |
| 中文声音 | 23 / 23 / 18 / 17 / 9 | 90 | 35.1px | 1.500 / 1.467 / 1.500 / 1.233 / 1.600s |

Deborah、John、中文相对 r2 仅动作各加 1 分：真实沿路径显现并先主后辅，徽章感减轻。浅墙副笔偏淡、英文两行仍接近圆、中文相邻句尺寸变化直接等限制没有消失。中文 90 仅支持当前黑底 Application，不证明中文真人叠加质量。

**文字阅读与装饰定型分别记录。** 文字可读按 80ms 入场结束至 100ms 退场前的实际帧跨度计算；装饰在 240ms 才全定型。中文最后两行文字的实测稳定 1.6s 满足原 1.5s 文字预算，但装饰全定型的理想保持只有 1.46s，不能宣称装饰也满足该预算。每事件两类时刻及 decoded PTS 保存在 `*-reading-times.json`。装饰比旧版晚 60ms 定型，文字阅读窗口没有缩短。低于 340ms 的 phase 压缩尚不算已验证覆盖。

## June 的边距改善与保留阻断

只把 Application `centerX` 从 0.831 改到 0.820，左移 14.08 源像素；`centerY=.235`、`scale=.9`、`headline width=.23`、原字号 64.8px、两行 `June solstice` 和 0.18–2.08s 全部保留。保护区没有缩小，太阳图示、头部、躯干/手势与源画面保留。

| 测量 | 旧 r2 / 0.831 | 新 r3 / 0.820 |
| --- | --- | --- |
| 完整椭圆保守运动包络 px | [859.809, 33.449, 1267.551, 312.326] | [845.729, 33.449, 1253.471, 312.326] |
| 完整椭圆右余量，390宽 | 3.793px | 8.083px |
| 新可见圆弧与文字包络 px | 不用新路径倒填历史 | [851.507, 36.227, 1243.895, 306.433] |
| 新实际可见右余量，390宽 | — | 11.001px |

新可见包络距原 head 保护区右界 844.8px，仅 6.707 源像素，即 **2.04 个390宽显示像素**；完整椭圆保守余量甚至仅 0.929 源像素。实际全幅首尾表未见压头或手势，但空位仍紧，背景分隔线仍干扰，不能把右边距改善说成整体安全留白已经解决。构图/适配各有限加 1 分，June 仍作为系列阻断。

`northern hemisphere` 旧长概念失败与 skip 没有变成成功；75秒中文烧录字幕片的重复叠字 skip 也仍保留。更窄画面应由 Agent 换合适布局或简单标记，不能缩字、删半个概念、缩保护区或改声音凑分。

## 实际验证与可复查范围

1. 4 个正式 MP4 全文件解码；输出 SHA 与 preview、文字测量回执一致。源输入文件 SHA、当前 transcript 的 words、原 Sample、事件起止保持。输出解码 PCM 与各自旧 r2 导出完全一致；这证明视觉返修未改导出声音，不代表原压缩声音逐字节相等或已试听。
2. fixture 的 `textMeasurementGeometryCoverage` 和测量的 `geometryCoverage` 均为 `constant_record_pose_v1`，37条记录、`droppedRecords=0`。全部稳定实际 decoded PTS 逐一对应当前 layout/text_box/leaf pose；当前输入无祖先group，不使用首条入场姿态代替后续稳定字号或位置。
3. 11事件，提取638张含首尾余帧的390宽连续帧；572可见帧以当前姿态、独立图形关键帧、原生sizeBinding重算圆头开放路径和文字边界。画布与原保护区均无相交。完整椭圆内沿Q仅是保守设计留白，不表示尚在画出的开放弧每刻包围文字。
4. 541个实际编码帧独立提取金色像素，零缺失；预测与实际包络最大差2.210显示像素。该包络核对含抗锯齿、缩图和H.264误差，不是像素级美术相似度评分。新脚本保留每帧当前姿态索引、弧与完整椭圆两类包络，不能混用。
5. 全部11个首尾全幅阶段表、11个同PTS局部 r2/r3 对照、4个覆盖所有事件的稳定全幅对照已经人工查看。主笔先画、下侧辅笔后补成立，未见新增压字/裁边、异常闭合或结束后图层残留。相邻事件按原语义窗口切换，不误把下一条字当作前一条残留。这是实际解码帧检查，不冒充实时连续播放。
6. Deborah、中文正式 r3 与此前已被父Agent独立审阅的顺序草稿，**全片 decoded RGB SHA 完全相同**；John、June 正式输出的同PTS稳定和首尾局部表另经父Agent独立审阅。记录在 `draft-rgb-equivalence.json` 与 `visual-inspection.json`。
7. 每个独立工程的 `scenes/settings` 等于冻结编译fixture；原生文字、4图形、精确parent实例、尺寸绑定、各动画通道均可编辑。没有修改参考工程或运行时业务代码。`fontIdentityVerified=false`，未独立确认fallback字体文件；本轮未做浏览器属性面板实操或实体手机验收。

## 历史、恢复与评审

四Application均沿旧r2 context追加parentId，保留全部旧记录。最新r3历史回读 `restorable=true`，并实际调用恢复API：先保存完全相同的当前状态备份，再准备恢复载荷；返回模板与生产投影严格相同，保存的Application/完整submission相同，Sample仅经服务默认空字段正规化。恢复检查不修改任何工程时间线。`restore-summary.json` 保存了备份及下一次CAS parentId。旧r2记录因 `style_revision_changed` 当前不可直接恢复，不能把保留历史说成无条件可恢复。

后端历史 `sourceFilesVerified=false`、`qualityVerified=false` 保持原含义；独立文件SHA验证与本次质量评审分别记录，未伪造后端字段。

系列 `style-review-series-aad3cff1ca381e2913a73cc69279c8d67995297db9876313cb1490eb543ec9a3` 回读 `current=true`、`evidenceCurrent=true`、`total=88`、`meetsInternalThreshold=false`。四个分数分别89/89/88/90，旧r2/r1系列保留为历史。

| 输入 | 生产批次 | 独立工程 |
| --- | --- | --- |
| deborah | `production-e67fe196774201145e4c1fce49b52b88` | `tpl-preview-903eaea6a1089ca3fa72dfb7e869ceec-0-0` |
| john | `production-240aad95eab5bc61b48c12a056506de8` | `tpl-preview-f19fb644a0f306266be637bc6e2d7de2-0-0` |
| june | `production-ff131bb294026822963b41579ff8decf` | `tpl-preview-21a1fcc4964c5087f7344f384b431102-0-0` |
| chinese | `production-0f2942869f09fcb2c115900b41dd5198` | `tpl-preview-32f5165e1e268e90a6c6f722bec4f36b-0-0` |
