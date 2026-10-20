# 庆祝 r4：应用尺寸与真人职业成就验证

本轮保留 `style-study-20260928-celebrate` r4 原定义及七片独立可编辑彩纸，先验证 Application 能否解决横屏手机预览粒子偏小、人物遮挡的问题。没有把单例位置或台词写入 Definition。

## 横屏尺寸控制实验

既有 confirmed TTS 黑底输入，Application scale 从 0.9 调至 1.35，其他字段及 Sample 不变。标准生产批次 `production-af61136de38e9b112a1ec30eb0423b95` 已发布。相同 390 px 显示宽度 A/B 实际帧显示粒子更清楚；七粒、事件 2.62–3.77 秒、Sample、解码 PCM 均保持一致，原生采样旋转边界在画内。此项仅是旧输入尺寸回归，不算新增泛化证据，也不另给分。

证据：`/Users/zhengwei/Downloads/celebrate-application-size-20261008/same-mobile-size-ab.png`、`invariants.json`、`confirmed/verification.json`。

## 真人正例：Sudha 职业成就

使用已导入的完整 CDC 视频 `input-4fb447b15e7106f8b440a2fd2b172dc2`，262.396 秒、ASR r1 原 494 词。116.41–125.71 秒表达从未想到能成为公共服务领域医生，对此感到欣喜；选 244..247（末端不含）“really cool thing” 123.91–125.01 秒触发，实际保持至 125.06 秒。此语义是职业成就，不是任务完成、验收或申请通过。随后 “privileged” 的复述不再次触发。

源画面 123.91、124.45、125.06 秒三帧观察：人物在画面右方，左侧墙面有可用空间，下方植物属于复杂背景。原 confirmed 默认 Application 的原生可见粒子中心进入观察到的人脸矩形 [690,75,1000,405]，因此在生产前拒绝原位置，保留预检证据，无需输出已知遮挡的完整 262 秒对照。

适配 Application scale=1.15、center=(0.27,0.50)，保持原 Definition、词与事件。原生 30 fps 旋转矩形预检范围 x67.96..624.82 / y72.22..440.36，与观察保护脸及躯干矩形均无交叉。这个采样不能证明帧间极值或感知效果；植物背景上的实际可见度需要查看成片。

正式候选 `production-7bf1ba596d52200c92f1cb2b001bbfa8` 已由标准 worker 发布并完成全片技术解码。较早 `production-c525b6239a0d534dbeeb5cf418ca9104` 使用超长 captionSpans，已保留 superseded 文件，不能作为正式证据。正式样例已拆短显示单元；原 ASR 开头有长跨度且英文字符/阅读速度仍有诊断，未改词时间。当前样式没有字幕元素，不能把本次验证当成完整字幕质量通过。

证据目录：`/Users/zhengwei/Downloads/celebrate-sudha-career-20261008/`。本次视觉审查范围明确限于成果事件附近；不声称全片逐帧、连续观片、试听或最终审美通过。真人候选已完成独立内部评审，见下节；未提升定义版本。

## 实际输出检查

正式适配输出七片、单事件123.91–125.06秒，源SHA/494词/ASR、preview与测量输出SHA、marker1与droppedRecords0、工程scenes/settings回读均通过。实际查看390px五阶段摘要及四页事件联系页共41帧（123.833–125.167秒）：墙面上粒子清楚，人脸/躯干无可见覆盖；起始聚集和下落尾段少数粒子交叠植物尖端，但可辨认。125.067秒后已无粒子残留。

原音频使用同一源、无裁剪/效果；正式版与只改变caption元数据的前一版解码PCM完全相同。输出经过编码，源PCM与输出PCM不相同，不能声称音频bit-identical。未试听。见audio-invariants.json。

实际审查入口 `/Users/zhengwei/Downloads/celebrate-sudha-career-20261008/review.html`。本次证明一个真人职业成就场景可由Application适配，仍不足以覆盖暗背景、字幕叠加或密集成果事件；不修改Definition；原两案保留，confirmed的新Application单独评审，不覆写旧86分。

## 正式评审与可恢复历史

Root与子代理独立查看Sudha四页41帧、摘要及confirmed同390px A/B后，confirmed放大版89（构图22/动效22/素材18/适配17/编辑10），Sudha89（23/22/18/16/10）。旧confirmed86及旧系列保留。新系列的completed87与milestone88案例对象逐字段与旧请求完全一致，新增/替换应用不使旧案例自动提分。

新系列 `style-review-series-0ac2f0a49b674ab7469166bf3330f35c545ac568c18ef96e3d0f3800aa12099b` 已POST，回读current=true、evidenceCurrent=true，最低87，仍未达标。新confirmed沿旧应用历史追加，Sudha创建独立上下文历史；两条restorable回读通过，旧两案历史也可恢复。全部listened=false、aestheticQualityVerified=false。详细请求/回执/一致性在本目录review-series-*.json及formal-consistency.json。
