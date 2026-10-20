# 完成勾选 r5 泛化验证 · 2026-10-08

冻结 `style-study-20260929-completion` revision 5，沿用指南“已完成/确认/通过才触发，未来建议和不确定状态不触发”。没有修改模板或写入人物、台词、词下标、绝对时间特判。三种 Application 使用不同画幅、等比尺寸与1.2秒最小视觉保持，源词时间不变。

|应用|语义与画幅|最终批次|评分|
|---|---|---|---:|
|completed-square|完成结果，720×720|production-c46aa546d07ba6154f2b394126fc9e81|88|
|confirmed-landscape|已确认/已通过，1280×720|production-2a91a3bfbadb3cca907d1d57d253e737|87|
|milestone-portrait|阶段顺利完成/目标已完成，720×1280|production-581a918483aa25ad882b5321f423ccc5|86|

每案有一个正例和一个相同真人叙述负例，共6个published预览。正例5次勾选事件；负例3个不同画幅的真实视频输出均无勾选组，实际画面也没有勾选。正例来自本地系统TTS及原生ASR（短“完成，然后继续”原已入库；确认和阶段达成两条本轮新增），不能称为真实人物完成状态的泛化证据。ASR中“交付→交互”“达成→完成”等识别差异保留，未凭合成脚本重写词或时间；需要听校，不能夸大语义准确性。

## 真实验证

全部使用正常production/author与renderer，fixture marker=1。6份实际文件SHA256与preview和textMeasurements.outputSha256一致，1045个导出帧，droppedRecords=0，全文件FFmpeg解码通过，compiled words与原生输入逐字段相等。

本模板只有7个图形叶节点、没有文字，textMeasurements.records为空是正确事实，不作为语义或图形成形通过证据。按编译组事件分别抽进入、0.36秒成形、稳定、退出、退出后五帧，逐张390px查看：短笔先出，随后长笔和端帽完整连成圆滑勾形；完整形态有稳定展示；圆底、勾形共同淡出，五次事件均有退出后无残留帧。没有连续播放或试听。

首轮发现默认cover将方形和竖屏负例人物裁切，在Application增加保持原片16:9的居中videoRegion后重新导出；最终负例人物完整。旧输出存为 `*-cover-rejected.json`。最初纯音频建议负例由于没有可应用元素而被native拒绝，存为 `*-audio-negative-rejected.json`；不能当作成功成片负例。

## 评审边界

当前系列 `style-review-series-182e00230138c517a1c1ef9222984ad23c24c4a4fabc5a25f7a70f1802da7905`，回读 current=true、evidenceCurrent=true，最低86，未达90。listened=false、aestheticQualityVerified=false。图标清楚且动效结构正常，但横/竖屏黑底留白多，重复确认状态偏机械；缺少真人完成语义正例、复杂背景叠加和连续播放听感。

证据目录 `/Users/zhengwei/Downloads/completion-generalization-20261008/`：冻结definition、TTS请求/原生转写、3套Application/样本/manifest/回执、6份成片与逐事件图、checks.json、review-series-request/receipt/readback。`verify.py`可重复文件hash/词时间/组数量/解码与事件抽帧核验；`review.py`保留分项依据。未修改主账本或重启服务。
