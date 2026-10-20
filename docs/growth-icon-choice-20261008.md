# 增长族：图标与花字的选择验证

2026-10-08。沿用既有 `style-study-20260929-bold-growth` r2 图标与 `style-study-20260929-growth-headline` r3 花字，不修改两份 Definition，也没有新增样式方向。正常生产五份同源对照：三份图标，另两份花字原样控制。

**独立图标系列最低88分；没有整体达到90。** Creator 图标90、Mentor图标89、长中文黑底图标控制88。原花字系列最低82的失败完整保留，不能将图标替代的结果描述为花字r3已修复。`listened=false`、`continuousPlayback=false`、`aestheticQualityVerified=false`。

证据页：[本地review.html](/Users/zhengwei/Downloads/growth-icon-choice-20261008/review.html)。逐案请求、正常worker回执、MP4、测量、原生工程回读与历史载荷均在同目录。

## 精确结果

| case | 实际输出 / 事件 | 内部评分 | 定型或阅读证据 | 选择结论 |
| --- | --- | --- | --- | --- |
| Creator图标 | 544×960；5.66–6.72s | 90 = 23/23/18/17/9 | 图标定型PTS跨度0.733333s；填色柱实际宽10–12显示px；文字N/A | 原片已有“为啥小达人／突然崛起”大字，三柱取消重复小花字、不挡脸/麦克风/主文案。仍需判断是否需要第三视觉焦点 |
| Mentor图标 | 1280×720；4.94–5.89s | 89 = 22/23/18/17/9 | 图标定型0.633333s；填色宽7–9显示px；文字N/A | 浅墙空位清楚，但缺少“go forward”文字提示，推荐花字控制 |
| 长中文图标 | 720×720；0–3s | 88 = 21/23/18/17/9 | 图标定型2.7s；填色宽14–16显示px；文字N/A | 黑底单独三柱过稀，不是完整字幕表达；只作几何/动效控制，推荐花字 |
| Mentor花字原样控制 | 1280×720；4.94–5.89s | 原对应应用90；本轮未另立评审系列 | 新4姿态记录；稳定0.700s / 预算0.70s；390宽字号20.1825px | 保持.95s，早于5.94s下一段否定句。全片decoded RGB与旧90分成片一致 |
| 长中文花字原样控制 | 720×720；0–3s | 原对应应用90；本轮未另立评审系列 | 新5姿态记录；稳定2.800s / 预算2.20s；390宽字号38.87px | 保留“让每一次积累变成真正的成长”13字两行。全片decoded RGB与旧90分成片一致 |

分项顺序为构图25、动效25、素材20、适配20、编辑性10。两种实拍背景加一个既有本地TTS黑底；同源五输出不是五种新输入、不是五种背景。图标稳定时长不是文字阅读预算，三个图标应用的文字门禁明确为 `not_applicable`，也没有重新识别或测量原片已烘焙文字。

图标系列：`style-review-series-e8ee2b5ebd24e309a0998f4f72f86c2ce1d40e1cc33d240fe1b719749be67d56`，回读 `current=true`、`evidenceCurrent=true`、`total=88`、`meetsInternalThreshold=false`。Creator个案内部阈值通过不等于最终审美验收。

保留的花字系列：`style-review-series-7528328869e127ce437755188058dfe8ad80e44be187e65d3b275811d9079cee`，最低82。包括Creator重复花字82、Mentor初案侵入否定句85、修正.95s保持90、中文黑底90；本轮没有删除失败、覆盖旧分数或混合两个资产身份。

## 生产与可恢复性

| case | 正常生产batchId | 可编辑工程 |
| --- | --- | --- |
| creator-icon | `production-392d79d822a291b05beec8a670aa8986` | `tpl-preview-b82793e3b3842831971ed4973c0b4cc6-0-0` |
| mentor-icon | `production-ff3ca643e96797c80aaeb3161a15310c` | 见 `mentor-icon-verification.json` |
| long-icon | `production-62ec177778c3cb63317564bec61a51d8` | 见 `long-icon-verification.json` |
| mentor-headline | `production-ff9c5649ad1c38c3a3e148f9a0d18cf8` | 见 `mentor-headline-verification.json` |
| long-headline | `production-b5b88fb950c47d995eb58c7814073436` | 见 `long-headline-verification.json` |

五份全走 `/production/author` → 正常worker → published。真实MP4全文件解码；SHA与preview和measurement附件相符；原source SHA、当前transcript revision及词内容/时间、Sample、语义注解、原事件范围不变；解码PCM与对应旧成片逐字节一致。原声音没有拉伸或补长，原参考工程未改动。

三个图标各一个原生父容器、九个原生矩形叶层，无生成文字。三柱保持共同基线、递增高度、红橙黄填色、深边和奶油边；各柱约161/191/220ms定型、60ms淡出，scaleY与positionY补偿仍独立可编辑。当前磁盘项目scenes/settings与本次冻结fixture逐字段一致；不将结构回读说成本轮浏览器属性面板实操完成。

三份精确图标Application存入独立context，并通过原生restore实际返回载荷核对：投影Template精确相等、Sample仅规范化可省略空字段后相等、Application和完整提交相等，`restorable=true`。restore先备份同样的当前载荷，不覆盖项目。历史ID：

- Creator：`application-47db48dc32560519d550fc5f2df56551695500eb438462e9373d473579e40278`
- Mentor：`application-53bc0922c67b4b12ecf91b633a5a93ddb5078a21a733e3f75e079ec65312ab6b`
- Long：`application-b5a71d204f10cb3c7a1868aecae0c0b25c10f7713d69ffb811bcbd362c9f97e7`

实际人物位置、scale、center、画幅与保持时长属于Application；词范围与语义属于原Sample。没有把这些case坐标写成全局默认规则。

## 几何和审片范围

五份fixture与measurement均使用 `constant_record_pose_v1`，零丢弃。三个图标的 `sampled/records=[]` 是真实空结果；两花字4/5姿态记录覆盖全部稳定decoded PTS，逐段核对当前文字布局、叶层/祖先组姿态，没有复用第一条测量当作全段依据。

图形几何按实际compositor规则计算：512px原始图形源先contain到 `min(canvas.width, canvas.height)`，再应用原生叶层变换。三父组已断言恒等变换且无变换动画。三图标所有事件可见帧的保守矩形包络在画布内；固定的脸/耳机、躯干/手、麦克风与原花字保护区未缩小且零相交。每个定型帧实际编码图像的三柱填色存在并测得上述像素宽。像素检查证明呈现和粗细，不是审美自动打分。

提取292张390px宽连续帧。实际目视五份全幅稳定图、相同PTS原/旧/新对照及联系页所列入口、定型代表、保持代表、退场和前后帧；Creator另看4张分段全幅时序页。根Agent独立查看Creator原/旧花字/新图标同PTS与入退场，Mentor和long时序；两花字控制另核对RGB与已看旧正例一致。详细文件在 `visual-inspection.json`。

没有声称292张中间稳定帧全部逐张人工查看，未连续实时播放或试听；PCM相同不等于已听过。390px缩图不是实体手机测试，文字fallback字体身份未确认。图标不含文字也不表示其替代了字幕。

## 可复用的Agent选择规则

1. 先确认正向增长/积累/进步语义；数量比较、反讽、否定不是自动触发。原Alex无增长语义负例继续保留。
2. 原片已有强主文案时，优先比较独立图标与不叠加；不要再生成第二处同义小字。图标依然可能多余，不能把“有主文案”写成必加规则。
3. 原片没有相应文字、短语需要明确表达且有阅读时间时，优先花字。图标无阅读预算不能成为删掉关键信息的理由。
4. 样式运动参数保持通用；Agent在Application里调整大小、位置、行宽与本次保持，尊重人物/原文案保护区。时机由源词事件驱动，不写死模板时间轴。
5. 保持时长受下一语义边界约束。时间不足时减去重复呈现、另选更简单样式或跳过；不得延长到相反语义、压缩原词或降低预算凑通过。
6. 三柱仅为定性装饰，不附会真实数值比例。本轮选择由Agent完成并有同源成片证据，尚不是自动场景识别或自动候选选择算法的验证。

下一步应保留花字/图标两种应用入口，并在新的真实增长输入上检查这套选择规则；本轮仍不足以证明该方向普遍90分。
