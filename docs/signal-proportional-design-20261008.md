# 信息侧标 r5：按实测内容高度构成完整标签

已保存 `style-study-20260928-signal` r5。改良来自两份英文实拍与中文TTS、一行与两行对照中重复出现的问题：旧固定短细线与底板分离，两行时比例尤其偏弱。模板只保存通用造型与关系，人物、词、事件和位置仍属于Application/Sample。

## 通用规则

- 原生青色侧条宽度由0.012改0.018，贴实际文字底板左缘，gap=0。
- `sizeBinding.height.factor=0.82`、padding=0，参考含padding的实测`text_box`，垂直居中。单行与双行无需不同case分支。
- 深蓝底板opacity=0.94，圆角为短边一半的12%；浅白字、字体、字重、100ms轻上移淡入和60ms淡出保持。
- Agent继续按输入调整本次应用的行宽、位置、比例与事件；不足阅读预算或遮挡时调整/跳过，不能把case特判写回模板。

r5指南同步明确这些关系，原“可选择无底板”“侧条固定高度”等含混说法已移除。编辑性仍是两个原生叶层及其尺寸依附。

## 正式输出与验证

|应用|正式批次|内部分数|
|---|---|---:|
|Deborah 浅墙英文|`production-40214e5f609f32e1b090e29915d72dc6`|90|
|John 紫色演播室英文|`production-c49c72aecbfb6c2ebb8212fc4e95f195`|89|
|中文方形TTS|`production-6d89c2ed4c5a767ce2b78d655b575afa`|90|

三份原Application仅修改assetRevision，Sample、原词时间、字号、换行和11个事件保持。正式投影重新居中，比候选文字分别左移3.528/3.240/3.600源像素，RGB与候选不一致，未自动继承候选结论。Root重新查看正式每事件8阶段共88张实际帧；候选另有三份A/B及代表动效检查。未声称亲看全部已提取的连续帧或连续播放。

全文件FFmpeg解码通过；preview与测量SHA对应；所有可见文字帧有当前姿态测量、零丢弃，实际字号/稳定阅读预算保持且在预算内。所有实测姿态在画内、不碰既有观察保护区。每事件原尺寸MP4青条像素框与预期边界最大差1.43px，侧条实测高度对应底板0.82倍；一行/两行分别验证。完整44100Hz双声道解码PCM与原r4输出逐样本相同，可编辑工程scenes与冻结fixture相同。

正式系列 `style-review-series-f6e04acbbed9a59a4dd16a71c8943be0084b697cd1a0298cf4c2e27366a3385f`：90/89/90，最低89，current/evidenceCurrent=true。三条新应用历史可恢复；r4旧分数与证据保留历史，不声称旧版本可以直接作为r5恢复。John位置仍偏角、中文黑底较空；两真人素材为既有回归输入，尚无独立复杂中文真人。`listened=false`、`aestheticQualityVerified=false`。

证据及实际输出审查：`/Users/zhengwei/Downloads/signal-refinement-20261008/formal-r5/review.html`；同目录有各application/sample/item/verification、`candidate-comparison.json`、`position-delta.json`、系列与历史回执。候选及r4失败证据未删除。

## 初始化一致性

新增`signal.json`原生定义种子，仅revision归零，无应用、素材绑定或评分。编辑样式初始化入口改用公共`initializeStyleSeed`：已有保存版保持，缺失时Rust inspect及CAS创建，不再生成旧固定短线。19份定义种子native roundtrip完全一致，实际初始化只有GET且完整库不变；公共初始化4项测试通过，脚本语法检查通过。实际运行`PILOT_STYLE=signal`入口生成三样例manifest，侧条依附和底板参数对应r5，保存样式不变。未执行全新安装，也未新增浏览器点击验收。
