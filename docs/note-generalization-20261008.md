# 便签纸面 r9 泛化验证

2026-10-08。冻结 `style-study-20260924-note` r9，保留深棕左对齐文字、奶油纸面、错位纸影、胶带与两道高光；五个叶层按关键词分别分组并整体退场。只调整具体 Application，不修改模板定义、声音或对齐词时间。

本轮准备三个不同输入、三个 Application，共十个重点事件。源画面已用 FFmpeg 连续取帧检查；保护区为 Agent 人工近似标注，不是自动识别。三个位置已通过原生几何预检；这不代表字号、行数、稳定阅读或审美通过。生产及最终验收状态以本页后续更新和原生回读为准，准备阶段不评分。

| 输入与版本 | 本次验证 | Application 与保护区 |
| --- | --- | --- |
| Deborah，`input-99fa58d72fd4c9ad5cc2eed30b95b6a1`，转写 r1，26词 | 完整长批注 `I could find around the house.`、短语 `my mom,`、单词 `calculator,`；其余话语不加纸签 | 保留完整1280×720原图，左上空墙；scale .62、中心(.187,.23)，主文字/纸影同行宽 .30。保护人物、胸前标识及手势的近似并集。 |
| Alex，`input-80f248b968faad87d3460b76ec8badd1`，转写 r1，37词 | `June solstice,`、`northern hemisphere`、`longer sunlight`；保护太阳讲解图示与手势 | 原图完整contain在上部72%区域，纸签位于下部阅读区；scale .60、中心(.5,.855)，两文字层同行宽 .52。完整原图区域均受保护，不裁太阳或手。 |
| 中文协作配音，`input-e01ef91d1e429916a7f317f32ac47da7`，转写 r2，39词 | `目标说清楚。`、`写下负责人和完成时间。`、`及时沟通，`、`一起确认结果。` | 已转写的合成声音，黑底；scale .78、中心(.5,.5)，两文字层同行宽 .46。检验长短中文、两行留白及胶带跟随。 |

三个应用均通过原生 `Application.minDisplaySeconds=1.6` 申请关键词后的空隙保持，不改原声、不造词时间。先保存未申请额外保持的空间基线，再记录这一调整。中文最后事件受输入尾部限制，原生预检实际长度只有1.525397秒，五个叶层对应的警告保留；不能把1.6秒请求当成实际保证。具体稳定阅读预算按每段内容分别记录在各案 `adaptation.json`，待实际导出测量和动作取帧核验。

三个样例均有无重点的时间区间，用于检查便签不凭空出现；这不等价于额外一份整片无重点负例。原生caption字数/速度警告也保留；本次样式只显示重点纸签，不承担完整正文字幕。任何后续组合字幕的效果需要独立检查。

覆盖范围是两名真人、两个实际布景及一份中文配音。Deborah属于其他方向已使用的CDC植物访谈布景组；Alex也参加过旧r8纸面材质测试，是明确的回归输入；中文黑底不是第三种实拍背景。不能把这些重复使用的素材称作全新的独立盲测集。当前仅生产1280×720，计划检查320px/390px缩图，这也不代表竖屏、方屏适配已验证。

证据目录：[note-generalization-20261008](/Users/zhengwei/Downloads/note-generalization-20261008)。`frozen-definition.json`、`plan.json`保留冻结定义和范围；每案包含实测输入、源联系表、Application、理由、保护区、预检及待生产manifest。所有成片需使用正式生产链生成，并检查新原生测量记录、实际MP4哈希、字号/行数/溢出、稳定时长及纸面细节。连续观片与原声试听分别标记，不能由发布成功或技术测量替代。

## 正式生产与系列回读

三份正式批次均已发布并绑定新测量回执：Deborah `production-027624e82ea5cf4938d71d8004202740`（210帧，3个文字事件）、Alex `production-67995888c3a92648661f7434095b0c90`（420帧，3个事件）、中文 `production-a04149d80919bae83a918b5b8f9d19ab`（370帧，4个事件）。全部 `droppedRecords=0`，每个预览的实际 MP4 SHA-256 与 `outputSha256` 相等，文字测量 `overflow` 均为 false。中文长词实际两行，Deborah 长词实际两行；390px 辅助缩图实测字号约13.1/15.4/20.0px，320px 仍保留可辨识字形，需结合完整观感判断。

原生测量确认便签纸面和胶带均来自实际导出渲染：r9 每个关键词保留 headline、纸影、胶带和高光的独立可编辑关系，主文字和阴影保持同行宽。稳定区间按编译后的纸面落位及组全不透明边界逐帧计算：Deborah/Alex 各约1.467秒，中文为1.467/2.1/1.467/1.4秒。最后一段低于本次1.6秒 Application 申请且受 `input_end` 截短，警告保留，没有虚构时长或篡改原声。

已提交跨输入系列 `style-review-series-afccb76561d439971e847259043d0f0b67605970fbedc77153a2791519b21a73`，三案回读 `current=true`、`evidenceCurrent=true`，内部评分为 Deborah 90、Alex 85、中文 89，系列最低 **85**，内部阈值未达。所有 case `listened=false`、`aestheticQualityVerified=false`；分数来自代表帧、联系表和测量回读，不能替代连续观片与原声试听。Alex 下方黑留白是当前构图缺口，中文末事件时长不足是当前编排缺口，后续应在 Application 层或输入选择层修正，不能改写 r9 默认。

应用历史已保存“无额外保持基线 → 本次 `minDisplaySeconds=1.6` / 画幅位置与行宽调整”链，见证据目录各案 `history-baseline.json`、`history-adjusted.json`。冻结定义回读未变，未修改样式版本或主账本。

历史记录 ID：Deborah `application-b9d965432d51196d5cd56206e45afc2f8331b443a65e0b9b9829d43acf93becf` → `application-f3cf58724cbb5c619196d9673b2b154100f0e62f0392d50aa5ff88582b464d58`；Alex `application-2fd936cd41505f2ddec278c9219eddebee28e4e60b16a1919f30ece202851b7f` → `application-a63a9b0f5961763537acc8a0228790b564f52bbc9d5de80d8654f741f2a5ec13`；中文 `application-27b12908a401a34a5e13c6f4ca51bd9588cb9e31a39be58668afa527090cfbbc` → `application-c3465787ba20f415411476dc7937f4bbf7631f8c6dd5e66d9cde2daa3cf17400`。三条记录均 `restorable=true`、`projectionCurrent=true`，但 `qualityVerified=false`。

## Application返修后的当前系列

模板r9保持冻结；Alex改为1280×960，完整16:9原片铺满上部75%，便签保持独立下部阅读区并去掉左右黑框。scale仍0.60，实际字体因画幅投影达到67.2/65.39px，390px查看约20px；三个事件稳定区间均1.467秒。0.66尺度初始提案的原生几何检查发现越界及原片保护区冲突，未提交生产，实际使用0.60。

中文仅在样本语义标注中跳过片尾不足1.6秒申请的可选装饰，最后一句原话和所有ASR词时间保留，前三事件不改。导出后三条记录稳定1.467/2.1/1.467秒，无input_end截短警告；11.5秒尾部实帧无花字残留。该降级由Agent依据真实时长选择，不是模板内关键词或绝对时间特判。

两份新片批次 `production-06e0f8f686b9c7d7f6c2c3438d435a63`、`production-328bf7517c3d44ad7ab59a3065e0a5ce` 均published，marker=1、MP4与测量hash一致、无丢弃/溢出；完整解码通过，与旧应用同源PCM字节相同。根查看实际390px稳定图、各事件入稳退联系表及中文尾部空帧；未连续实时观片、未感知试听。

新系列 `style-review-series-ebe163429f221a1e5cc8bcd62c91f0c08d1e56e6a85ac32f52faf7f595d61c48` 复用Deborah原90分案，加Alex90与中文90，最低90，current/evidenceCurrent=true。原85分系列保留。所有case仍有视听未验阻断，`listened=false`、`aestheticQualityVerified=false`。

两个应用历史追加到原调整后记录：Alex `application-e71efdcce76cbce924ac61d77065294de064650fa2ccd919984cb10eb6af923e`，中文 `application-ad08144e4959540aef67dad42c928db1f2fc2d851259173294a6566ef098d372`，均restorable=true。实际对照与证据：[返修成片](/Users/zhengwei/Downloads/note-generalization-20261008/repair/review.html)。
