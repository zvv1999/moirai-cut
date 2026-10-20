# Arrow r4：产品挂扣应用与错误指向返修

2026-10-08，同一冻结箭头 r4 新增一个完整产品视频应用。正式修正版为 **89 分**（构图 23 / 动效 23 / 素材 18 / 适配 15 / 编辑 10）。旧三案例 91 / 90 / 84 完整保留；四案例系列最低仍 **84**，未达到最终 90 分验收。

## 输入与用途

输入 `input-ce4a2882274fefc252000f062bd936b8`，转写 revision 1，36.3 秒、1080×1920、200 个对齐词。该源对冻结 Arrow 为新增来源，但此前用于其他模板，不能称为全局盲测。

原片“随便放办公室包里都能带”附近有一个包与玩具连接的金属挂扣。用箭头补充位置指示，不重复原片的烧录文案。眼睛互动段已有手指引导，未选作箭头正例。全部源词、时间、视频和声音不改；由 Agent 看源画后建立显式 Sample 事件，不是自动检测、自动追踪或新字幕。

样式 `style-study-20260928-arrow` revision 4 保持冻结。仅 Application 和事件窗口调整：720×1280@30、scale .45、center (.725, .19048186487866178)、rotation 110°，事件 28.85–29.60 秒。样式仍为六个可编辑原生叶子、隔离整体透明度、80ms 入场和 70ms 退出。

## 保留首案失败

首案 140°、center (.85,.245)、事件 28.65–29.55 秒的正式输出虽然避开粗保护区，但前向箭轴落到金属挂扣下方的毛绒，**指向失败**。根 Agent 实际观帧发现问题后，保存失败记录再修正；不把“不重叠保护区”当作指向准确。

首案批次 `production-cfc0e3276da999bebe4065e080c9be97`、成片和历史均保留，未计入正向应用覆盖。旧 Domain 的 .466667 秒短窗与重复大字失败也保留，未由新视频替代。

## 正式生产与读回

- 修正版批次：`production-6df285eb7622148efdcc2e8283678088`。
- 独立工程：`tpl-preview-19461adb3ca485852d64fc58f15f23df-0-0`。
- 输出 SHA256：`4419c49248d91cd467e58f8c89dd48f0a23806c626ddee77b3147fe164b2e126`。
- 原片 SHA256：`ce4a2882274fefc252000f062bd936b8a62dde1afda42d249a28485317bcce59`。

实际 1089 帧、36.3 秒，完整解码通过。18 个稳定完整姿态帧，首末 PTS 28.933333–29.5，相隔 **.566667 秒**，只略高于既有 .5 秒人工图形识别预算。29.533333、29.566667 秒两帧实际退出，29.6 秒消失。该 .5 秒是原案例人工预算，不是新的全局阈值。

六叶编译投影、生产工程 scenes/settings、全部 200 词原时间、冻结资产身份与文件 SHA 已核对。主视频和原声音轨各一条，0–36.3 秒，裁切为零，原视频无旋转缩放。原项目未修改。

## 实际指向检查

从正式工程读回 110° 整体刚体变换、六叶相同的局部 x 位移 −3.6→0、实心三角头几何，实际稳定尖端为 **(504.824,291.008)** 输出像素，与原生投影尖端一致。入场位移沿同一箭轴，不改变指向直线。

对第 866–887 帧的金属中心线进行人工注记，每帧约 5px 半厚。22 帧的前向轴均进入这个人工金属走廊，最大垂距约 1.814px。这是 Agent 对实际帧的近似标注，不能描述为自动检测或精确金属边界测量。

稳定段尖端至人工金属中心线约 **40.99–85.73 输出 px**，390px 显示约 22.20–46.43px；退出末帧约 100.59 输出 px。挂扣后移，距离变大。固定箭头没有追随目标，适配只有 15/20，不证明任意移动目标可用。

根 Agent 独立查看 390px 完整画面、9 个入稳退后阶段和全部 24 张局部输出帧，确认箭头避开弧形包带、产品脸与烧录字。完整运动保守包围范围不碰已有保护矩形，但该包带没有被粗保护矩形单独拟合，因此包带避让依据为实际帧检查，不是像素级遮挡检测。另保存三帧正式箭轴与人工金属标注的叠加对照。

## 音轨与评审边界

本次完整 44.1kHz 双声道 signed16 PCM 与已有同源正常零触发控制导出 `production-e0064a5307094e4e335fb7fab35a6e2b` 逐样本相同：1,601,536 个双声道帧，PCM SHA256 `0407f366c758cdd4b8b89f44835565ae47d82d7715d780e39e1f865b542baa76`。

原 AAC 与重编码输出 PCM 不完全相同，事实保留；控制一致不等于无损复制或感知试听。复用控制片没有增加正例数量。没有连续播放、试听或新一轮真实 UI 编辑操作，不能宣称最终审美通过。

## 历史与系列登记

Context `arrow-r4-product-attachment-20261008` 已保存“默认基线 → 140°待查 → 错误指向失败 → 110°修正 → 正式验证”不可变链。最终 head：

`application-d74f6c72bcee6b0425a909ea201a14339788c514fb85f07935dce2067b24f7da`

读回 `restorable/assetsCurrent/inputsCurrent/projectionCurrent=true`、`issues=[]`，未执行恢复。原生历史的 `qualityVerified=false/sourceFilesVerified=false` 不替代独立文件核验或视觉评审。

新四案例系列：

`style-review-series-08e3e35353f40de21ccea23826180a53bbd064e766fce0f7dea6e7fa93028d43`

原三 case Application、评分和证据完全不变，新增第四案例 89。整体及四 case `current/evidenceCurrent=true`；最低 84，`listened/aestheticQualityVerified/meetsInternalThreshold=false`。旧系列与全部失败证据继续保留。

[修正成片与完整对照](/Users/zhengwei/Downloads/arrow-product-target-20261008/corrected-110/review.html) · [原错误指向](/Users/zhengwei/Downloads/arrow-product-target-20261008/review.html) · [读回回执](/Users/zhengwei/Downloads/arrow-product-target-20261008/corrected-110/receipt-summary.json) · [实际箭轴](/Users/zhengwei/Downloads/arrow-product-target-20261008/corrected-110/actual-axis-verification.json) · [音轨控制](/Users/zhengwei/Downloads/arrow-product-target-20261008/corrected-110/audio-control-verification.json)
