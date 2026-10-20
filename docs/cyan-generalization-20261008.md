# 青色强调 r3：真实长短词、画面保护和片尾返修

2026-10-08。冻结 `style-study-20260928-cyan-impact` revision 3，3 个精确 Application、5 份正常生产成片全部 published。首轮内部系列评分 **83（83 / 87 / 85）**，内容侧返修后 **87（88 / 87 / 89）**，系列取最差应用。两条系列回读均 `current=true`、`evidenceCurrent=true`。**未达到90分，未完成连续播放和试听，最终审美未通过。** 未改原样式、参考工程或主账本。

评审入口：[本地成片和全部事件帧](/Users/zhengwei/Downloads/cyan-generalization-20261008/review.html)。

## 本轮验证的通用边界

原样式保持单层青色 `#11C6ED`、深描边 `#10191F`、自然字形比例、最多两行、90ms入口回弹、1.06倍缩放峰值与40ms退出。字体声明为 PingFang SC / 900；生产输出 `fontIdentityVerified=false`，没有确认fallback的实际字体来源。文字、opacity与scale关键帧均原生可编辑。

模板不保存演员、台词、词下标或绝对时间。本轮由 Agent 依据已有输入选择强调范围、提供保护矩形、调整精确应用的位置/整体大小/文字行宽/保持请求。人工画面标注不等于自动主体检测；Agent 本次选择的18px显示字号和逐词阅读预算也不构成全库通用阈值。

| 应用 | 输入与构图 | 精确 Application | 当前内部评分 |
| --- | --- | --- | --- |
| Deborah 横屏浅墙 | CDC真人，7s，左侧空墙放短重点，保留人物/手势/植物 | 1280×720；scale .98；center (.19,.18)；headline宽 .32；保持请求1.8s | 88 |
| Alex 4:3 科普 | NASA真人，14s，上部保留完整太阳图示、脸、手势，下部文字带 | 1280×960；scale .9；center (.5,.875)；宽 .60；videoRegion (0,0,1,.75)；不模糊；保持1.8s | 87 |
| 中文方形 | 12.3454s原始TTS，黑底，仅证明文字布局及事件时机 | 720×720；scale1.1；center (.5,.5)；宽 .82；保持1.8s | 89 |

三者 `intents=[emphasis]`，placement均全画布。两次返修沿用与首轮完全相同的Application；只改变当前输入的关键词选择。此处3应用不是5应用；5成片含2次返修。CDC和NASA为两个真实布景，中文没有真人背景。这三个输入此前已用于其他方向/旧青色验证，属于新导出回归，不能宣称是独立未见语料。

## 两个失败怎样修复

**英文窄位置长句：** 首轮 `I could find around the house` 是6词，生产实际48.09px，两行；缩到390px宽显示后仅14.65px。尽管无溢出、稳定1.67s，仍低于本次18px阅读预算，readingCheck失败。Agent把强调改成同一句已说出的 `anything`，没有改原声音或单词时间。当前实际73.5px，390px下22.39px，生命周期0.58–2.38s，稳定1.67s；`my mom` 与 `calculator` 同样22.39px。该修改证明“窄位需提炼有意义短重点”的应用路径，**不证明原6词从句已经适配**。原失败83分保留。

**中文片尾退场：** 首轮最后重点 `一起确认结果` 在10.82s开始，保持请求被媒体边界截到12.3454s；淡出开始12.3054s，实际370帧的末编码帧却是12.300s。虽阅读预算数值通过，最后一帧仍亮字，退出失败。不能用编译结果末关键帧opacity=0代替实际视频检查。

返修只把重点选为原完整动作 `结束前一起确认结果`，沿用原已测词时间，事件10.12–12.2s。实际64.5098px，390px下34.94px，单行，稳定1.95s；12.1667s真实编码帧覆盖淡出，12.2s及后为空。没有延长音轨。相邻的 `及时沟通` 因下一事件提前，在10.12s结束，稳定段从1.67s缩为1.15s，仍大于本次0.9s预算；逐帧未见两层文字重叠。

长中文 `写下负责人和完成时间` 实际输出10字，按“写下负责人 / 和完成时间”两行，61.875px，390px下33.52px，稳定2.13s。首轮brief写11字符是将源句标点计入；最终画面没有标点，应按10字描述。

返修前后两组成片完整解码为16kHz双声道s16le PCM，其各自哈希完全相同；源SHA及生产words与库内测得词也已核对。音频技术一致性不是试听认证。

## 画面检查与剩余扣分

当前三例共10事件、624张390px连续帧；含保留失败版本共17事件、1,024张连续帧。已亲看全部局部逐帧联系表和每事件8张全幅阶段图（共136个阶段图条目，部分边界重复取帧）。全文件解码通过。这是逐帧检查，未连续播放、未试听，不等同实时节奏或手机实机验收。

| 当前样例 | 390px实际显示字号 | 稳定阅读段 | 主要限制 |
| --- | --- | --- | --- |
| Deborah返修3词 | 均22.39px，单行 | 均1.67s | 长从句失败；角落短强调视觉层次仍基础 |
| Alex3概念 | 27.42 / 23.39 / 27.42px，单行 | 均1.67s | 黑色文字带长期占位，无词时留空，画面割裂尚未修复 |
| 中文返修4词 | 44.69 / 33.52 / 44.69 / 34.94px；第二词两行 | 1.67 / 2.13 / 1.15 / 1.95s | 黑底样本不能代表复杂真人背景，材质层次基础 |

所有当前事件按实际glyph加描边、1.06倍峰值验证画布及人工保护区域；无越界/遮挡。Deborah保护矩形(.38,.05,.60,.95)覆盖人物脸身手；Alex保护上部完整原图。生产测量marker/version=1、`producer=production-scene-exporter`、`droppedRecords=0`；每条measurement.source.elementId能对应实际text，outputSha256与实际MP4一致。原生无父组、稳定scale=1，显示字号按实际布局字号×390/画布宽计算。

三例 `readingCheck=passed` 和退出帧覆盖通过，只支持这些精确输入；不能据此覆盖原英文失败或授予90分。编译scenes与独立样例工程scenes完全一致，结构可编辑；本轮未新增浏览器面板选中、拖动、撤销验证。

## 版本与可恢复记录

原生definitionHash：`d214938332559df38bbebbd717003b3ad2329c58c5e2fa2d2a9637f248604ef8`。

首轮系列：`style-review-series-623444fd282fb54126af6095b50b0b512f56a12d17ac1c885483244c21697c59`（83）。

返修系列：`style-review-series-4b0d59a659abb08857758fa28c5489abb547afbc16d9d6788a764cf53ad4d1e1`（87）。

| 案例 | 批次，均item0/fixture0 | MP4 SHA256 |
| --- | --- | --- |
| deborah | `production-54518995414869555948d8c2d00b6b3b` | `4f4a14287b7c634661980c5d0f321237e38eb982ca58049f36f5530583bfa1a7` |
| alex | `production-837a95465800c9a09c9759329cb690f1` | `93aa9c0f4d97da00015a7c248acb51c2cba31c32f7b00f811a98ab5cac6a88d1` |
| chinese | `production-ac0e7cc51468d2c7643a030f8fb28415` | `c5ce1633991e6a85b4a40dab0f72ceee960c945a196070a245ad66444b32d5d9` |
| deborah-refined | `production-f552d883d15e3456911fffc5ef06f065` | `f3600c33731bab41e13f97950127df3bf963fd94cb5d963cb6423671b98e8459` |
| chinese-refined | `production-17e5f1385aa59cf6217d9a62ad1f9057` | `19a90cb28d28f882f1fed1a054e0e9da5db49c151e0770b12bde930ce1b3eaa3` |

三个历史context为 `cyan-generalization-deborah-20261008`、`cyan-generalization-alex-20261008`、`cyan-generalization-chinese-20261008`。已保存3基线＋3首轮＋2返修，共8条，回读全部restorable=true，未执行恢复。基线没有导出，不伪装为失败成片；首轮与返修完整输入快照均保留，支持恢复关键词标注变化。

证据目录：`/Users/zhengwei/Downloads/cyan-generalization-20261008/`。`verification.json`保存5份实测，`refined-audio-comparison.json`保存完整PCM一致性，`history-verification.json`保存8条回读，`review-series-*-request/receipt.json`及readback保存原生评审。网页链接存在性已核对，未做浏览器页面验收。

## 下一步仍需完成

- Alex黑带应改为更自然的当前应用构图，保持太阳图示、手势、人物完整，再重新生产评审；不能靠提高分数结束本轮。
- 加入中文真人复杂背景，以及英文长从句的可行摆放或有依据的降级策略；单纯换短词不算长句适配完成。
- 将“最后实际编码帧是否覆盖退出”作为成片验证依据；本轮是Agent端证据检查，尚未把它变成生产服务的自动拒绝规则。
- 做实时视听、面板编辑和更多未见语料验证；保持当前listened=false、aestheticQualityVerified=false，不覆盖原失败。

## 原画面直接叠加返修（2026-10-08，当前系列89）

[查看两份新成片、阶段图和全部局部帧](/Users/zhengwei/Downloads/cyan-generalization-20261008/direct-overlay/review.html)。本轮冻结 r3，原生定义前后完全相等；仅改变单次 Application 与已有对齐词上的强调范围。新系列 `style-review-series-1d07ac6ea4b0da5ef701155b67eb0890d7bfcff9105a8285ab0721ea12f9f501`，**89 / 89 / 89，最差89**，回读 `current=true/evidenceCurrent=true`。前文83、87分系列及失败不覆盖。未达到90，未连续播放或试听，最终审美仍false。

- **Alex：** 移除240px下黑带，输出回到1280×720。原视频仍scale=1、零裁切，原始1280×720图像完整保留；居中坐标由960高画布的y=-120变为720高画布的y=0。选择已有原词 `June`、`sun`，右上空处center(.87,.17)、scale1.05、headline宽.20、保持请求1.25s。实际字号78.75px、390px显示23.99px，稳定阅读1.12s。太阳与人物/手势保护区在1.06峰值下均无重叠。修复了旧版黑带在无词时留空、画面割裂的问题；未证明长英文概念可以容纳在这个位置。
- **Deborah：** 原1280×720视频构图完全不变。保留`anything`、`calculator`，去掉本次语义价值较低的`my mom`强调；center(.19,.22)、scale1.1、宽.32、保持请求1.8s。实际82.5px、390px显示25.14px，稳定1.67s；两个短重点比之前三个重点更稀疏、清楚。原六词长从句失败仍保留，不把删词视作长句适配完成。
- **中文：** 完全复用上一轮4事件应用、成片SHA及89分评价，保留10.12–12.2s片尾完整动作和实际编码退出检查；没有重新生产或改变原音轨。

两份新成片共4事件、206张390px连续局部帧、32张全幅阶段图条目，已查看各事件阶段与局部运动联系表。字体、行数、源元素ID、关键帧时钟、glyph加描边峰值、成片SHA、marker1、无丢失测量及可编辑scenes均核对；readingCheck均passed。两个修复前后成片各自解码为16kHz双声道PCM，字节数及SHA完全一致。此处PCM一致只证明没有改变音轨，不等同听感验收。

| 新样例 | 批次 | MP4 SHA256 |
| --- | --- | --- |
| Alex直接叠加 | `production-c6c7eb68135b7b7d1a6ff74721b1b33f` | `6ee731add6dce1b0bfe427adb26563e4b2333097c7d3bf48fc92a2ca1189f05b` |
| Deborah稀疏大字 | `production-8132819d45d2f46e59a2f9720509d58f` | `9bf6b9b78d495d5b2d5b1f79172143c4251dd68474e44d0e75ed3169042d29a6` |

新增history context `cyan-direct-alex-20261008`、`cyan-direct-deborah-20261008`，各保存旧应用/内容基线与当前修复，四条回读均restorable=true，未执行恢复。历史状态`sourceFilesVerified=false`保留；本轮源文件另经verifier读取校验SHA及原词，不能把它改写为历史服务已验证源文件。

当前改进仍是已用输入的返修，非未见输入泛化测试。青色纯色字的材质层次、40ms退出在真实播放中的感受、字体fallback身份、中文复杂实拍与英文长从句适配仍需完善；也未新增面板交互验收。没有改模板规则去记忆演员或关键词。本轮Application策略由Agent根据画面选择，不能把短词成功解释为任意文案自动适配。

证据：子目录`direct-overlay/`中的`verification.json`、`audio-comparison.json`、`source-framing-comparison.json`、两份`history-readback.json`及`review-series-request/receipt/readback.json`。HTML为本地证据索引，本轮未做浏览器验收。
