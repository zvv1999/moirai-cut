# 地球科普 r4：通用形体提升与原应用回归

2026-10-08。`style-study-20260929-globe` 已保存 revision 4。先做未保存候选与 r3 的同源同尺寸导出对照，实际看帧后采用，再回归原两个横屏和方形失败案，额外做一次方形 Application 返修。当前内部分数 **90 / 89 / 84 / 87**，系列最低 **84**，未达90目标。90分横屏仍有正例背景覆盖阻断；全部 `listened=false`、`aestheticQualityVerified=false`。

## 定义提升与能力边界

检查61项素材库，没有现成地球/行星素材。现有模板原生图形支持纯色椭圆、描边、图层运动和复合组；未为了单个地球引入渐变或地理专用逻辑。本轮把六层平面图形改为十四个可独立编辑的椭圆：深部、中间调、左上亮部、细经纬线、薄轮廓和受控高光。经线保留展开关键帧，所有部件保持整体轻弹与独立语义事件退场。更新可移植定义 `scripts/templates/seeds/globe.json`，与本地r4除导入revision为0外一致；旧seed备份于候选证据目录。

没有大陆、国界、真实轴倾角或科学比例；深浅盘面只是设计层次，不是物理光照模拟。它仍是地球/全球/空间观察的定性图标，不能替代有来源科学图解。定义没有NASA台词、演员、词下标或case绝对时间。

候选对照批次 `production-82d53134ed55cad9e1b36ba6d073292d`：同一John原片、原词和1.2秒窗口、1280×720、scale .46与center(.89,.27)。未保存候选按明确应用几何创作一次性对照模板；保存后再由**原生 Application**完整重建，逐字段比较与已看候选相同（仅允许模板id/revision和4ULP浮点往返差异），不是把临时画面修改当成可重建样式。

实际查看候选首事件全段局部连续帧、稳定帧与第二事件8阶段全幅图；同尺寸约67px图标下，明暗球面和细线比r3层次清楚，没有靠放大或换位置掩盖问题。对照两份原声PCM一致。未连续实时播放或试听，候选不继承r3分数。

## 生产与应用比较

| 应用 | r4批次 | 实际成片 | 内部分数 |
|---|---|---:|---:|
| john-landscape | `production-7e7206a993a69fe8805b1aa052a6cdf4` | 2 | 90 |
| alex-landscape | `production-46c3afd23a0ae947c2525b9ae39f6a11` | 1 | 89 |
| john-square | `production-c6898e08a838e367791f48b290ecb4d0` | 1 | 84 |
| john-square-refined | `production-b2948eedd18c1f6b4c453a077c58c70d` | 1 | 87 |

原John/Alex横屏及John方形 Application 仅revision从3变4，位置、大小、原声、词时间、1.2秒保持和语义选择完全不变。方形返修属于本次应用：`videoRegion`改为全画布、`blurredBackground=true`，完整16:9原片居中，图标scale .28、center(.83,.11)置于上方背景带。前景原NASA标识、脸和手势保留；没有把这些坐标或裁切策略写回定义。

方形旧案约133.85px图标仍悬在下部大黑区，造型改善没有解决割裂，保留84失败。返修约72.07px图标加模糊背景，比黑底连续，但上下重复模糊人像与横条分区仍明显，只给87。两方形用同一John，不计为新的输入或背景。两个正例人物同属NASA布景；CDC植物房只作无地球语义负例，不能冒充明亮背景正例。

## 核验

5份实际MP4全部published，完整FFmpeg解码通过。源文件SHA与入库记录、当前transcript、编译words逐字段一致；输出SHA=previewSHA=textMeasurements.outputSha256。全部marker1、sampled、droppedRecords0，无text所以records为空，不作为文字测量通过证据。

共7个正向事件，每事件14个可编辑ellipse叶和独立复合组；阴性0个。组和成员开始/结束一致、timeOrigin正确，经线0.20秒稳定、组1.14秒起退、实际1.2秒，稳定0.94秒，末opacity=0。当前独立工程scenes/settings与冻结编译一致。手工保护矩形的native advice均选中当前方案；它只验证给定几何，不代表自动看懂或像素碰撞证明。

5份新输出的解码PCM与对应r3输出逐一相同，所有事件窗口相同；方形返修仅改变画面Application。原3个context沿r3记录追加r4基线/检查，方形上下文保留原失败和返修的完整快照，最后head为返修。4份检查记录回读restorable=true，没有执行工程恢复或覆写其他工程。

实际查看范围保存在 `visual-review-log.json`：John首事件稳定帧与整段局部帧、第二事件全幅阶段；Alex整段局部帧与全幅阶段；原方形首稳定帧/第二事件阶段；返修方形首稳定帧/整段局部帧/第二事件阶段；负例首中末。没有声称检查全部提取图或连续实时播放。

原生系列 `style-review-series-152df75f1770dabe97a7c05bf9da61d1bdda31704fcd79fe67d8ab8e2d8e6174`，保存后回读current=true/evidenceCurrent=true，最低84；r3系列现在current=false/evidenceCurrent=true，保留历史。未通过项包括独立明亮复杂背景、未参与调参的新输入、中文地球语义、字幕组合、短事件/小尺寸边界与完整视听。方形返修还需继续构图设计。

证据入口 `/Users/zhengwei/Downloads/globe-r4-generalization-20261008/review.html`；候选比较 `/Users/zhengwei/Downloads/globe-r4-candidate-20261008/review.html`。报告本地链接全部存在。未重启服务，未改主账本，不把本轮改善标为整体目标完成。


## 后续方形返修（2026-10-08）

本页84/87保留为历史。十四层r4冻结后又完成两个单幅Application：focal.66因新增切手保留89失败，focal.61修复侧缘手势但残缺标识仍在，当前方形89。当前推荐横屏90/89+新方形89，最低89，未达90；没有新增独立输入/背景，未试听。详见 [方形构图返修](globe-square-framing-20261008.md)，全部旧成片/系列/应用历史保留。
