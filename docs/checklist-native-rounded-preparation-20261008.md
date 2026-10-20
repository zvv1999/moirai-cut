# 清单 r5 原生圆角精简准备

当前只准备离线候选，不提交生产、不保存资产、不修改共享源码或当前 r5。原服务读取的 `style-study-20260929-checklist-headline` r5 冻结在 `/Users/zhengwei/Downloads/checklist-native-rounded-20261008/frozen-r5.json`。

## 转换

`convert.py` 可重复运行，仅读写实验目录。以正式 r5 的实际图层为依据，检验每组各片 binding、timing、motionTiming、motions、z、intents 及颜色/描边一致后合并：

- shadow、edge、paper 三组各六片，合并为三个原生圆角矩形。
- clip-edge、clip-gold、clip-slot、line-0、line-1、line-2 六组各三片，合并为六个原生胶囊矩形。
- 正文、三个圆点、六个勾原始图层逐字段保持，root 分组及共享动效保持。

叶子总数从46减为19。合并区域由旧片region并集确定，沿用原核心片的文字依附、gap、offset、followMotion及时间。原始定义保留；`conversion-map.json`逐组列出来源、新region与理论圆角半径，`conversion-invariants.json`列出未改字段。

新字段按拟部署契约 `rectangleGeometry.cornerRadius`，取实际矩形短边的百分比0..50。阴影/外沿为7.65228%，纸面5.05561%，六胶囊均50%。这在原720方形定义上保持理想外轮廓；不声称抗锯齿、旧片拼缝或跨画幅渲染像素等价。

## 冻结验收输入

从 `/Users/zhengwei/Downloads/checklist-r5-formal-20261008/` 复制 square、mentor、sudha、planning 四份正式 Application 与原 Samples，assetRevision 仍5，不调整字宽、位置、时间或source。原有reading-diagnostic请求和预算定位保存在 `frozen-four-applications.json`。候选保留revision5是未保存比较输入，不代表已发布新版本。

待root确认原生 schema、compiler 与 region真实aspect 支持已部署，再走正常候选投影及标准生产。禁止手改编译文档来模拟圆角。

实际验收包括：原/候选同runtime对照，源词/事件/PCM一致；正文原18px@390、最多两行和原阅读预算不变；最后勾180ms成形后保留原识别预算，60ms整体退出；查看入场/稳定/退场的外沿、纸面、夹扣及横线接缝，检查横竖画幅是否变形；工程可编辑19叶、历史r5仍保留46叶。保存/升版/评分须在实际出片和root独立审查后进行。

当前产物只有转换脚本、候选JSON、映射、冻结输入与验证计划，不是视觉通过证据。
