# 消散重影 r8 当前验证与历史证据

## 当前 r8：轻描边、100ms退出与完整使用契约

当前 `style-study-20260924-echo` r8 将三层100px源字号的描边由7px减为5px，主字阴影blur/y由3px减为2px、opacity由35%减为20%，退出由40ms延为100ms；160ms入口、同文副本关系、源词与事件不变。r7为相同视觉的过渡版本，曾发现使用说明混有旧参数，故完整清理usageGuide/provenance后保存不可变新版本r8；不覆写r7，不偷偷挪用旧评分。默认台词仍为“重点来了”，通用规则没有个案文案或绝对词时间。

三份原Application只改assetRevision，位置/字号/行宽/保持时间不变；Liz沿用此前已验证的scale .793。正式r8重新调用Application并导出，不假定草稿等于正式应用。逐解码RGB和PCM均与已独立审查的B候选、过渡r7完全相同，有真实hash证据；不是仅凭参数相似认定一致。根Agent查看B四事件与A对照，并复看正式r8 Liz，结合全三案身份链才登记新评审。

| 正式r8应用 | 实际批次 | 完整pose记录/丢失 | 稳定帧/原required预算 | 新评估 |
| --- | --- | --- | --- | --- |
| Alex June/sun | production-26b463c22bbf0b9a2788e339979e2432 | 32/0 | 各40帧 / 各0.8s | 91 |
| Liz absolutely love my job | production-9c9aced00da644888599e9837068fb0a | 16/0 | 46帧 / 1.2s | 91 |
| 中文最重要的一件事 | production-3fad413b0a2b88449c250f7751b2f271 | 16/0 | 41帧 / 1.2s | 88 |

新series `style-review-series-5df4980957fa8f7e827c99d339ac5b981512fdefffab331a65fe7756e253e043`：current/evidenceCurrent=true，最低88。构图、适配和可编辑维度保持，motion22→23来自三个实际退出采样逐渐消散且原阅读预算通过；assets17→18来自较轻描边/阴影。两个91分应用仍不代表最终通过：平静科普的冲击重影语义不匹配、中文黑底留白与未连续观片/试听的限制保留，listened/aestheticQualityVerified=false。

所有输出SHA、MP4副本、manifest/batch/template、真实完整pose与诊断身份重新对照，words/semanticUnits/captionSpans/events及PCM保持，保存工程scenes匹配。manifest模板与服务回读存在最高约1e-14数量级的JSON/Rust浮点往返差异，路径和值完整记录，不能写严格逐值相等。一次本地验证脚本import保存函数的目录归属问题已修复，并按各自真实batch重新回读草稿/r7/r8共9条证据；不使用错误归档作为评审依据。

三条r8应用历史回读当前且restorable=true；旧r6低分/小字号失败与r7过渡完整保留。`scripts/templates/seeds/echo.json` 与当前r8除revision归0外精确一致，native inspect往返通过；当前指南一次清理为100源字号/5描边、160ms入口/100ms退出，旧版本说明不再混入当前契约。

证据：`/Users/zhengwei/Downloads/echo-refinement-r6-20261008/r8/`，包含正式review.html、MP4/八阶段图、诊断/PTS、decoded-identity、artifact-identity-audit、series与history回读；父目录保留A/B和r7过渡。新居家产品背景由另一个独立应用工作流验证，不算入此三案覆盖，不预先提升通用评分。



## r6 历史：同文副本闭环与独立评审

2026-10-08，`style-study-20260924-echo` 通过 CAS 从 r5 保存为 r6。只新增 `readingReplicas`（`echo-text`、`echo-right` 指向 `headline`）、两副本的 `decoration` 角色和通用使用说明；视觉参数、默认布局、调度不变。当时 `scripts/templates/seeds/echo.json` 与保存版 r6 完全同步，未加入具体输入、坐标或台词。指南属于冻结定义，不因一次评审再次生成版本；以下记录当前验收事实。

当时系列 `style-review-series-39c615378cc4a13c62f3145d9d58a08f11dd9e2181f009897f277cc95b0aa288` 回读 `current=true`、`evidenceCurrent=true`。Alex **89**、Liz **89**、中文 **86**，系列最低 **86**；未满足 90 分门槛。`listened=false`、`aestheticQualityVerified=false` 保持。

| 案例 | 当前实际成片 | 本轮事实 |
| --- | --- | --- |
| Alex | `production-565e940d867a7fe04796f12baf168fd0` | 精确原应用，解码 RGB/PCM 与 r5 一致；32 条完整姿态记录零丢失，主副关系及阅读检查通过。 |
| Liz | `production-d0d3c7ae9a01f6cc82889709205c35f9` | 仅 Application 比例 .65→.793；主字稳定 21.220px、副本全采样最小 19.098px，通过 390px 观看宽度下的 19px 检查；16 条记录零丢失。 |
| 中文 | `production-871fea029d45b131b1e6d184b8d798d2` | 精确原应用，解码 RGB/PCM 与 r5 一致；16 条完整姿态记录零丢失，主副关系及阅读检查通过。 |

三案原词时间、事件、调度与 PCM 保持；独立工程与编译文档一致。根 Agent 和实施 Agent分别查看入口、稳定、末稳定、后置全幅代表帧。Liz 放大后两行清晰，未新增人物/植物覆盖；composition 22→23，其余 motion22/assets17/adaptation17/editability10 保持。稳定预算是调用方观察，不是自动感知，也不替代连续观片或试听。

Liz 原 r6 应用的 17.394px 主字失败、+12% 版的 17.533px 副本失败均保留，再到 +22% 通过版形成应用历史链；最终回读 `restorable=true`，资源/输入/投影均 current，`qualityVerified=false`、`sourceFilesVerified=false` 按原生返回保留。r5 历史和旧失败不删除。

旧版同文副本阅读工具的 `partial` 在当前三案已由完整姿态证据和原生主副关系检查解决；历史首帧姿态证据仍不能升级为当前证据。剩余限制：Alex平静科普与冲击效果语义适配有限；中文黑底留白不代表真人复杂背景；描边略厚、40ms 退出较短；尚未连续观片和原声试听。不能称最终通过。

[当前五版对照及证据](/Users/zhengwei/Downloads/echo-reading-r6-20261008/review.html)，目录包含冻结定义、CAS回执、精确应用、三案当前成片、Liz两次失败与返修、完整姿态诊断、历史、系列请求及回读。`independent-review-handoff.json` 保留独立复核前的旧分项，当前评分以 `review-series-readback.json` 为准。

## 以下为 r5 历史

冻结 `style-study-20260924-echo` r5，三输入各一个 Application，保留原声、真实词时间和保存定义。Alex是此前设计轮次的回归；Liz与中文规划输入没有出现在旧echo-public-scenes/echo-multiline输入列表，但不声称全新拍摄布景。

| 应用 | 实际事件/排版 | 成片 | 评分 |
| --- | --- | --- | --- |
| Liz 情绪峰值 | absolutely / love my job，57.087px双行，稳定窗1.6秒 | production-0c2da4bdb4ecfcd433111692567182f2 | 88 |
| Alex 太阳讲解回归 | 三段单行73.333px，各1.4秒稳定窗；完整原片与独立阅读区 | production-b4b2321918b5fef1636a7333fa11688c | 87 |
| 中文规划TTS | 最重要的一件事，70px单行，稳定窗1.42秒 | production-25424b59df75002ea964d114f7a4e9da | 86 |

Liz首版42px手机宽度下强调不足，完整保存在 `liz-small-rejected/`，只增加本次scale与最低保持，三层行宽一致且完整保留“love my job”。未修改模板默认、ASR词时间或源文案。返修后的较长保持延续情绪句尾，但没有重复新触发。

三批marker1、实际MP4/测量附件/预览SHA、原词、完整解码与可编辑工程回读通过。每个事件三层实测字号、换行一致；核对每条测量source/groupPath及本地时钟。彩影编译opacity于160ms后恒0，实际390px前/入口/稳定/退出/之后共25帧核验：彩影只在入口出现，稳定期主字清楚，退出后无残留。入口和退场的连续观感尚未实播，不能由抽帧代替。

主问题：Liz白字描边略厚；Alex阅读区与画面分离、冲击样式和科普概念的语义匹配有限；中文黑底TTS留白较多，不提供真人复杂背景证据。分数88/87/86，最低86，保持阻断、未试听和未最终审美通过。应用基线→调整/证据均存原生application history，不把返修坐标写回风格。

可复查脚本、冻结版本、样例、失败版、历史和评审原始回执：`/Users/zhengwei/Downloads/echo-generalization-20261008/`。`verify.py`复查技术事实；`review.py`记录人工查看对应帧后的判断，不是自动美学评分器。

## Alex原画面融合返修（冻结r5）

[查看前后实际成片与帧证据](/Users/zhengwei/Downloads/echo-generalization-20261008/direct-overlay/review.html)。新批次 `production-03952666f505f31d61fbe4fe70dbde72` published。仅改变本次Application/已有原词强调：移除240px下黑带，回到1280×720原画面，scale .82、center(.87,.17)、三层行宽均.20、保持1.6s；选择`June`和`sun`两个稀疏短词。冻结definition前后完全相同，未更改r5或参考工程。

两事件六个原生text测量均82px、单行，390px显示24.984px；三层实际字号/换行完全一致，红青层160ms后opacity恒0，主白字稳定1.4s。已查看10张全幅阶段图及108张局部连续运动帧；保守合并运动位置/1.035峰值/glyph/描边包围框，始终处于右侧空区域且不跨脸手/太阳保护区。原视频仍scale1、零裁切，旧y=-120的新画布位置归0；不放大或裁掉太阳/手势。全文件解码、源SHA、原测得词时间、MP4/测量SHA、元素ID/时钟及独立工程scenes一致性通过。新旧完整解码16kHz双声道PCM字节数及哈希相同。

原生readingCheck要求所有text层都提供证据，因此提交六层真实字号/行数，但只为主字提供0.8s稳定阅读预算；四个重影层承担短促装饰，本来就应快速消失，不伪造独立阅读保持。主字预算通过，整体原生状态诚实保留`partial`（四重影层缺独立timing）。这说明当前通用阅读工具没有按“承载阅读的主字/同内容装饰副本”区分角色，不能把partial写为全通过。未改工具规则来迎合此案。

Alex帧评由87变为89：构图22→24，其余维度不变；原黑带失败完整保留。去掉黑带改善了一体性，但原风格用途是短促冲击/反差/情绪强调，平静科普的语义匹配仍弱，不能只因位置适配授予90。

新系列 `style-review-series-d57935bce0b2f7c7283086bf3c5c607ab811978b0a4b1d683b449c212036d820` 回读current/evidenceCurrent均true；保留Liz88与中文86原精确case/SHA，当前88/89/86，最低仍86。未连续播放、未试听、最终审美false。新history context `echo-direct-alex-20261008`保留旧基线及本次返修，2条均restorable=true，未执行恢复；sourceFilesVerified=false仍保留，源文件SHA由本轮独立脚本另行核对。

证据目录`direct-overlay/`含实际成片、`alex-verification.json`、`supplement-verification.json`、`reading.json`、history/review-series原生读写回执与可重跑脚本。此轮是已用输入返修，不是独立新布景盲测，也不增加方向计数。

根代理追加种子验证：`scripts/templates/verify-echo-seed.mjs` 在模拟库中不存在Echo的分支，通过真实原生inspect/application与截获保存请求，核对新建内容完整保留r6关系/外观；真实素材库完全不变。记录在 `/Users/zhengwei/Downloads/echo-reading-r6-20261008/seed-regression/verification.json`。
