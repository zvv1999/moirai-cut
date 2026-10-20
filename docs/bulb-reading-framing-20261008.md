# 灯泡花字 r4：真实阅读测量、构图与退场返修

2026-10-08。已保存 `style-study-20260929-bulb-headline` r4；当前系列 **横屏90、竖屏89、方形90，最低89**，未达到整组90分交付。系列 `style-review-series-ae75268457aa4e95257d02c2cc6fd95ec6e113c537ea2d1c6d1f8b3ae57041fa` 回读 `current=true/evidenceCurrent=true`；未连续播放、未感知试听，`listened=false/aestheticQualityVerified=false`。

证据入口：[对照页](/Users/zhengwei/Downloads/bulb-reading-framing-20261008/review.html)。这是 Sudha 与 Liz 两份既有输入的同源返修，不算新人物或盲测。

## 先补实际测量，再改应用

原 r3 三案原样通过标准生产重渲染，取得 `textMeasurementContractVersion=1` 和实际 `textMeasurements`。不把模板参数、像素包围盒或零溢出当作实际字号或审美通过。

| 当前应用 | 原字号/行数 | r4实际字号/行数 | 390px宽等效字号 | 稳定PTS跨度/本次预算 | 分数 |
|---|---|---|---|---|---|
| Sudha横屏 | 46.2px / 1 | 60.48px / 2 | 18.43px | 1.633s / 0.95s | 90 |
| Sudha竖屏 | 67.2px / 1 | 50.4px / 1 | 27.30px | 1.633s / 0.95s | 89 |
| Liz方形 | 54.6px / 2 | 46.2px / 2 | 25.03px | 2.367s / 1.80s | 90 |

本次以390px播放器上18px等效字号、最多两行为关键词阅读预算。横屏旧案实际14.08px未通过；新横屏增大整体并让 `thought process` 按词换成两行。内容短语提示在放不下时允许换行，未插入硬换行或改写原文。另两案空间/时长预算通过也不自动获得90分。

时长证据来自编译后恒定变换/不透明区间与实际MP4解码PTS的交集，取首末稳定采样点之差；未把入场、淡出或下一帧空档计入稳定阅读。具体预算由Agent针对本次短语提出，不是自动测得的通用阅读速度。测量中的首帧transform不是稳定帧transform；手机字号按已核对的稳定scale=1换算。`fontIdentityVerified=false`，未核实字形回退身份。

横屏保持完整原画面，scale `.55→.72`、行宽`.30→.32`。竖屏去掉重复模糊人像，原片完整高度铺到上76%，焦点`.66`，其余为花字带；左右肩和环境有裁切，已看原片及事件手势。方形改完整高度的单幅画面、焦点`.64`，将字叠在下部衣服区域；触发期间无举手遮字，后续动作时图文已退出。

竖屏仍有永久24%黑带和孤立字图，像分屏字幕卡，是当前89分及明确阻断项，不能用“去重人像”掩盖。方形花纹衣服与项链增加视觉干扰，保留扣分；未声称任意素材都适合底部叠字。

## 通用退场缺口与r4

r3固定30ms淡出。在Sudha实例 `2.20–4.00s` 中，淡出从3.970s才开始，最后有效帧3.9667s仍完全不透明，下一帧直接消失；Liz的非整帧结尾则能采到一帧。实际尾帧对照确认了这个跨事件相位缺口。

先用两份同源成片对比60ms候选，再保存r4。唯一视觉定义变化为整组 `exitSeconds=.06`，增加显式 `coverage={minExitFrames:1,minPostFrames:1}`；原17个叶层、造型、颜色、字体和80ms入场不变。指南补充小屏预算、裁切边界与证据范围，未把人物坐标/词下标写入模板。可移植种子 [bulb-headline.json](/Users/zhengwei/code/moirai-cut/scripts/templates/seeds/bulb-headline.json) 已更新，旧种子留在证据目录。

r4正式导出的实际PTS分别读取到退场帧 **1/1/2**，结束后帧 **120/120/354**；预检与实测分开保存。逐帧看到灯泡与文字一起淡出、邻接后帧无残留，但原生记录 `pixelDisappearanceVerified=false`，未把PTS采样通过冒充自动像素消失或最终审美验证。

## 生产、验证与历史

| 当前r4应用 | 标准生产批次 | 独立可编辑工程 |
|---|---|---|
| 横屏 | `production-2c8de575d7156fa3275baf9b8e306ff7` | 见对应 `item.json.fixtureProjects` |
| 竖屏 | `production-8d3327a9f07e8327e4fb32328aebfecf` | 同上 |
| 方形 | `production-c17957cb06bfce6c20a2d944eb4292d6` | 同上 |

本轮共11份实际MP4：3份原案测量基线、3份r3应用返修、2份退场候选、3份已保存r4回归。所有标准生产均已终态，无在途渲染；每份核验marker1、文件SHA、预期文字身份/分组时钟、零丢记录及全解码。r4实例的场景/settings与冻结编译相同，保存版Application等于生产设计；本轮未改参考工程。

原ASR词和时间保持逐字段相同，Sudha仍2.20–4.00s，Liz仍3.64–6.18s。同一源的基线/返修/候选/r4解码44.1kHz立体声PCM哈希相同，仅证明版本间音轨一致，不替代试听。分别查看事件前后完整逐帧、每0.5s整段样本和390px稳定图；图集标注来自解码PTS，未把fps重采样的输出编号当原始精确时刻。

旧88/87/89系列和失败成片保留，因样式升级 `current=false/evidenceCurrent=true`。本轮15条历史快照均原样回读：r4的9条当前可恢复；r3的6条因`style_revision_changed`当前不可直接恢复，不能宣称全部可恢复。最早基线记录误写了旧目录的`preview.mp4`引用，已追加不可变补正记录指向真实`video.mp4`，错误原记录未篡改。

技术证据：[汇总](/Users/zhengwei/Downloads/bulb-reading-framing-20261008/verification.json)、[r4同源/投影/退场核验](/Users/zhengwei/Downloads/bulb-reading-framing-20261008/r4-cross-verification.json)、[当前评分](/Users/zhengwei/Downloads/bulb-reading-framing-20261008/review-series-readback.json)、[历史状态](/Users/zhengwei/Downloads/bulb-reading-framing-20261008/history-readback.json)。

下一步仍是竖屏的画面与花字整合、未参与调参的真人正例、连续观看及感知试听。当前最低89，不计入已完成的20款≥90。
