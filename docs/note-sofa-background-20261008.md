# 便签 r9：独立中文居家产品背景验证

2026-10-08。冻结 `style-study-20260924-note` r9，只新增一份 Application/Sample 与正式生产证据，不修改模板定义或主台账。

## 内容选择与适用边界

使用已导入 `input-ce4a2882274fefc252000f062bd936b8`（转写 r1，36.3秒，200 ASR词，1080×1920/30fps）。这份素材是带原字幕和多镜头的产品展示视频，已用于 Echo；它是该冻结 note 样式未使用的独立背景，不是全局未见盲测、真人口播原始素材或新拍摄。

Agent 从原句「接住你所有的负面情绪」（words97..106，17.22–18.76秒）归纳利益点标签「情绪陪伴」。标签是明确的编辑摘要，不是 ASR 原话、自动关键词提取或新增事实。它比再写一遍「负面情绪」更有信息分类作用，并与温暖纸签风格匹配。其余句子不额外叠花字。

显式事件17.50–18.70秒，晚于源17.4667秒切镜，并在原语义结束前退出。原200词、所有词时间、原画面和声音保持，未修改转写或使用额外保持。没有把个案位置、词语或时刻写进通用定义。

## 应用与事前预算

720×1280完整画幅，scale0.65、中心(.28,.225)，headline/纸影同宽0.40。原生几何预检通过。左上窗帘留白用于纸签，脸/头发、手/产品、身体、烧录字幕设为手工保护区域。源目标窗口17.4333–18.9667共47连续帧已人工观察；标注不是自动检测、跟踪或精确分割。

事前预算为390px视口下字号至少24px、单行、稳定阅读至少0.8秒。保持r9奶油纸面、深棕左字、错位纸影、胶带与两道高光的五层设计及既有动效。

## 正式生产和实际测量

- 批次：`production-e9ee27e085333d7621fd3db1ddd41dd9`，published、previewOnly。
- 可编辑工程：`tpl-preview-e49ba89172fe251a03923fa3564b4906-0-0`；磁盘scenes/settings与生产编译严格一致。
- 输出 SHA-256：`694f705bb18285c71bfdfe7d89c26f3b03ab84df1233567bf064f457aae3451e`，与原生测量回执一致。
- 1089帧、8个文字姿态记录、0丢弃，`constant_record_pose_v1`；主字与纸影都覆盖36活跃帧、33稳定帧。
- 实际字号54.6px，即29.575px@390；一行，所有溢出项false。实际字体文件身份仍未独立验证。
- 主字70ms落位，胶带跟随的已编译采样到100ms稳定；按较晚者计算17.60–18.67=1.07秒，超过事前0.8秒。
- 30ms名义组淡出恰落在30fps输出采样之间，没有半透明退场帧；18.6667最后可见帧仍不透明，18.70已无残留。不能把名义淡出长度当成实际看到平滑淡出。

原生投影到生产JSON有6处小数往返变化，最大2.78e-17，均在元素region数字字段，完整差异保留于 `projection-wire-deltas.json`；没有非数字差异，未声称模板JSON逐字节相同。源词/Sample/事件按严格值相等检查；图库r9定义严格未变。

## 图像与声音核验

根Agent和实施Agent分别查看17.3667–19.0秒全部50连续输出帧，并查看720入口/稳定与390稳定图。纸签不遮人物、手、产品或底部烧录字幕。奶油纸面虽然接近窗帘颜色，深棕字和下方错位影仍形成清晰边缘；胶带与两道高光保留。实际文字姿态外包络约x50.69–306.79、y235.45–354.35px。包含胶带的手工留余量外包络x36–328、y212–372px，距脸/头发保护区水平75.2px，距手/产品保护区竖直82.4px。后者明确是观察值，不冒称原生图形测量；原生 `visualCheck` 仍保持unverified。

复用同源正常无触发控制批次 `production-e0064a5307094e4e335fb7fab35a6e2b`，视觉Application属于Echo无触发案，严格核对除生成身份外完整音频图相同。两份导出的完整44100Hz双声道PCM（无下混/重采样）精确相同，SHA-256均为 `0407f366c758cdd4b8b89f44835565ae47d82d7715d780e39e1f865b542baa76`。原AAC与重新编码AAC不是PCM逐样本相同，`sourcePcmIdentical=false`保留。音频控制不计第二份审美case，PCM相同不等于感知试听通过。

## 应用历史与阶段评价

应用历史context `note-sofa-20261008`：未生产基线 `application-ccf6b9bd93fac20651d5c0376518a5c8eee4dc6d8c5269e2317391b74d41c5fc` → 已技术/图像核验 `application-3bc14f3f8a21e20c6b7bc4514d4118d986d79ac8872280d8ea3c68296b10e3eb`。两条参数相同，本轮没有发现需要返修的应用错误，不制造失败案例。新记录 `restorable=true`、`projectionCurrent=true`，`qualityVerified=false`、`sourceFilesVerified=false`保留。

根在看完全部50帧后确认阶段90分：构图24、动效21、素材18、适配18、可编辑9。旧三案90/90/90精确保留，追加本案的新四案系列 `style-review-series-232a4450619d7eb642dee4193dc4c5b9be07135dc24a4b9ad1f92b2e6535a125`，最低90，current/evidenceCurrent=true。原系列 `style-review-series-ebe163429f221a1e5cc8bcd62c91f0c08d1e56e6a85ac32f52faf7f595d61c48` 及其证据未改。

所有case仍 `listened=false`、`aestheticQualityVerified=false`，新系列 `meetsInternalThreshold=false`；连续实时观片和原声试听未完成，有阻断的阶段90分不代表最终质量通过。本案未新增UI点击/拖动验证，只检验独立工程的原生结构和保存回读。只证明一个手工选窗内的应用，不能推广为整个多镜头视频或任意背景自动通过。

证据：[完整对照与播放页](/Users/zhengwei/Downloads/note-sofa-r9-20261008/review.html)，[验证记录](/Users/zhengwei/Downloads/note-sofa-r9-20261008/verification.json)，[原生阅读诊断](/Users/zhengwei/Downloads/note-sofa-r9-20261008/reading-diagnostic.json)，[音频对照](/Users/zhengwei/Downloads/note-sofa-r9-20261008/audio-control-verification.json)，[系列回读](/Users/zhengwei/Downloads/note-sofa-r9-20261008/review-series-readback.json)。
